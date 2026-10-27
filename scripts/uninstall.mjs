#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXIT,
  RUNTIME_DIR,
  VERSION_BACKUP,
  VERSION_FILE
} from './lib/runtime-filenames.mjs';
import {
  ArgError,
  loadHosts,
  resolveConfigRoot,
  selectHosts
} from './lib/host-config.mjs';
import { assertInside, listFilesRecursive, removeSurface } from './lib/agent-link.mjs';
import { migrateManifest, readManifestStrict } from './lib/manifest.mjs';
import {
  listInstallations,
  loadLedger,
  removeInstallation,
  resolveRegistryRoot
} from './lib/install-registry.mjs';
import { isMain } from './lib/is-main.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 自包含：优先 .helm-runtime 快照，其次同级 hosts.json，最后源码树 */
export function resolveUninstallConfigRoot(opts = {}) {
  if (opts.cfgRoot) return opts.cfgRoot;
  return resolveConfigRoot([__dirname, path.resolve(__dirname, '..')]);
}

function resolveParent(data, segments) {
  let node = data;
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (!node || typeof node !== 'object') return null;
    node = node[segments[i]];
  }
  return node && typeof node === 'object' ? node : null;
}

/** 先摘宿主 hooks / 配置引用；JSON 非法则返回 error，调用方必须中止 */
export function removeHostReferences(opts) {
  const { dest, host, warnings } = opts;
  if (!host || !host.hooks || !host.hooks.file) return { removed: 0 };
  const file = path.join(dest, String(host.hooks.file));
  if (!fs.existsSync(file)) return { removed: 0 };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    return { error: `宿主配置 JSON 非法，中止卸载以避免半删状态：${file}` };
  }
  let removed = 0;
  for (const entry of host.hooks.entries || []) {
    const segments = String(entry.jsonPath || '').split('.').filter(Boolean);
    if (segments.length === 0) continue;
    const parent = resolveParent(data, segments);
    if (!parent) continue;
    const key = segments[segments.length - 1];
    const list = parent[key];
    if (!Array.isArray(list)) continue;
    const needle = String(entry.matchContains || 'helm');
    const kept = list.filter((item) => !JSON.stringify(item).includes(needle));
    if (kept.length !== list.length) {
      removed += list.length - kept.length;
      if (opts.dryRun !== true) parent[key] = kept;
    }
  }
  if (removed > 0 && opts.dryRun !== true) {
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }
  if (removed > 0 && warnings) warnings.push(`[unref] 从 ${host.hooks.file} 摘除 ${removed} 条 HELM 引用`);
  return { removed };
}

function removalSets(manifest) {
  const files = new Set(manifest.managed_files);
  files.add(VERSION_FILE);
  files.add(VERSION_BACKUP);
  const dirs = new Set(manifest.managed_dirs);
  dirs.add(RUNTIME_DIR);
  return { files, dirs };
}

export function uninstallOne(hostKey, cfg, opts) {
  const warnings = [];
  const dest = path.resolve(opts.agentDir || opts.dest);
  const probe = readManifestStrict(dest);
  if (probe.error) {
    if (opts.allowEmpty === true) {
      return { host: hostKey, agent_dir: dest, exit: EXIT.OK, message: '无安装清单，跳过（--allow-empty）', warnings };
    }
    return { host: hostKey, agent_dir: dest, exit: EXIT.CHECK, message: `${probe.error}，未做任何删除`, warnings };
  }

  const manifest = migrateManifest(probe.manifest);
  if (manifest.managed_dirs.length === 0 && manifest.managed_files.length === 0) {
    return {
      host: hostKey,
      agent_dir: dest,
      exit: EXIT.CHECK,
      message: '清单缺少 managed_dirs/managed_files，拒绝删除（--allow-empty 可跳过）',
      warnings
    };
  }

  const host = cfg.hosts[manifest.host_key] || cfg.hosts[hostKey] || null;
  const dryRun = opts.dryRun === true;

  // 1) 先摘宿主 hooks / 配置引用
  const unref = removeHostReferences({ dest, host, dryRun, warnings });
  if (unref.error) {
    return { host: hostKey, agent_dir: dest, exit: EXIT.CHECK, message: unref.error, warnings };
  }

  // 2) 计算并执行删除
  const { files, dirs } = removalSets(manifest);
  const removed = [];
  const sortedDirs = [...dirs].sort((a, b) => b.split('/').length - a.split('/').length);

  for (const rel of files) {
    const abs = assertInside(dest, rel);
    if (!fs.existsSync(abs)) continue;
    if (!dryRun) removeSurface(abs);
    removed.push(rel);
  }
  for (const rel of sortedDirs) {
    const abs = assertInside(dest, rel);
    if (!fs.existsSync(abs)) continue;
    if (!dryRun) removeSurface(abs);
    removed.push(rel);
  }

  // 3) 收尾：清空目录 + 清单
  if (!dryRun) {
    for (const rel of ['skills', 'agents', 'templates', 'references', 'commands', 'workflow', 'prompts', 'rules', 'instructions']) {
      const abs = path.join(dest, rel);
      try {
        if (fs.existsSync(abs) && fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
      } catch {
        /* 非空或占用：保留 */
      }
    }
    // nested 布局会留下 commands/helm/ 空目录，逐层收掉
    for (const hostKey of Object.keys(cfg.hosts || {})) {
      const dir = (cfg.hosts[hostKey] || {}).commandDir || '';
      const nested = dir.includes('/') ? dir.replace(/\{cluster\}/g, (cfg.hosts[hostKey] || {}).cluster || 'helm') : null;
      if (!nested) continue;
      const abs = path.join(dest, nested);
      try {
        if (fs.existsSync(abs) && fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
      } catch {
        /* 非空：保留 */
      }
    }
    for (const rel of [VERSION_FILE, VERSION_BACKUP]) {
      const abs = path.join(dest, rel);
      if (fs.existsSync(abs)) removeSurface(abs);
    }
  }

  // 4) 诚实报告保留项
  const removedSet = new Set(removed);
  const kept = dryRun
    ? listFilesRecursive(dest).filter((rel) => !removedSet.has(rel))
    : (fs.existsSync(dest) ? listFilesRecursive(dest) : []);

  return {
    host: manifest.host_key || hostKey,
    agent_dir: dest,
    exit: EXIT.OK,
    removed: removed.length,
    unref: unref.removed || 0,
    kept,
    warnings,
    dry_run: dryRun
  };
}

export function runUninstall(opts = {}) {
  const wantJson = opts.json === true;
  const warnings = [];
  const homeRoot = resolveRegistryRoot({ env: opts.env, home: opts.homeDir });
  let cfg;
  try {
    cfg = loadHosts(resolveUninstallConfigRoot(opts));
  } catch (e) {
    if (wantJson) console.log(JSON.stringify({ ok: false, command: 'uninstall', exit: EXIT.SOURCE, message: e.message }, null, 2));
    else console.error(`[uninstall] ${e.message}`);
    return { exit: e instanceof ArgError ? EXIT.ARG : EXIT.SOURCE, results: [], warnings };
  }

  const cwd = path.resolve(opts.cwd || process.cwd());
  let targets = [];
  if (opts.agentDir) {
    targets = [{ dest: path.resolve(opts.agentDir), hostKey: opts.target || '' }];
  } else if (opts.all === true) {
    targets = listInstallations(homeRoot).map((row) => ({ dest: row.agent_dir, hostKey: row.host_key }));
  } else {
    let keys;
    try {
      keys = selectHosts(cfg, opts.target == null ? 'auto' : opts.target, {
        requireReady: false,
        cwd,
        ledger: loadLedger(homeRoot)
      });
    } catch (e) {
      if (wantJson) console.log(JSON.stringify({ ok: false, command: 'uninstall', exit: EXIT.ARG, message: e.message }, null, 2));
      else console.error(`[uninstall] ${e.message}`);
      return { exit: EXIT.ARG, results: [], warnings };
    }
    targets = keys.map((key) => {
      const row = listInstallations(homeRoot).find((item) => item.host_key === key
        && path.resolve(item.project_root || '') === cwd);
      return { dest: row ? row.agent_dir : path.join(cwd, cfg.hosts[key].agentDir), hostKey: key };
    });
  }

  const results = targets.map((target) => uninstallOne(target.hostKey, cfg, { ...opts, dest: target.dest }));
  for (const result of results) {
    if (result.exit === EXIT.OK && !opts.dryRun) {
      try {
        removeInstallation(result.agent_dir, homeRoot);
      } catch (e) {
        warnings.push(`账本移除失败（${result.agent_dir}）：${e.message}`);
      }
    }
  }

  const okCount = results.filter((item) => item.exit === EXIT.OK).length;
  const exit = okCount === results.length ? EXIT.OK : (okCount === 0 ? results[0].exit : EXIT.PARTIAL);

  if (wantJson) {
    console.log(JSON.stringify({ ok: exit === EXIT.OK, command: 'uninstall', exit, results, warnings }, null, 2));
  } else {
    for (const item of results) {
      console.log(`[uninstall] ${item.host || '?'}  ${item.agent_dir}  exit=${item.exit}`);
      if (item.message) console.log(`  ${item.message}`);
      if (item.removed != null) console.log(`  移除 ${item.removed} 项，摘除宿主引用 ${item.unref} 条`);
      if (item.kept && item.kept.length > 0) {
        console.log('  实际保留：');
        for (const rel of item.kept) console.log(`    ${rel}`);
      }
    }
    for (const warning of warnings) console.log(`  WARN  ${warning}`);
  }
  return { exit, results, warnings };
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opts = { target: null, agentDir: null, homeDir: null, location: 'local', dryRun: false, all: false, allowEmpty: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '-t' || token === '--target') opts.target = argv[++i];
    else if (token === '--agent-dir') opts.agentDir = argv[++i];
    else if (token === '--home') opts.homeDir = argv[++i];
    else if (token === '--location') opts.location = argv[++i];
    else if (token === '--dry-run') opts.dryRun = true;
    else if (token === '--all') opts.all = true;
    else if (token === '--allow-empty') opts.allowEmpty = true;
    else if (token === '--json') opts.json = true;
  }
  process.exitCode = runUninstall(opts).exit;
}
