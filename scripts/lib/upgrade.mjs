import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXIT,
  LAYOUT_V2,
  VERSION_FILE,
  VERSION_BACKUP,
  LOCAL_EXAMPLE
} from './runtime-filenames.mjs';
import {
  ArgError,
  loadHosts,
  readPackageVersion,
  resolveConfigRoot,
  selectHosts
} from './host-config.mjs';
import { resolvePayloadSkills } from './payload-skills.mjs';
import {
  commitPayload,
  copySourceSurfaceToAgent,
  dropPayloadPrevious,
  ensureHomeDirs,
  installRuntimeToAgent,
  linkPayloadToAgent,
  readPayloadMeta,
  resolveHelmHome,
  rollbackPayload,
  stagePayload
} from './payload-home.mjs';
import {
  cleanupOrphans,
  migrateManifest,
  readManifestStrict,
  restoreManifest,
  writeManifest
} from './manifest.mjs';
import {
  classifyInstallation,
  listInstallations,
  loadLedger,
  upsertInstallation
} from './install-registry.mjs';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function parseVersion(value) {
  const raw = String(value == null ? '' : value).trim().replace(/^v/, '');
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(raw);
  if (!match) return { raw, valid: false, major: 0, minor: 0, patch: 0, pre: null };
  return {
    raw,
    valid: true,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] || null
  };
}

/** 语义化比较；任一非法返回 null（调用方按"无法比较"处理，不阻断） */
export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a.valid || !b.valid) return null;
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.pre === b.pre) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  const as = a.pre.split('.');
  const bs = b.pre.split('.');
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i += 1) {
    const x = as[i];
    const y = bs[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
    } else if (xNum !== yNum) {
      return xNum ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

export function resolveUpgradeTargets(opts, cfg, homeRoot) {
  const cwd = path.resolve(opts.cwd || process.cwd());
  const rows = listInstallations(homeRoot).filter((row) => classifyInstallation(row) !== 'missing');
  if (opts.agentDir) {
    const dir = path.resolve(opts.agentDir);
    const row = rows.find((r) => path.resolve(r.agent_dir) === dir);
    return [{ hostKey: (row && row.host_key) || opts.target || '', dest: dir, row: row || null }];
  }
  if (opts.all === true || opts.target == null) {
    return rows.map((row) => ({ hostKey: row.host_key, dest: row.agent_dir, row }));
  }
  const keys = selectHosts(cfg, opts.target, { requireReady: false, cwd, ledger: loadLedger(homeRoot) });
  const picked = [];
  for (const key of keys) {
    const candidates = rows.filter((row) => row.host_key === key);
    const global = opts.location === 'global';
    const row = candidates.find((item) => (global
      ? item.location === 'global'
      : path.resolve(item.project_root || '') === cwd))
      || candidates.find((item) => item.location === (global ? 'global' : 'local'))
      || candidates[0]
      || null;
    if (row) {
      picked.push({ hostKey: key, dest: row.agent_dir, row });
    } else if (opts.agentDir) {
      picked.push({ hostKey: key, dest: path.resolve(opts.agentDir), row: null });
    }
  }
  return picked;
}

function buildManifest(opts) {
  return {
    version: opts.version,
    layout: LAYOUT_V2,
    host_key: opts.hostKey,
    agent_dir: opts.dest,
    agent_dir_kind: opts.prev.agent_dir_kind,
    link_mode: opts.linkMode,
    link_modes: opts.linkModes,
    payload_root: opts.payloadRoot,
    install_location: opts.prev.install_location,
    source_kind: opts.sourceKind,
    source_dir: opts.srcRoot,
    ref: opts.ref,
    commit: opts.commit,
    installed_at: opts.prev.installed_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    managed_dirs: opts.managedDirs,
    managed_files: opts.managedFiles,
    checksums: opts.prev.checksums
  };
}

export function runUpgrade(opts = {}) {
  const warnings = [];
  const results = [];
  const dryRun = opts.dryRun === true;
  const wantJson = opts.json === true;
  const homeRoot = resolveHelmHome({ env: opts.env, home: opts.homeDir });

  let cfg;
  try {
    cfg = loadHosts(opts.cfgRoot || resolveConfigRoot([PKG_ROOT]));
  } catch (e) {
    return finish(EXIT.SOURCE, e.message, results, warnings, wantJson);
  }

  ensureHomeDirs(homeRoot);
  const targets = resolveUpgradeTargets(opts, cfg, homeRoot);
  if (targets.length === 0) {
    return finish(EXIT.OK, '没有已安装实例需要升级', results, warnings, wantJson);
  }

  // ---- 子集拒绝：同一 payload_root 下的其它安装会被连带影响 ----
  const ledgerRows = loadLedger(homeRoot).installations;
  const targetDirs = new Set(targets.map((t) => path.resolve(t.dest)));
  const sharedRows = ledgerRows.filter((row) => !targetDirs.has(path.resolve(row.agent_dir))
    && row.payload_root
    && (targets[0].row ? row.payload_root === targets[0].row.payload_root : true));
  if (opts.target != null && opts.all !== true && sharedRows.length > 0 && opts.force !== true) {
    const list = sharedRows.map((row) => `${row.host_key} (${row.agent_dir})`).join(', ');
    return finish(
      EXIT.CONFLICT,
      `检测到共享真源的其它安装：${list}。升级 payload 会同时影响它们，请改用 helm-workflow upgrade --all，或加 --force 明确接受连带影响`,
      results,
      warnings,
      wantJson
    );
  }

  // ---- 可选：从源目录提升新 payload ----
  let meta = readPayloadMeta(homeRoot);
  let stagedVersion = null;
  let srcRoot = opts.sourceDir ? path.resolve(opts.sourceDir) : null;
  let payloadSkills = [];
  if (srcRoot) {
    // 先读版本做降级判定，再解析 payload（降级应当先于源完整性校验报错）
    try {
      stagedVersion = readPackageVersion(srcRoot);
    } catch (e) {
      return finish(EXIT.SOURCE, e.message, results, warnings, wantJson);
    }
    const current = meta ? meta.version : null;
    const cmp = current ? compareVersions(stagedVersion, current) : 1;
    if (cmp === null) {
      warnings.push(`版本无法比较（${stagedVersion} vs ${current}），按不同版本继续`);
    } else if (cmp < 0 && opts.force !== true) {
      return finish(
        EXIT.CONFLICT,
        `拒绝降级：源版本 ${stagedVersion} < 已装版本 ${current}（--force 可强制）`,
        results,
        warnings,
        wantJson
      );
    }
    // dry-run 也要解析 payload 清单，但绝不落盘
    try {
      payloadSkills = resolvePayloadSkills(srcRoot);
    } catch (e) {
      return finish(EXIT.SOURCE, e.message, results, warnings, wantJson);
    }
    if (!dryRun) {
      try {
        const staged = stagePayload({
          homeRoot,
          srcRoot,
          cfg,
          payloadSkills,
          version: stagedVersion,
          ref: opts.ref || null,
          commit: opts.commit || null
        });
        commitPayload(homeRoot, staged.staged);
        meta = staged.meta;
      } catch (e) {
        return finish(EXIT.SOURCE, e.message, results, warnings, wantJson);
      }
    }
  } else if (opts.ref) {
    return finish(
      EXIT.NETWORK,
      'CLI 不联网：upgrade --ref 需要同时给 --source-dir（由 install.sh / install.ps1 负责下载）',
      results,
      warnings,
      wantJson
    );
  }

  if (!meta && !srcRoot) {
    return finish(
      EXIT.SOURCE,
      `既没有 payload 真源（${path.join(homeRoot, 'payload')}），也没有 --source-dir`,
      results,
      warnings,
      wantJson
    );
  }

  // ---- 逐目标刷新 ----
  const refreshed = [];
  try {
    for (const target of targets) {
      const host = cfg.hosts[target.hostKey];
      if (!host) {
        warnings.push(`跳过未知宿主 ${target.hostKey}（${target.dest}）`);
        continue;
      }
      const probe = readManifestStrict(target.dest);
      if (probe.error) {
        warnings.push(`跳过 ${target.dest}：${probe.error}`);
        continue;
      }
      const prev = migrateManifest(probe.manifest);
      const onWarn = (m) => warnings.push(m);
      const surface = meta && !dryRun
        ? linkPayloadToAgent({
          homeRoot,
          host,
          dest: target.dest,
          preferLink: opts.useLink !== false,
          dryRun,
          platform: opts.platform,
          onWarn
        })
        : copySourceSurfaceToAgent({
          srcRoot,
          host,
          dest: target.dest,
          payloadSkills,
          dryRun,
          platform: opts.platform,
          onWarn
        });

      const entries = surface.entries.slice();
      entries.push(...installRuntimeToAgent({
        runtimeDir: meta ? path.join(homeRoot, 'payload', 'runtime') : null,
        srcRoot,
        dest: target.dest,
        dryRun
      }).map((rel) => ({ rel, isDir: false, mode: dryRun ? 'planned-copy' : 'copied' })));
      entries.push({ rel: LOCAL_EXAMPLE, isDir: false, mode: dryRun ? 'planned-copy' : 'copied' });
      const orphans = cleanupOrphans(target.dest, probe.manifest, entries, { dryRun, onLog: onWarn });

      const manifest = buildManifest({
        version: stagedVersion || prev.version,
        hostKey: target.hostKey,
        dest: target.dest,
        prev,
        linkMode: surface.linkMode,
        linkModes: Object.fromEntries(entries.filter((e) => e.mode !== 'noop').map((e) => [e.rel, e.mode])),
        payloadRoot: meta ? path.join(homeRoot, 'payload') : null,
        sourceKind: opts.ref ? 'remote' : 'local',
        srcRoot: srcRoot || prev.source_dir,
        ref: opts.ref == null ? prev.ref : opts.ref,
        commit: opts.commit == null ? prev.commit : opts.commit,
        managedDirs: [...new Set(entries.filter((e) => e.isDir).map((e) => e.rel))].sort(),
        managedFiles: [...new Set(entries.filter((e) => !e.isDir).map((e) => e.rel))].sort()
      });

      writeManifest(target.dest, manifest, { dryRun });
      if (!dryRun) {
        upsertInstallation({
          host_key: target.hostKey,
          agent_dir: target.dest,
          project_root: target.row ? target.row.project_root : path.dirname(target.dest),
          payload_root: manifest.payload_root,
          location: manifest.install_location,
          link_mode: manifest.link_mode,
          source_kind: manifest.source_kind,
          ref: manifest.ref,
          version: manifest.version,
          manifest_layout: manifest.layout,
          installed_at: manifest.installed_at
        }, homeRoot);
      }
      refreshed.push({ host: target.hostKey, agent_dir: target.dest, version: manifest.version, orphans, link_mode: manifest.link_mode });
      results.push({ host: target.hostKey, agent_dir: target.dest, orphans });
    }
  } catch (e) {
    warnings.push(`升级中断：${e.message}`);
    if (!dryRun) {
      rollbackPayload(homeRoot);
      for (const item of refreshed) restoreManifest(item.agent_dir);
    }
    return finish(EXIT.IO, e.message, results, warnings, wantJson);
  }

  if (!dryRun) dropPayloadPrevious(homeRoot);
  return finish(EXIT.OK, `已升级 ${refreshed.length} 个安装`, results, warnings, wantJson, { refreshed });
}

function finish(code, message, results, warnings, wantJson, extra) {
  const payload = {
    ok: code === EXIT.OK,
    command: 'upgrade',
    exit: code,
    message,
    results,
    warnings,
    ...(extra || {})
  };
  if (wantJson) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    if (message) console.log(`[upgrade] ${message}`);
    for (const warning of warnings) console.log(`  WARN  ${warning}`);
    for (const item of results) {
      console.log(`  ${item.host}  ${item.agent_dir}  orphans=${(item.orphans || []).length}`);
    }
  }
  return payload;
}
