import fs from 'node:fs';
import path from 'node:path';
import { CLUSTER, normalizeForCompare } from './host-paths.mjs';
import { EXIT } from './runtime-filenames.mjs';

export const HOSTS_SCHEMA_VERSION = 2;

export class ArgError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArgError';
    this.exitCode = EXIT.ARG;
  }
}

export class SourceError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'SourceError';
    this.details = details;
    this.exitCode = EXIT.SOURCE;
  }
}

const LAYOUT_PRESETS = {
  nested: { commandDir: 'commands/{cluster}', commandName: '{stage}' },
  flat: { commandDir: 'commands', commandName: '{cluster}-{stage}' },
  workflow: { commandDir: 'workflow', commandName: '{cluster}-{stage}' }
};

const HOST_ALIASES = new Map([
  ['claude-code', 'claude'],
  ['anthropic', 'claude'],
  ['zcode', 'agents'],
  ['cursor-ai', 'cursor'],
  ['copilot', 'copilot-vscode'],
  ['github-copilot', 'copilot-vscode'],
  ['vscode', 'copilot-vscode'],
  ['codeium', 'windsurf'],
  ['roo-code', 'roo'],
  ['roocode', 'roo'],
  ['continue-dev', 'continue'],
  ['junie', 'jetbrains-junie'],
  ['jetbrains', 'jetbrains-junie'],
  ['jetbrains-ai', 'jetbrains-junie']
]);

function normalizeRules(raw) {
  if (raw == null || raw === false) return null;
  if (raw === true) {
    return { dir: 'rules', ext: '.mdc', filePattern: '{cluster}-{name}{ext}', frontmatter: {}, trigger: null };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SourceError(`rules 必须是 null | boolean | object，实际: ${JSON.stringify(raw)}`);
  }
  const frontmatter = raw.frontmatter && typeof raw.frontmatter === 'object' && !Array.isArray(raw.frontmatter)
    ? { ...raw.frontmatter }
    : {};
  return {
    dir: String(raw.dir || 'rules'),
    ext: String(raw.ext || '.mdc'),
    filePattern: String(raw.filePattern || '{cluster}-{name}{ext}'),
    frontmatter,
    trigger: raw.trigger == null ? null : String(raw.trigger)
  };
}

function normalizeChecks(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new SourceError('checks 必须是数组');
  return raw.map((entry, index) => {
    if (typeof entry === 'string' && entry.trim() !== '') {
      return { path: entry.trim(), severity: 'fail' };
    }
    if (entry && typeof entry === 'object' && typeof entry.path === 'string' && entry.path.trim() !== '') {
      const severity = entry.severity == null ? 'fail' : String(entry.severity);
      if (severity !== 'fail' && severity !== 'warn') {
        throw new SourceError(`checks[${index}].severity 必须是 fail|warn，实际: ${severity}`);
      }
      return { path: entry.path.trim(), severity };
    }
    throw new SourceError(`checks[${index}] 必须是字符串或 {path,severity}`);
  });
}

/** 旧字段 → 新字段，保证 v1 hosts.json 仍可用 */
export function normalizeHost(rawKey, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SourceError(`宿主 ${rawKey} 的定义必须是对象`);
  }
  const key = String(rawKey).trim().replace(/^\./, '');
  if (key === '') throw new SourceError('宿主 key 不能为空');

  const explicitDir = typeof raw.agentDir === 'string' && raw.agentDir !== '';
  const agentDir = explicitDir ? raw.agentDir : `.${key}`;

  const legacyLayout = raw.command_layout || raw.commandLayout || null;
  const preset = legacyLayout ? LAYOUT_PRESETS[legacyLayout] : null;
  if (legacyLayout && !preset) {
    throw new SourceError(`宿主 ${key} 的 command_layout 非法: ${legacyLayout}`);
  }

  const commandDir = String(raw.commandDir || (preset && preset.commandDir) || 'commands/{cluster}');
  const commandName = String(raw.commandName || (preset && preset.commandName) || '{stage}');
  const commandExt = String(raw.commandExt || '.md');
  if (!commandExt.startsWith('.')) {
    throw new SourceError(`宿主 ${key} 的 commandExt 必须以点开头: ${commandExt}`);
  }

  const defaultSourceRoot = legacyLayout === 'flat' || legacyLayout === 'workflow' ? 'host' : 'root';
  const sourceRoot = raw.sourceRoot === 'host' || raw.sourceRoot === 'root' ? raw.sourceRoot : defaultSourceRoot;

  const maturity = String(raw.maturity || 'p2');
  if (!['p0', 'p1', 'p2'].includes(maturity)) {
    throw new SourceError(`宿主 ${key} 的 maturity 非法: ${maturity}`);
  }
  // 缺 status 时按 maturity 推导（13-C C7 操作 2）：p0 视为已发布产物，p1/p2 视为未发布
  const status = String(raw.status || (maturity === 'p0' ? 'ready' : 'planned'));
  if (status !== 'ready' && status !== 'planned') {
    throw new SourceError(`宿主 ${key} 的 status 非法: ${status}`);
  }

  const slashStyle = raw.slashStyle || raw.slash_style;
  return validateHost(key, {
    key,
    label: String(raw.label || key),
    agentDir,
    cluster: String(raw.cluster || CLUSTER),
    sourceRoot,
    commandDir,
    commandName,
    commandExt,
    slashStyle: ['colon', 'dash', 'natural'].includes(slashStyle) ? slashStyle : 'dash',
    agentSource: raw.agentSource === 'host' || raw.agent_source === 'host' ? 'host' : 'root',
    rules: normalizeRules(raw.rules),
    instructions: raw.instructions && typeof raw.instructions === 'object'
      ? { file: String(raw.instructions.file || ''), mode: String(raw.instructions.mode || 'reference-only') }
      : null,
    globalAgentDir: typeof raw.globalAgentDir === 'string' ? raw.globalAgentDir : null,
    globalAgentDirByPlatform: raw.globalAgentDirByPlatform && typeof raw.globalAgentDirByPlatform === 'object'
      ? { ...raw.globalAgentDirByPlatform }
      : {},
    hooks: raw.hooks && typeof raw.hooks === 'object' ? { ...raw.hooks } : null,
    checks: normalizeChecks(raw.checks),
    extras: Array.isArray(raw.extras) ? raw.extras.map(String) : [],
    maturity,
    status,
    cost: ['S', 'M', 'L'].includes(raw.cost) ? raw.cost : 'M',
    note: String(raw.note || '')
  });
}

export function validateHost(key, host) {
  const problems = [];
  if (!host.agentDir || host.agentDir.includes('/') || host.agentDir.includes('\\')) {
    problems.push('agentDir 必须是单段目录名');
  }
  if (!host.commandDir) problems.push('commandDir 不能为空');
  if (!host.commandName.includes('{stage}')) problems.push('commandName 必须包含 {stage}');
  if (!host.commandExt.startsWith('.')) problems.push('commandExt 必须以点开头');
  // 声明了 checks 的 ready 宿主必须至少有一条 fail；未声明 checks 的 legacy/v1 表放行
  if (host.status === 'ready' && host.checks.length > 0 && !host.checks.some((c) => c.severity === 'fail')) {
    problems.push('ready 宿主必须至少有一条 severity=fail 的 check');
  }
  if (problems.length > 0) {
    throw new SourceError(`宿主 ${key} 定义非法: ${problems.join('; ')}`);
  }
  return host;
}

export function hostsFileCandidates(rootDir) {
  return [
    path.join(rootDir, 'hosts.snapshot.json'),
    path.join(rootDir, 'hosts.json'),
    path.join(rootDir, 'scripts', 'hosts.json')
  ];
}

export function resolveConfigRoot(candidateDirs) {
  for (const dir of candidateDirs) {
    if (!dir) continue;
    for (const file of hostsFileCandidates(dir)) {
      if (fs.existsSync(file)) return dir;
    }
  }
  throw new SourceError(
    '找不到 hosts 配置（hosts.snapshot.json / hosts.json / scripts/hosts.json）',
    candidateDirs.flatMap((dir) => hostsFileCandidates(dir))
  );
}

export function readHostsRaw(rootDir) {
  const candidates = hostsFileCandidates(rootDir);
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) throw new SourceError('找不到 hosts 配置', candidates);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new SourceError(`hosts 配置解析失败: ${e.message}`, [file]);
  }
  return { file, raw };
}

export function normalizeHosts(raw) {
  const table = raw && raw.hosts && typeof raw.hosts === 'object' ? raw.hosts : raw;
  const hosts = {};
  for (const [key, value] of Object.entries(table || {})) {
    if (key === 'schemaVersion') continue;
    hosts[String(key).replace(/^\./, '')] = normalizeHost(key, value);
  }
  return {
    schemaVersion: HOSTS_SCHEMA_VERSION,
    sourceVersion: Number(raw && raw.schemaVersion) || 1,
    hosts
  };
}

export function loadHosts(rootDir) {
  const { file, raw } = readHostsRaw(rootDir);
  const cfg = normalizeHosts(raw);
  cfg.file = file;
  for (const [key, host] of Object.entries(cfg.hosts)) validateHost(key, host);
  return cfg;
}

/** 读源仓 package.json 的版本；缺文件或非法 JSON 一律 SOURCE(3)，不抛未捕获异常 */
export function readPackageVersion(rootDir) {
  const file = path.join(rootDir, 'package.json');
  if (!fs.existsSync(file)) throw new SourceError('源仓缺少 package.json', [file]);
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new SourceError(`package.json 解析失败: ${e.message}`, [file]);
  }
  const version = String((pkg && pkg.version) || '');
  if (!/^\d+\.\d+\.\d+/.test(version)) throw new SourceError(`package.json#version 非法: ${version}`, [file]);
  return version;
}

export function resolveHostKey(cfg, input) {
  const raw = String(input == null ? '' : input).trim();
  if (raw === '') throw new ArgError('缺少宿主名');
  const lowered = raw.toLowerCase().replace(/^\./, '');
  const key = HOST_ALIASES.get(lowered) || lowered;
  if (!cfg.hosts[key]) {
    throw new ArgError(`未知宿主: ${raw}（支持: ${Object.keys(cfg.hosts).join(', ')}）`);
  }
  return key;
}

function statMtime(target) {
  try {
    return fs.statSync(target).mtimeMs;
  } catch {
    return 0;
  }
}

/** --target auto：cwd 已有目录 → 账本 → 默认 */
export function resolveAutoTarget(cfg, opts = {}) {
  const cwd = path.resolve(opts.cwd || process.cwd());
  const found = [];
  for (const [key, host] of Object.entries(cfg.hosts)) {
    if (host.status !== 'ready') continue;
    const dir = path.join(cwd, host.agentDir);
    if (fs.existsSync(dir)) found.push({ key, mtime: statMtime(dir) });
  }
  if (found.length === 1) return found[0].key;
  if (found.length > 1) {
    const installed = found.filter((f) => fs.existsSync(path.join(cwd, cfg.hosts[f.key].agentDir, '.helm-version')));
    if (installed.length === 1) return installed[0].key;
    if (installed.length > 1) {
      throw new ArgError(`检测到多个已安装宿主（${installed.map((f) => f.key).join(', ')}），请显式指定 --target`);
    }
    found.sort((a, b) => b.mtime - a.mtime);
    return found[0].key;
  }
  const rows = Array.isArray(opts.ledger && opts.ledger.installations) ? opts.ledger.installations : [];
  const inCwd = rows.filter((row) => cfg.hosts[row.host_key]
    && normalizeForCompare(row.project_root || '') === normalizeForCompare(cwd));
  if (inCwd.length === 1) return inCwd[0].host_key;
  if (inCwd.length > 1) {
    throw new ArgError(`账本中 cwd 有多个安装（${inCwd.map((r) => r.host_key).join(', ')}），请显式指定 --target`);
  }
  return opts.defaultHost || 'claude';
}

/** --target 全量解析：auto / all / 逗号列表 */
export function selectHosts(cfg, spec, opts = {}) {
  const requireReady = opts.requireReady !== false;
  let keys;
  if (spec == null || spec === '' || spec === 'auto') {
    keys = [resolveAutoTarget(cfg, opts)];
  } else if (spec === 'all') {
    keys = Object.keys(cfg.hosts).filter((k) => cfg.hosts[k].status === 'ready');
    if (keys.length === 0) throw new ArgError('没有 status=ready 的宿主可安装');
  } else {
    const parts = String(spec).split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) throw new ArgError('--target 不能为空');
    keys = parts.map((part) => resolveHostKey(cfg, part));
  }
  const unique = [...new Set(keys)];
  if (requireReady) {
    for (const key of unique) {
      if (cfg.hosts[key].status !== 'ready') {
        throw new ArgError(
          `宿主 ${key} 尚未发布产物（status=${cfg.hosts[key].status}，maturity=${cfg.hosts[key].maturity}），请改用已发布宿主`
        );
      }
    }
  }
  return unique;
}
