#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXIT,
  LAYOUT_V1,
  LOCAL_EXAMPLE,
  LOCAL_YAML,
  VERSION_FILE
} from './lib/runtime-filenames.mjs';
import {
  ArgError,
  loadHosts,
  resolveConfigRoot,
  selectHosts
} from './lib/host-config.mjs';
import { STAGES, resolveCommandPath } from './lib/host-paths.mjs';
import { isLinkTo } from './lib/agent-link.mjs';
import { migrateManifest, readManifestStrict } from './lib/manifest.mjs';
import { listInstallations, loadLedger, resolveRegistryRoot } from './lib/install-registry.mjs';
import { isMain } from './lib/is-main.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');

function summarize(dest, items, manifest) {
  const failed = items.filter((item) => item.status === 'fail').length;
  const warned = items.filter((item) => item.status === 'warn').length;
  const passed = items.filter((item) => item.status === 'pass').length;
  return {
    agentDir: dest,
    host: manifest ? manifest.host_key : '',
    passed,
    failed,
    warned,
    ok: failed === 0,
    items
  };
}

export function checkDir(dest, cfg, opts = {}) {
  const items = [];
  const add = (name, status, detail = '') => items.push({ name, status, detail });

  const probe = readManifestStrict(dest);
  if (probe.error) {
    add('manifest', 'fail', probe.error);
    return summarize(dest, items, null);
  }
  const manifest = migrateManifest(probe.manifest);
  add('manifest 存在', 'pass', VERSION_FILE);
  if (manifest.layout === LAYOUT_V1) {
    add('manifest.layout', 'warn', 'v1 清单，建议 helm-workflow upgrade 迁移');
  }

  if (opts.hostKey && manifest.host_key && manifest.host_key !== opts.hostKey) {
    add('manifest.host_key', 'fail', `${manifest.host_key} != ${opts.hostKey}`);
  } else {
    add('manifest.host_key', 'pass', manifest.host_key || '(空)');
  }

  if (!manifest.payload_root) {
    add('manifest.payload_root', manifest.link_mode === 'copy' ? 'warn' : 'fail', 'null');
  } else if (!fs.existsSync(manifest.payload_root)) {
    add('manifest.payload_root', 'fail', manifest.payload_root);
  } else {
    add('manifest.payload_root', 'pass', manifest.payload_root);
  }

  // 逐项检查 manifest 声明的受管项（缺陷 21）
  for (const rel of manifest.managed_dirs) {
    add(`dir ${rel}`, fs.existsSync(path.join(dest, rel)) ? 'pass' : 'fail', rel);
  }
  for (const rel of manifest.managed_files) {
    add(`file ${rel}`, fs.existsSync(path.join(dest, rel)) ? 'pass' : 'fail', rel);
  }

  const host = cfg.hosts[manifest.host_key] || (opts.hostKey ? cfg.hosts[opts.hostKey] : null);
  if (!host) {
    add('宿主定义', 'fail', `未知 host_key: ${manifest.host_key}`);
  } else {
    // 单一推导：命令路径只能来自 resolveCommandPath
    for (const stage of STAGES) {
      const rel = resolveCommandPath(host, stage);
      add(`stage ${stage}`, fs.existsSync(path.join(dest, rel)) ? 'pass' : 'fail', rel);
    }
    for (const check of host.checks) {
      const exists = fs.existsSync(path.join(dest, check.path));
      add(
        `host check ${check.path}`,
        exists ? 'pass' : check.severity,
        exists ? '' : (check.severity === 'warn' ? `可选产物缺失: ${check.path}` : check.path)
      );
    }
    if (manifest.link_mode !== 'copy' && manifest.payload_root) {
      const skillsDir = path.join(dest, 'skills');
      if (fs.existsSync(skillsDir)) {
        const names = fs.readdirSync(skillsDir);
        const linked = names.filter((name) => isLinkTo(
          path.join(manifest.payload_root, 'shared', 'skills', name),
          path.join(skillsDir, name)
        ));
        add('link 有效性', linked.length > 0 ? 'pass' : 'warn', linked.length > 0 ? `${linked.length} 个链接` : '未检测到有效链接');
      }
    }
  }

  add('配置示例', fs.existsSync(path.join(dest, LOCAL_EXAMPLE)) ? 'pass' : 'fail', LOCAL_EXAMPLE);
  const hasLocal = fs.existsSync(path.join(dest, LOCAL_YAML));
  add('用户配置', hasLocal ? 'pass' : 'warn', hasLocal ? LOCAL_YAML : `缺少 ${LOCAL_YAML}（首次安装会创建）`);

  return summarize(dest, items, manifest);
}

function resolveTargets(opts, cfg) {
  const cwd = path.resolve(opts.cwd || process.cwd());
  const homeRoot = resolveRegistryRoot({ env: opts.env, home: opts.homeDir });
  const rows = listInstallations(homeRoot);

  if (opts.agentDir) return [{ dest: path.resolve(opts.agentDir), hostKey: opts.target || '' }];
  if (opts.all === true) return rows.map((row) => ({ dest: row.agent_dir, hostKey: row.host_key }));
  if (opts.target != null && opts.target !== 'auto') {
    const keys = selectHosts(cfg, opts.target, { requireReady: false, cwd, ledger: loadLedger(homeRoot) });
    return keys.map((key) => {
      const row = rows.find((item) => item.host_key === key && path.resolve(item.project_root || '') === cwd)
        || rows.find((item) => item.host_key === key);
      return {
        dest: row ? row.agent_dir : path.join(cwd, cfg.hosts[key].agentDir),
        hostKey: key
      };
    });
  }
  return Object.entries(cfg.hosts)
    .map(([key, host]) => ({ dest: path.join(cwd, host.agentDir), hostKey: key }))
    .filter((item) => fs.existsSync(path.join(item.dest, VERSION_FILE)));
}

export function runCheck(opts = {}) {
  const wantJson = opts.json === true;
  let cfg;
  try {
    cfg = loadHosts(opts.cfgRoot || resolveConfigRoot([PKG_ROOT]));
  } catch (e) {
    const exit = e instanceof ArgError ? EXIT.ARG : EXIT.SOURCE;
    if (wantJson) console.log(JSON.stringify({ ok: false, command: 'check', exit, message: e.message }, null, 2));
    else console.error(`[check] ${e.message}`);
    return { exit, results: [], message: e.message };
  }

  const targets = resolveTargets(opts, cfg);
  if (targets.length === 0) {
    if (wantJson) console.log(JSON.stringify({ ok: false, command: 'check', exit: EXIT.CHECK, results: [], message: '未找到任何安装' }, null, 2));
    else console.error('[check] 未找到任何安装（用 --target / --agent-dir / --all 指定）');
    return { exit: EXIT.CHECK, results: [], message: '未找到任何安装' };
  }

  const results = targets.map((target) => checkDir(target.dest, cfg, target));
  const failed = results.reduce((sum, item) => sum + item.failed, 0);
  const warned = results.reduce((sum, item) => sum + item.warned, 0);
  const passed = results.reduce((sum, item) => sum + item.passed, 0);
  const exit = failed > 0 ? EXIT.CHECK : EXIT.OK;

  if (wantJson) {
    console.log(JSON.stringify({
      ok: exit === EXIT.OK,
      command: 'check',
      exit,
      results: { passed, failed, warned, items: results }
    }, null, 2));
  } else {
    for (const item of results) {
      console.log(`检查目录：${item.agentDir}（host=${item.host || '?'}）`);
      for (const check of item.items) {
        const label = check.status === 'pass' ? 'PASS' : (check.status === 'warn' ? 'WARN' : 'FAIL');
        console.log(`${label}  ${check.name}${check.detail ? `  → ${check.detail}` : ''}`);
      }
      console.log(`  ${item.passed} passed, ${item.failed} failed, ${item.warned} warned\n`);
    }
  }
  return { exit, results, passed, failed, warned };
}

if (isMain(import.meta.url)) {
  console.error('[check] 请通过 `helm-workflow check` 调用（scripts/cli.mjs）');
  process.exitCode = EXIT.ARG;
}
