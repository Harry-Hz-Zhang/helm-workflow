#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT, VERSION_FILE } from './lib/runtime-filenames.mjs';
import { loadHosts, readPackageVersion, resolveConfigRoot } from './lib/host-config.mjs';
import { globalAgentDir } from './lib/host-paths.mjs';
import { runInstall } from './install.mjs';
import { runCheck } from './install-check.mjs';
import { runUninstall } from './uninstall.mjs';
import { runUpgrade } from './lib/upgrade.mjs';
import {
  listInstallations,
  pruneStale,
  resolveRegistryRoot
} from './lib/install-registry.mjs';
import { readPayloadMeta, resolveHelmHome } from './lib/payload-home.mjs';
import { isMain } from './lib/is-main.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');

export const HELP = `helm-workflow <command> [选项]  （别名：helm-wf）

命令：
  install         安装 / 纳管宿主
  uninstall       按清单卸载
  upgrade         刷新表面或提升 payload
  check           校验安装完整性
  installations   列出已安装实例（账本）
  list            列出支持的宿主矩阵
  doctor          环境自检
  version         显示版本
  help            显示本帮助

通用选项：
  -t, --target <spec>     宿主名 / 逗号列表 / auto / all（默认 auto）
      --location <loc>    local（默认）| global
      --agent-dir <dir>   显式目标目录（优先级最高）
      --source-dir <dir>  源仓目录
      --home <dir>        共享真源根（默认 ~/.helm）
      --ref <ref>         记录 git ref
      --commit <sha>      记录 commit
      --no-link           表面一律 copy
      --no-home           不用真源，直接 copy
      --force             覆盖冲突 / 连带升级
      --dry-run           零副作用
      --all               作用于全部安装
      --json              机读输出
  -y, --yes               跳过确认
  -h, --help              显示本帮助

退出码：0 OK / 1 CHECK_FAILED / 2 ARG / 3 SOURCE_INCOMPLETE / 4 CONFLICT
        5 IO_ERROR / 6 NETWORK / 7 PARTIAL / 8 BUSY`;

const VALUE_FLAGS = new Map([
  ['-t', 'target'],
  ['--target', 'target'],
  ['--location', 'location'],
  ['--agent-dir', 'agentDir'],
  ['--source-dir', 'sourceDir'],
  ['--home', 'homeDir'],
  ['--ref', 'ref'],
  ['--commit', 'commit'],
  ['--agent-base', 'agentBase'],
  ['--cfg-root', 'cfgRoot']
]);

const BOOL_FLAGS = new Map([
  ['--no-link', ['useLink', false]],
  ['--no-home', ['useHome', false]],
  ['--force', ['force', true]],
  ['--dry-run', ['dryRun', true]],
  ['--json', ['json', true]],
  ['--yes', ['yes', true]],
  ['-y', ['yes', true]],
  ['--all', ['all', true]],
  ['--prune', ['prune', true]],
  ['--prune-legacy', ['pruneLegacy', true]],
  ['--apply', ['apply', true]],
  ['--allow-empty', ['allowEmpty', true]],
  ['--ready-only', ['readyOnly', true]],
  ['--reconcile', ['reconcile', true]]
]);

export function parseArgs(args) {
  const opts = {
    target: null,
    location: 'local',
    agentDir: null,
    sourceDir: null,
    homeDir: null,
    ref: null,
    commit: null,
    agentBase: null,
    cfgRoot: null,
    force: false,
    dryRun: false,
    json: false,
    yes: false,
    all: false,
    prune: false,
    pruneLegacy: false,
    apply: false,
    allowEmpty: false,
    readyOnly: false,
    reconcile: false,
    useLink: true,
    useHome: true
  };
  let command = 'help';
  for (let i = 0; i < args.length; i += 1) {
    const token = String(args[i]);
    if (token === '-h' || token === '--help') return { command: 'help', opts };
    if (token === '-v' || token === '--version') return { command: 'version', opts };
    if (token.startsWith('-')) {
      if (VALUE_FLAGS.has(token)) {
        const key = VALUE_FLAGS.get(token);
        const value = args[i + 1];
        if (value == null) return { error: `${token} 需要一个值` };
        opts[key] = value;
        i += 1;
      } else if (BOOL_FLAGS.has(token)) {
        const [key, value] = BOOL_FLAGS.get(token);
        opts[key] = value;
      } else {
        return { error: `未知参数: ${token}` };
      }
      continue;
    }
    if (command === 'help') command = token;
    else return { error: `多余的参数: ${token}` };
  }
  if (!['install', 'uninstall', 'upgrade', 'check', 'installations', 'list', 'doctor', 'version', 'help'].includes(command)) {
    return { error: `未知命令: ${command}` };
  }
  return { command, opts };
}

function cmdVersion(opts) {
  const version = readPackageVersion(PKG_ROOT);
  if (opts.json === true) {
    console.log(JSON.stringify({ ok: true, command: 'version', exit: 0, version, node: process.version, platform: process.platform }, null, 2));
  } else {
    console.log(version);
  }
  return EXIT.OK;
}

function cmdList(opts) {
  const cfg = loadHosts(opts.cfgRoot || resolveConfigRoot([PKG_ROOT]));
  const rows = Object.entries(cfg.hosts).map(([key, host]) => ({
    key,
    label: host.label,
    maturity: host.maturity,
    status: host.status,
    agent_dir: host.agentDir,
    command_dir: host.commandDir,
    command_ext: host.commandExt,
    global_agent_dir: (() => {
      try {
        return globalAgentDir(host);
      } catch {
        return null;
      }
    })()
  })).filter((row) => (opts.readyOnly === true ? row.status === 'ready' : true));

  if (opts.json === true) {
    console.log(JSON.stringify({ ok: true, command: 'list', exit: 0, hosts: rows }, null, 2));
  } else {
    console.log('key                 mat  status   agent_dir       command');
    for (const row of rows) {
      const command = `${row.command_dir}/{name}${row.command_ext}`;
      console.log(`${row.key.padEnd(19)} ${row.maturity.padEnd(4)} ${row.status.padEnd(8)} ${row.agent_dir.padEnd(15)} ${command}`);
    }
  }
  return EXIT.OK;
}

function cmdInstallations(opts) {
  const homeRoot = resolveRegistryRoot({ env: process.env, home: opts.homeDir });
  const removed = opts.prune === true ? pruneStale(homeRoot) : [];
  const rows = listInstallations(homeRoot);
  if (opts.json === true) {
    console.log(JSON.stringify({ ok: true, command: 'installations', exit: 0, home: homeRoot, installations: rows, pruned: removed }, null, 2));
  } else {
    if (rows.length === 0) console.log(`账本为空（${homeRoot}）`);
    for (const row of rows) {
      console.log(`${row.status.padEnd(8)} ${String(row.host_key).padEnd(16)} ${row.version.padEnd(10)} ${row.agent_dir}`);
    }
    for (const row of removed) console.log(`pruned   ${row.host_key}  ${row.agent_dir}`);
  }
  return EXIT.OK;
}

function cmdDoctor(opts) {
  const homeRoot = resolveHelmHome({ env: process.env, home: opts.homeDir });
  const items = [];
  const add = (name, status, detail = '') => items.push({ name, status, detail });

  const [major, minor] = process.versions.node.split('.').map(Number);
  add('node', major > 20 || (major === 20 && minor >= 19) ? 'pass' : 'fail', process.version);
  add('platform', 'pass', `${process.platform} ${process.arch}`);

  let writable = false;
  try {
    fs.mkdirSync(homeRoot, { recursive: true });
    const probe = path.join(homeRoot, '.doctor-probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    writable = true;
  } catch {
    writable = false;
  }
  add('home 可写', writable ? 'pass' : 'fail', homeRoot);

  let linkMode = 'copy';
  try {
    const probeDir = path.join(homeRoot, '.doctor-link');
    fs.rmSync(probeDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(probeDir, 'target'), { recursive: true });
    const link = path.join(probeDir, 'link');
    if (process.platform === 'win32') fs.symlinkSync(path.join(probeDir, 'target'), link, 'junction');
    else fs.symlinkSync(path.join(probeDir, 'target'), link, 'dir');
    linkMode = process.platform === 'win32' ? 'junction' : 'symlink';
    fs.rmSync(probeDir, { recursive: true, force: true });
  } catch {
    linkMode = 'copy';
  }
  add('link 能力', 'pass', linkMode);

  let cfg = null;
  try {
    cfg = loadHosts(opts.cfgRoot || resolveConfigRoot([PKG_ROOT]));
    add('hosts 配置', 'pass', cfg.file);
  } catch (e) {
    add('hosts 配置', 'fail', e.message);
  }

  const meta = readPayloadMeta(homeRoot);
  add('payload 真源', meta ? 'pass' : 'warn', meta ? `${meta.version} (${meta.hosts.join(',')})` : '尚未建立');

  const rows = listInstallations(homeRoot);
  const stale = rows.filter((row) => row.status !== 'ok').length;
  add('安装账本', stale === 0 ? 'pass' : 'warn', `${rows.length} 条，异常 ${stale} 条`);

  const cwd = path.resolve(opts.cwd || process.cwd());
  if (cfg) {
    const legacy = Object.values(cfg.hosts)
      .map((host) => path.join(cwd, host.agentDir))
      .filter((dir) => fs.existsSync(dir) && !fs.existsSync(path.join(dir, VERSION_FILE)));
    add('旧式手工安装', legacy.length === 0 ? 'pass' : 'warn', legacy.join(', ') || '无');
  }

  const failed = items.filter((item) => item.status === 'fail').length;
  const exit = failed > 0 ? EXIT.IO : EXIT.OK;
  if (opts.json === true) {
    console.log(JSON.stringify({ ok: exit === EXIT.OK, command: 'doctor', exit, items }, null, 2));
  } else {
    for (const item of items) {
      console.log(`${item.status === 'pass' ? 'PASS' : (item.status === 'warn' ? 'WARN' : 'FAIL')}  ${item.name}  ${item.detail}`);
    }
  }
  return exit;
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  if (parsed.error) {
    console.error(parsed.error);
    console.log(HELP);
    return EXIT.ARG;
  }
  const { command, opts } = parsed;
  if (!opts.cfgRoot) {
    try {
      opts.cfgRoot = resolveConfigRoot([PKG_ROOT]);
    } catch {
      opts.cfgRoot = PKG_ROOT;
    }
  }

  if (command === 'help') {
    console.log(HELP);
    return EXIT.OK;
  }
  if (command === 'version') return cmdVersion(opts);
  if (command === 'list') return cmdList(opts);
  if (command === 'installations') return cmdInstallations(opts);
  if (command === 'doctor') return cmdDoctor(opts);
  if (command === 'install') return runInstall(opts).exit;
  if (command === 'uninstall') return runUninstall(opts).exit;
  if (command === 'upgrade') return runUpgrade(opts).exit;
  if (command === 'check') return runCheck(opts).exit;

  console.error(`未知命令: ${command}`);
  console.log(HELP);
  return EXIT.ARG;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`[helm] 内部错误: ${error && error.stack ? error.stack : error}`);
      process.exitCode = EXIT.IO;
    }
  );
}
