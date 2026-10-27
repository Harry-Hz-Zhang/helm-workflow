import fs from 'node:fs';
import path from 'node:path';
import { LAYOUT_V1, LAYOUT_V2, VERSION_FILE, VERSION_BACKUP } from './runtime-filenames.mjs';
import { assertInside, removeSurface } from './agent-link.mjs';

export function readManifest(agentDir) {
  const file = path.join(agentDir, VERSION_FILE);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

export function readManifestStrict(agentDir) {
  const file = path.join(agentDir, VERSION_FILE);
  if (!fs.existsSync(file)) return { error: `未找到安装清单（${file}）` };
  try {
    return { manifest: JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) };
  } catch (e) {
    return { error: `清单 JSON 非法（${file}）：${e.message}` };
  }
}

/** v1 → v2 内存迁移；不写盘 */
export function migrateManifest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const layout = raw.layout === LAYOUT_V2 ? LAYOUT_V2 : LAYOUT_V1;
  return {
    version: String(raw.version || '0.0.0'),
    layout,
    host_key: String(raw.host_key || ''),
    agent_dir: raw.agent_dir ? path.resolve(String(raw.agent_dir)) : '',
    agent_dir_kind: raw.agent_dir_kind || (raw.install_location === 'global' ? 'global' : 'local'),
    link_mode: raw.link_mode || 'copy',
    link_modes: raw.link_modes && typeof raw.link_modes === 'object' ? { ...raw.link_modes } : {},
    payload_root: raw.payload_root ? path.resolve(String(raw.payload_root)) : null,
    install_location: raw.install_location === 'global' ? 'global' : 'local',
    source_kind: raw.source_kind || 'local',
    source_dir: raw.source_dir ? path.resolve(String(raw.source_dir)) : '',
    ref: raw.ref == null ? null : String(raw.ref),
    commit: raw.commit == null ? null : String(raw.commit),
    installed_at: String(raw.installed_at || ''),
    updated_at: String(raw.updated_at || raw.installed_at || ''),
    managed_dirs: Array.isArray(raw.managed_dirs) ? raw.managed_dirs.map(String) : [],
    managed_files: Array.isArray(raw.managed_files) ? raw.managed_files.map(String) : [],
    checksums: raw.checksums && typeof raw.checksums === 'object' ? { ...raw.checksums } : undefined,
    migrated_from: layout === LAYOUT_V1 ? LAYOUT_V1 : null
  };
}

export function writeManifest(agentDir, manifest, opts = {}) {
  const file = path.join(agentDir, VERSION_FILE);
  if (opts.dryRun === true) return file;
  fs.mkdirSync(agentDir, { recursive: true });
  if (opts.backup !== false && fs.existsSync(file)) {
    fs.copyFileSync(file, path.join(agentDir, VERSION_BACKUP));
  }
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
  return file;
}

export function restoreManifest(agentDir) {
  const backup = path.join(agentDir, VERSION_BACKUP);
  if (!fs.existsSync(backup)) return false;
  fs.copyFileSync(backup, path.join(agentDir, VERSION_FILE));
  return true;
}

/**
 * 孤儿清理：只删"上一版 manifest 有、这一版没有"的条目。
 * 永不删除用户自建文件（它从不出现在任何一版 managed_* 里）。
 */
export function cleanupOrphans(agentDir, prevRaw, nextEntries, opts = {}) {
  const dryRun = opts.dryRun === true;
  const onLog = typeof opts.onLog === 'function' ? opts.onLog : () => {};
  const prev = migrateManifest(prevRaw);
  if (!prev) return [];

  const nextFiles = new Set(nextEntries.filter((e) => !e.isDir).map((e) => e.rel));
  const nextDirs = new Set(nextEntries.filter((e) => e.isDir).map((e) => e.rel));
  const removed = [];

  for (const rel of prev.managed_files) {
    if (nextFiles.has(rel)) continue;
    const abs = assertInside(agentDir, rel);
    if (!fs.existsSync(abs)) continue;
    if (!dryRun) removeSurface(abs);
    removed.push(rel);
    onLog(`[orphan] ${dryRun ? 'would remove' : 'removed'} file ${rel}`);
  }

  const staleDirs = prev.managed_dirs
    .filter((rel) => !nextDirs.has(rel))
    .sort((a, b) => b.split('/').length - a.split('/').length);
  for (const rel of staleDirs) {
    const abs = assertInside(agentDir, rel);
    if (!fs.existsSync(abs)) continue;
    if (!dryRun) removeSurface(abs);
    removed.push(rel);
    onLog(`[orphan] ${dryRun ? 'would remove' : 'removed'} dir ${rel}`);
  }
  return removed;
}
