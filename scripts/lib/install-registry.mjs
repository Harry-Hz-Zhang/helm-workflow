import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { sleepSync, withRetry } from './agent-link.mjs';
import { LEDGER_FILENAME, LEDGER_LOCK, LAYOUT_V1, VERSION_FILE } from './runtime-filenames.mjs';

export function resolveRegistryRoot(opts = {}) {
  const env = opts.env || process.env;
  const home = opts.home || os.homedir();
  const override = env.HELM_HOME;
  if (override != null && String(override).trim() !== '') return path.resolve(String(override));
  return path.resolve(path.join(home, '.helm'));
}

export function normalizeAgentDir(agentDir) {
  let value = path.resolve(String(agentDir));
  if (process.platform === 'win32' && /^[a-zA-Z]:/.test(value)) {
    value = value[0].toUpperCase() + value.slice(1);
  }
  if (value.length > 3) value = value.replace(/[/\\]+$/, '');
  return value;
}

export function installationIdFor(agentDir) {
  return createHash('sha256').update(normalizeAgentDir(agentDir)).digest('hex').slice(0, 16);
}

export function ledgerPath(homeRoot) {
  return path.join(homeRoot, LEDGER_FILENAME);
}

export function withLedgerLock(homeRoot, fn, opts = {}) {
  const lockFile = path.join(homeRoot, LEDGER_LOCK);
  const timeoutMs = opts.timeoutMs == null ? 5000 : opts.timeoutMs;
  const deadline = Date.now() + timeoutMs;
  fs.mkdirSync(homeRoot, { recursive: true });
  let fd = null;
  while (fd === null) {
    try {
      fd = fs.openSync(lockFile, 'wx');
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        const stat = fs.statSync(lockFile);
        if (Date.now() - stat.mtimeMs > 60000) {
          fs.unlinkSync(lockFile);
          continue;
        }
      } catch (ignored) {
        continue;
      }
      if (Date.now() > deadline) {
        const busy = new Error(`安装账本被占用（${lockFile}）`);
        busy.code = 'ELEDGERBUSY';
        throw busy;
      }
      sleepSync(50);
    }
  }
  try {
    return fn();
  } finally {
    try {
      fs.closeSync(fd);
    } catch (ignored) {
      /* 关闭失败不掩盖业务结果 */
    }
    try {
      fs.unlinkSync(lockFile);
    } catch (ignored) {
      /* 锁已被清理 */
    }
  }
}

export function loadLedger(homeRoot) {
  const file = ledgerPath(homeRoot);
  if (!fs.existsSync(file)) return { schemaVersion: 2, installations: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    const rows = Array.isArray(raw && raw.installations) ? raw.installations : [];
    return { schemaVersion: Number(raw && raw.schemaVersion) || 1, installations: rows.filter((row) => row && typeof row === 'object') };
  } catch {
    return { schemaVersion: 2, installations: [] };
  }
}

export function saveLedger(homeRoot, ledger) {
  const file = ledgerPath(homeRoot);
  const body = {
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    installations: Array.isArray(ledger.installations) ? ledger.installations : []
  };
  fs.mkdirSync(homeRoot, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  withRetry(() => fs.renameSync(tmp, file));
  return body;
}

export function upsertInstallation(entry, homeRoot) {
  return withLedgerLock(homeRoot, () => {
    const ledger = loadLedger(homeRoot);
    const agentDir = normalizeAgentDir(entry.agent_dir);
    const id = installationIdFor(agentDir);
    const now = new Date().toISOString();
    const row = {
      id,
      host_key: String(entry.host_key || ''),
      agent_dir: agentDir,
      project_root: normalizeAgentDir(entry.project_root || path.dirname(agentDir)),
      payload_root: entry.payload_root ? normalizeAgentDir(entry.payload_root) : null,
      location: entry.location === 'global' ? 'global' : 'local',
      link_mode: String(entry.link_mode || 'copy'),
      source_kind: String(entry.source_kind || 'local'),
      ref: entry.ref == null ? null : String(entry.ref),
      version: String(entry.version || '0.0.0'),
      manifest_layout: String(entry.manifest_layout || ''),
      installed_at: String(entry.installed_at || now),
      updated_at: now
    };
    const index = ledger.installations.findIndex(
      (item) => item.id === id || normalizeAgentDir(item.agent_dir) === agentDir
    );
    if (index >= 0) {
      const previous = ledger.installations[index];
      ledger.installations[index] = { ...previous, ...row, installed_at: previous.installed_at || row.installed_at };
    } else {
      ledger.installations.push(row);
    }
    saveLedger(homeRoot, ledger);
    return row;
  });
}

export function removeInstallation(agentDir, homeRoot) {
  return withLedgerLock(homeRoot, () => {
    const target = normalizeAgentDir(agentDir);
    const ledger = loadLedger(homeRoot);
    const before = ledger.installations.length;
    ledger.installations = ledger.installations.filter(
      (row) => normalizeAgentDir(row.agent_dir) !== target
    );
    saveLedger(homeRoot, ledger);
    return before - ledger.installations.length;
  });
}

export function classifyInstallation(row) {
  const agentDir = row && row.agent_dir ? row.agent_dir : '';
  if (!agentDir || !fs.existsSync(agentDir)) return 'missing';
  const manifestFile = path.join(agentDir, VERSION_FILE);
  if (!fs.existsSync(manifestFile)) return 'broken';
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return 'broken';
  }
  if (manifest.layout === LAYOUT_V1) return 'legacy';
  if (manifest.host_key && row.host_key && manifest.host_key !== row.host_key) return 'drifted';
  if (manifest.payload_root && row.payload_root
    && normalizeAgentDir(manifest.payload_root) !== normalizeAgentDir(row.payload_root)) {
    return 'drifted';
  }
  return 'ok';
}

export function listInstallations(homeRoot) {
  const ledger = loadLedger(homeRoot);
  return ledger.installations.map((row) => ({ ...row, status: classifyInstallation(row) }));
}

export function pruneStale(homeRoot) {
  return withLedgerLock(homeRoot, () => {
    const ledger = loadLedger(homeRoot);
    const kept = [];
    const removed = [];
    for (const row of ledger.installations) {
      const status = classifyInstallation(row);
      if (status === 'missing' || status === 'broken') removed.push({ ...row, status });
      else kept.push(row);
    }
    ledger.installations = kept;
    saveLedger(homeRoot, ledger);
    return removed;
  });
}

/** 以磁盘上的 manifest 为准重建账本行（只增不删） */
export function reconcileFromDirs(homeRoot, agentDirs) {
  const manifestPaths = [];
  for (const dir of agentDirs) {
    if (dir && fs.existsSync(path.join(dir, VERSION_FILE))) manifestPaths.push(dir);
  }
  const rows = [];
  for (const dir of manifestPaths) {
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(dir, VERSION_FILE), 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      continue;
    }
    rows.push(upsertInstallation({
      host_key: manifest.host_key,
      agent_dir: dir,
      payload_root: manifest.payload_root || null,
      location: manifest.install_location,
      link_mode: manifest.link_mode,
      source_kind: manifest.source_kind,
      ref: manifest.ref,
      version: manifest.version,
      manifest_layout: manifest.layout,
      installed_at: manifest.installed_at
    }, homeRoot));
  }
  return rows;
}
