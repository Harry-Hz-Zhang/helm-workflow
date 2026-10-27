import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SourceError } from './host-config.mjs';
import { STAGES, resolveCommandPath, commandParentDir, sourceSurfaceRoot } from './host-paths.mjs';
import {
  applyEntry,
  assertInside,
  copyDirFresh,
  copyFileAtomic,
  listFilesRecursive,
  mkdirp,
  mergeLinkMode,
  removeSurface,
  withRetry
} from './agent-link.mjs';
import {
  LOCAL_EXAMPLE,
  LAYOUT_V2,
  PAYLOAD_META,
  RUNTIME_DIR,
  RUNTIME_FILES,
  HOSTS_SNAPSHOT
} from './runtime-filenames.mjs';

export const HOME_DIRNAME = '.helm';

export function resolveHelmHome(opts = {}) {
  const env = opts.env || process.env;
  const home = opts.home || os.homedir();
  const override = env.HELM_HOME;
  if (override != null && String(override).trim() !== '') return path.resolve(String(override));
  return path.resolve(path.join(home, HOME_DIRNAME));
}

export function homeLayout(homeRoot) {
  const root = path.resolve(homeRoot);
  return {
    root,
    payload: path.join(root, 'payload'),
    payloadPrev: path.join(root, 'payload.prev'),
    shared: path.join(root, 'payload', 'shared'),
    hosts: path.join(root, 'payload', 'hosts'),
    runtime: path.join(root, 'runtime'),
    staging: path.join(root, 'staging')
  };
}

export function ensureHomeDirs(homeRoot) {
  const layout = homeLayout(homeRoot);
  for (const dir of [layout.root, layout.shared, layout.hosts, layout.runtime, layout.staging]) {
    mkdirp(dir);
  }
  return layout;
}

export function readPayloadMeta(homeRoot) {
  const file = path.join(homeLayout(homeRoot).payload, PAYLOAD_META);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

export function beginStaging(homeRoot) {
  const layout = homeLayout(homeRoot);
  if (fs.existsSync(layout.staging)) removeSurface(layout.staging);
  const staged = path.join(layout.staging, 'payload');
  mkdirp(staged);
  return staged;
}

/** staging → payload 原子提升；上一版保留在 payload.prev 供回滚 */
export function commitPayload(homeRoot, stagedRoot) {
  const layout = homeLayout(homeRoot);
  if (fs.existsSync(layout.payloadPrev)) removeSurface(layout.payloadPrev);
  if (fs.existsSync(layout.payload)) {
    withRetry(() => fs.renameSync(layout.payload, layout.payloadPrev));
  }
  try {
    withRetry(() => fs.renameSync(stagedRoot, layout.payload));
  } catch (e) {
    if (fs.existsSync(layout.payloadPrev)) {
      withRetry(() => fs.renameSync(layout.payloadPrev, layout.payload));
    }
    throw e;
  }
  return { previous: fs.existsSync(layout.payloadPrev) ? layout.payloadPrev : null };
}

export function rollbackPayload(homeRoot) {
  const layout = homeLayout(homeRoot);
  if (!fs.existsSync(layout.payloadPrev)) return false;
  if (fs.existsSync(layout.payload)) removeSurface(layout.payload);
  withRetry(() => fs.renameSync(layout.payloadPrev, layout.payload));
  return true;
}

export function dropPayloadPrevious(homeRoot) {
  const layout = homeLayout(homeRoot);
  if (fs.existsSync(layout.payloadPrev)) removeSurface(layout.payloadPrev);
}

/** 从源仓构建 staging payload（全部 ready 宿主的命令薄壳一并入库） */
export function stagePayload(opts) {
  const { homeRoot, srcRoot, cfg, payloadSkills } = opts;
  const staged = beginStaging(homeRoot);
  const sharedSkills = path.join(staged, 'shared', 'skills');
  const sharedAgents = path.join(staged, 'shared', 'agents');
  const sharedTemplates = path.join(staged, 'shared', 'templates');
  const sharedReferences = path.join(staged, 'shared', 'references');
  for (const dir of [sharedSkills, sharedAgents, sharedTemplates, sharedReferences]) mkdirp(dir);

  for (const name of payloadSkills) {
    const from = path.join(srcRoot, 'skills', name);
    if (!fs.existsSync(from)) throw new SourceError(`payload skill 缺失: skills/${name}`, [from]);
    copyDirFresh(from, path.join(sharedSkills, name));
  }

  for (const f of fs.readdirSync(path.join(srcRoot, 'agents'))) {
    if (!f.endsWith('.md')) continue;
    if (f === 'README.md') continue; // 导航文档，不是 persona
    fs.copyFileSync(path.join(srcRoot, 'agents', f), path.join(sharedAgents, f));
  }
  copyDirFresh(path.join(srcRoot, 'templates'), sharedTemplates);
  copyDirFresh(path.join(srcRoot, 'references'), sharedReferences);
  fs.copyFileSync(path.join(srcRoot, LOCAL_EXAMPLE), path.join(staged, 'shared', LOCAL_EXAMPLE));

  for (const [key, host] of Object.entries(cfg.hosts)) {
    if (host.status !== 'ready') continue;
    const surface = sourceSurfaceRoot(srcRoot, host);
    for (const stage of STAGES) {
      const rel = resolveCommandPath(host, stage);
      const from = path.join(surface, rel);
      if (!fs.existsSync(from)) throw new SourceError(`缺少命令源文件: ${rel}（宿主 ${key}）`, [from]);
      const to = path.join(staged, 'hosts', key, rel);
      mkdirp(path.dirname(to));
      fs.copyFileSync(from, to);
    }
    if (host.rules) {
      const rulesFrom = path.join(surface, host.rules.dir);
      if (fs.existsSync(rulesFrom)) {
        copyDirFresh(rulesFrom, path.join(staged, 'hosts', key, host.rules.dir));
      }
    }
  }

  // 卸载器运行时一并入库：升级时无需再读源仓（自包含卸载的前提）
  const runtimeStaged = path.join(staged, 'runtime');
  for (const rel of RUNTIME_FILES) {
    const from = path.join(srcRoot, 'scripts', rel);
    if (!fs.existsSync(from)) throw new SourceError(`运行时文件缺失: scripts/${rel}`, [from]);
    const to = path.join(runtimeStaged, rel);
    mkdirp(path.dirname(to));
    fs.copyFileSync(from, to);
  }
  fs.copyFileSync(path.join(srcRoot, 'scripts', 'hosts.json'), path.join(runtimeStaged, HOSTS_SNAPSHOT));

  const meta = {
    schemaVersion: 2,
    layout: LAYOUT_V2,
    version: String(opts.version || '0.0.0'),
    ref: opts.ref == null ? null : String(opts.ref),
    commit: opts.commit == null ? null : String(opts.commit),
    hosts: Object.keys(cfg.hosts).filter((k) => cfg.hosts[k].status === 'ready'),
    staged_at: new Date().toISOString()
  };
  fs.writeFileSync(path.join(staged, PAYLOAD_META), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return { staged, meta };
}

/**
 * 把卸载器运行时拷进宿主（.helm-runtime）。
 * runtimeDir 优先（= <home>/payload/runtime）；--no-home 时退回 <srcRoot>/scripts。
 */
export function installRuntimeToAgent(opts) {
  const { dest } = opts;
  const dryRun = opts.dryRun === true;
  const base = opts.runtimeDir || path.join(opts.srcRoot, 'scripts');
  const written = [];
  for (const rel of RUNTIME_FILES) {
    const from = path.join(base, rel);
    if (!fs.existsSync(from)) throw new SourceError(`运行时文件缺失: ${from}`, [from]);
    const relDest = `${RUNTIME_DIR}/${rel}`.replace(/\\/g, '/');
    if (!dryRun) copyFileAtomic(from, assertInside(dest, relDest));
    written.push(relDest);
  }
  const snapshotFrom = opts.runtimeDir
    ? path.join(base, HOSTS_SNAPSHOT)
    : path.join(base, 'hosts.json');
  if (!fs.existsSync(snapshotFrom)) throw new SourceError(`hosts 快照缺失: ${snapshotFrom}`, [snapshotFrom]);
  const snapshotRel = `${RUNTIME_DIR}/${HOSTS_SNAPSHOT}`;
  if (!dryRun) copyFileAtomic(snapshotFrom, assertInside(dest, snapshotRel));
  written.push(snapshotRel);
  return written;
}

/** 把 payload 逐项铺到 AGENT_DIR（link 优先，失败回退 copy） */
export function linkPayloadToAgent(opts) {
  const { homeRoot, host, dest } = opts;
  const layout = homeLayout(homeRoot);
  const preferLink = opts.preferLink !== false;
  const dryRun = opts.dryRun === true;
  const platform = opts.platform || process.platform;
  const onWarn = typeof opts.onWarn === 'function' ? opts.onWarn : () => {};
  const entries = [];

  const put = (rel, target, isDir) => {
    const relPath = String(rel).replace(/\\/g, '/');
    const mode = applyEntry({ root: dest, rel: relPath, target, isDir, preferLink, dryRun, platform, onWarn });
    entries.push({ rel: relPath, isDir, mode });
  };

  const skillsHome = path.join(layout.shared, 'skills');
  if (!fs.existsSync(skillsHome)) throw new SourceError(`payload 真源缺失: ${skillsHome}`, [skillsHome]);
  for (const name of fs.readdirSync(skillsHome).sort()) {
    put(`skills/${name}`, path.join(skillsHome, name), true);
  }
  for (const f of fs.readdirSync(path.join(layout.shared, 'agents')).sort()) {
    put(`agents/${f}`, path.join(layout.shared, 'agents', f), false);
  }
  for (const rel of listFilesRecursive(path.join(layout.shared, 'templates'))) {
    put(`templates/${rel}`, path.join(layout.shared, 'templates', rel), false);
  }
  for (const rel of listFilesRecursive(path.join(layout.shared, 'references'))) {
    put(`references/${rel}`, path.join(layout.shared, 'references', rel), false);
  }

  const hostHome = path.join(layout.hosts, host.key);
  for (const stage of STAGES) {
    const rel = resolveCommandPath(host, stage);
    put(rel, path.join(hostHome, rel), false);
  }
  if (host.rules) {
    const rulesHome = path.join(hostHome, host.rules.dir);
    for (const rel of listFilesRecursive(rulesHome)) {
      const relPath = `${host.rules.dir === '.' ? '' : `${host.rules.dir}/`}${rel}`.replace(/^\/+/, '');
      put(relPath, path.join(rulesHome, rel), false);
    }
  }
  put(LOCAL_EXAMPLE, path.join(layout.shared, LOCAL_EXAMPLE), false);

  const modes = entries.map((e) => e.mode);
  return { entries, linkMode: preferLink ? mergeLinkMode(modes, platform) : 'copy', commandParent: commandParentDir(host) };
}

/** --no-home：直接从源仓 copy（等价 v1，但仍是逐项 + 原子替换） */
export function copySourceSurfaceToAgent(opts) {
  const { srcRoot, host, dest, payloadSkills } = opts;
  const dryRun = opts.dryRun === true;
  const onWarn = typeof opts.onWarn === 'function' ? opts.onWarn : () => {};
  const entries = [];
  const put = (rel, target, isDir) => {
    const relPath = String(rel).replace(/\\/g, '/');
    entries.push({
      rel: relPath,
      isDir,
      mode: applyEntry({ root: dest, rel: relPath, target, isDir, preferLink: false, dryRun, platform: opts.platform, onWarn })
    });
  };

  for (const name of payloadSkills) put(`skills/${name}`, path.join(srcRoot, 'skills', name), true);
  for (const f of fs.readdirSync(path.join(srcRoot, 'agents'))) {
    if (f.endsWith('.md') && f !== 'README.md') put(`agents/${f}`, path.join(srcRoot, 'agents', f), false);
  }
  for (const rel of listFilesRecursive(path.join(srcRoot, 'templates'))) {
    put(`templates/${rel}`, path.join(srcRoot, 'templates', rel), false);
  }
  for (const rel of listFilesRecursive(path.join(srcRoot, 'references'))) {
    put(`references/${rel}`, path.join(srcRoot, 'references', rel), false);
  }
  const surface = sourceSurfaceRoot(srcRoot, host);
  for (const stage of STAGES) {
    const rel = resolveCommandPath(host, stage);
    put(rel, path.join(surface, rel), false);
  }
  if (host.rules) {
    const rulesFrom = path.join(surface, host.rules.dir);
    for (const rel of listFilesRecursive(rulesFrom)) {
      const relPath = `${host.rules.dir === '.' ? '' : `${host.rules.dir}/`}${rel}`.replace(/^\/+/, '');
      put(relPath, path.join(rulesFrom, rel), false);
    }
  }
  put(LOCAL_EXAMPLE, path.join(srcRoot, LOCAL_EXAMPLE), false);

  return { entries, linkMode: 'copy', commandParent: commandParentDir(host) };
}
