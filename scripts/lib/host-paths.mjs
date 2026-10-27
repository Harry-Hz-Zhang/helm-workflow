import os from 'node:os';
import path from 'node:path';

export const CLUSTER = 'helm';

export const STAGES = Object.freeze([
  'init',
  'new',
  'explore',
  'propose',
  'apply',
  'apply-sprint',
  'fix',
  'verify',
  'code-review',
  'commit-impact',
  'archive',
  'status',
  'auto'
]);

// 宿主命令薄壳的 frontmatter description 唯一真源。宿主菜单直接展示这段文本，
// 面向国际用户统一用英文；verify.mjs 会逐个薄壳比对，防止多宿主漂移。
export const STAGE_DESCRIPTIONS = Object.freeze({
  init: 'Initialize the workbench and directory skeleton',
  new: 'Intake a new requirement into a feature container',
  explore: 'Exhaustive decision-tree exploration of the solution space',
  propose: 'Produce the OpenSpec proposal and specs',
  apply: 'Serial per-task implementation (strict mode)',
  'apply-sprint': 'Resumable sprint-style implementation',
  fix: 'Targeted fix for review and verification findings',
  verify: 'Post-implementation verification and spec coverage check',
  'code-review': 'Static review of git changes producing a Markdown report, without modifying code or using the network',
  'commit-impact': 'Derive affected entry points and an executable test checklist from a commit or diff, producing a Markdown report',
  archive: 'Archive the change and finish the branch',
  status: 'Show change progress and the next step',
  auto: 'Gated end-to-end orchestration'
});

export function assertStage(stage) {
  if (!STAGES.includes(stage)) {
    throw new Error(`未知阶段: ${stage}（允许: ${STAGES.join(', ')}）`);
  }
  return stage;
}

export function expandPattern(pattern, vars) {
  return String(pattern).replace(/\{([A-Za-z0-9_]+)\}/g, (whole, key) => (
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole
  ));
}

export function commandVars(host, stage) {
  return { cluster: host.cluster || CLUSTER, stage: stage == null ? '' : String(stage) };
}

/** 命令文件名（不含扩展名）：{cluster} / {stage} 插值 */
export function resolveCommandName(host, stage) {
  assertStage(stage);
  return expandPattern(host.commandName, commandVars(host, stage));
}

/** 命令文件父目录：'.' 表示宿主根 */
export function commandParentDir(host) {
  const dir = expandPattern(host.commandDir, { cluster: host.cluster || CLUSTER })
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  return dir === '' || dir === '.' ? '.' : dir;
}

/** 命令文件相对 AGENT_DIR 的 posix 路径 —— 安装/校验/卸载唯一推导入口 */
export function resolveCommandPath(host, stage) {
  const name = `${resolveCommandName(host, stage)}${host.commandExt}`;
  const dir = commandParentDir(host);
  return dir === '.' ? name : `${dir}/${name}`;
}

/** 源仓里该宿主命令薄壳的根目录 */
export function sourceSurfaceRoot(repoRoot, host) {
  return host.sourceRoot === 'host' ? path.join(repoRoot, host.agentDir) : repoRoot;
}

/** 宿主全局目录：支持 {home} {appdata} {xdgConfig} 插值 */
export function globalAgentDir(host, opts = {}) {
  const platform = opts.platform || process.platform;
  const home = opts.home || os.homedir();
  const env = opts.env || process.env;
  const byPlatform = host.globalAgentDirByPlatform || {};
  const raw = byPlatform[platform] || host.globalAgentDir || null;
  if (!raw) return path.join(home, host.agentDir);
  const value = expandPattern(raw, {
    home,
    appdata: env.APPDATA || path.join(home, 'AppData', 'Roaming'),
    xdgConfig: env.XDG_CONFIG_HOME || path.join(home, '.config')
  });
  return path.resolve(value);
}

/** 大小写不敏感的包含判断（Windows 不区分大小写） */
export function normalizeForCompare(value) {
  const abs = path.resolve(String(value));
  return process.platform === 'win32' ? abs.toLowerCase() : abs;
}
