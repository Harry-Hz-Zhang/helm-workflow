#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXIT,
  LAYOUT_V2,
  RUNTIME_DIR,
  LOCAL_EXAMPLE,
  LOCAL_YAML
} from './lib/runtime-filenames.mjs';
import {
  ArgError,
  SourceError,
  loadHosts,
  readPackageVersion,
  resolveConfigRoot,
  selectHosts
} from './lib/host-config.mjs';
import {
  STAGES,
  commandParentDir,
  globalAgentDir,
  resolveCommandPath,
  sourceSurfaceRoot
} from './lib/host-paths.mjs';
import { assertInside, copyFileAtomic, listFilesRecursive, removeSurface } from './lib/agent-link.mjs';
import { resolvePayloadSkills } from './lib/payload-skills.mjs';
import {
  commitPayload,
  copySourceSurfaceToAgent,
  ensureHomeDirs,
  installRuntimeToAgent,
  linkPayloadToAgent,
  resolveHelmHome,
  stagePayload
} from './lib/payload-home.mjs';
import { cleanupOrphans, migrateManifest, readManifest, writeManifest } from './lib/manifest.mjs';
import { loadLedger, upsertInstallation } from './lib/install-registry.mjs';
import { isMain } from './lib/is-main.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');

export function resolveInstallDest(host, opts = {}) {
  if (opts.agentDir) return path.resolve(opts.agentDir);
  if (opts.location === 'global') {
    if (opts.agentBase) return path.resolve(opts.agentBase, host.agentDir);
    return globalAgentDir(host, { platform: opts.platform, home: opts.home, env: opts.env });
  }
  return path.join(path.resolve(opts.cwd || process.cwd()), host.agentDir);
}

/** 源仓校验：先查文件存在性，绝不"文件缺失后直接 JSON.parse" */
export function validateSource(srcRoot, host) {
  const required = [
    'package.json',
    path.join('scripts', 'hosts.json'),
    'skills',
    'agents',
    'templates',
    'references',
    LOCAL_EXAMPLE
  ];
  const missing = required.filter((rel) => !fs.existsSync(path.join(srcRoot, rel)));
  const surface = sourceSurfaceRoot(srcRoot, host);
  for (const stage of STAGES) {
    const rel = resolveCommandPath(host, stage);
    const abs = path.join(surface, rel);
    if (!fs.existsSync(abs)) missing.push(path.relative(srcRoot, abs).split(path.sep).join('/'));
  }
  if (missing.length > 0) throw new SourceError('源仓不完整，缺少：', missing);
  return { surface };
}

/** 首次安装冲突：有 HELM 产物、无 manifest */
export function detectConflict(dest, prevRaw, host) {
  if (prevRaw) return null;
  if (!fs.existsSync(dest)) return null;
  const markers = [];
  const candidates = ['templates', 'references', 'agents', LOCAL_EXAMPLE, RUNTIME_DIR];
  if (host) candidates.push(commandParentDir(host));
  for (const rel of candidates) {
    if (rel && rel !== '.' && fs.existsSync(path.join(dest, rel))) markers.push(rel);
  }
  const skillsDir = path.join(dest, 'skills');
  if (fs.existsSync(skillsDir)) {
    const owned = fs.readdirSync(skillsDir)
      .some((name) => name.startsWith('helm-workflow-') || name === 'systematic-debugging');
    if (owned) markers.push('skills');
  }
  return markers.length > 0 ? markers : null;
}

function globToRegExp(pattern) {
  let body = String(pattern);
  let dirOnly = false;
  if (body.endsWith('/')) {
    dirOnly = true;
    body = body.slice(0, -1);
  }
  const escaped = body.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const source = escaped.replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return { regex: new RegExp(`^${source}$`), dirOnly };
}

export function loadLegacyRules(cfgRoot) {
  const file = path.join(cfgRoot, 'scripts', 'legacy-cleanup.json');
  if (!fs.existsSync(file)) return { schemaVersion: 1, entries: [] };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return { schemaVersion: 1, entries: [] };
  }
}

/** 只匹配"当前 manifest 未管理"的路径，绝不匹配自己刚装的东西 */
export function findLegacy(dest, rules) {
  const hits = [];
  const entries = rules && Array.isArray(rules.entries) ? rules.entries : [];
  if (entries.length === 0 || !fs.existsSync(dest)) return hits;
  const manifest = migrateManifest(readManifest(dest)) || { managed_files: [], managed_dirs: [] };
  const managed = new Set([...manifest.managed_files, ...manifest.managed_dirs]);
  const files = listFilesRecursive(dest);
  const dirs = new Set();
  for (const rel of files) {
    const parts = rel.split('/');
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'));
  }
  for (const entry of entries) {
    for (const pattern of entry.paths || []) {
      const { regex, dirOnly } = globToRegExp(pattern);
      const pool = dirOnly ? [...dirs] : files;
      for (const rel of pool) {
        if (managed.has(rel)) continue;
        if (rel === RUNTIME_DIR || rel.startsWith(`${RUNTIME_DIR}/`)) continue;
        if (!regex.test(rel)) continue;
        hits.push({ id: entry.id, reason: entry.reason || '', path: rel, isDir: dirOnly });
      }
    }
  }
  return hits;
}

function finishInstall(exit, error, results, warnings, wantJson, extra) {
  const payload = {
    ok: exit === EXIT.OK,
    command: 'install',
    exit,
    results,
    warnings,
    ...(error ? { message: error.message, details: error.details || [] } : {}),
    ...(extra || {})
  };
  if (wantJson) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    if (error) {
      console.error(`[install] ${error.message}`);
      for (const detail of error.details || []) console.error(`  - ${detail}`);
    }
    for (const item of results) {
      const prefix = item.exit === EXIT.OK ? 'OK  ' : 'FAIL';
      console.log(`${prefix}  ${item.host}  ${item.agent_dir}${item.message ? `  → ${item.message}` : ''}`);
      if (item.exit === EXIT.OK) {
        console.log(`      version=${item.version} link_mode=${item.link_mode} dirs=${item.managed_dirs} files=${item.managed_files} orphans=${item.orphans_removed}`);
      }
    }
    for (const warning of warnings) console.log(`  WARN  ${warning}`);
  }
  return payload;
}

export function runInstall(opts = {}) {
  const warnings = [];
  const results = [];
  const dryRun = opts.dryRun === true;
  const wantJson = opts.json === true;
  const cwd = path.resolve(opts.cwd || process.cwd());
  const useHome = opts.useHome !== false;
  const useLink = opts.useLink !== false;
  const homeRoot = resolveHelmHome({ env: opts.env, home: opts.homeDir });
  const cfgRoot = opts.cfgRoot || resolveConfigRoot([PKG_ROOT]);

  let cfg;
  let srcRoot;
  let version;
  let payloadSkills;
  let hostKeys;
  try {
    cfg = loadHosts(cfgRoot);
    srcRoot = path.resolve(opts.sourceDir || PKG_ROOT);
    version = readPackageVersion(srcRoot);
    payloadSkills = resolvePayloadSkills(srcRoot);
    hostKeys = selectHosts(cfg, opts.target == null ? 'auto' : opts.target, {
      cwd,
      ledger: loadLedger(homeRoot),
      defaultHost: opts.defaultHost
    });
    for (const key of hostKeys) validateSource(srcRoot, cfg.hosts[key]);
    const seen = new Map();
    for (const key of hostKeys) {
      const dest = resolveInstallDest(cfg.hosts[key], opts);
      if (seen.has(dest)) {
        throw new ArgError(`多个宿主解析到同一目标目录：${seen.get(dest)} 与 ${key} → ${dest}`);
      }
      seen.set(dest, key);
    }
  } catch (e) {
    const exit = e instanceof ArgError ? EXIT.ARG : (e instanceof SourceError ? EXIT.SOURCE : EXIT.IO);
    return finishInstall(exit, e, results, warnings, wantJson);
  }

  if (useHome && !dryRun) {
    try {
      ensureHomeDirs(homeRoot);
      const staged = stagePayload({
        homeRoot,
        srcRoot,
        cfg,
        payloadSkills,
        version,
        ref: opts.ref || null,
        commit: opts.commit || null
      });
      commitPayload(homeRoot, staged.staged);
    } catch (e) {
      return finishInstall(e instanceof SourceError ? EXIT.SOURCE : EXIT.IO, e, results, warnings, wantJson);
    }
  }

  let firstFailure = null;
  for (const hostKey of hostKeys) {
    const host = cfg.hosts[hostKey];
    const dest = resolveInstallDest(host, opts);
    const prevRaw = readManifest(dest);
    const conflict = detectConflict(dest, prevRaw, host);
    if (conflict && opts.force !== true) {
      results.push({
        host: hostKey,
        agent_dir: dest,
        exit: EXIT.CONFLICT,
        message: `目标已存在 HELM 产物但无安装清单（${conflict.join(', ')}），加 --force 纳管`
      });
      firstFailure = firstFailure || EXIT.CONFLICT;
      continue;
    }
    if (conflict) warnings.push(`[adopt] ${hostKey} 纳管既有路径: ${conflict.join(', ')}（不删除任何文件）`);

    try {
      const hostWarnings = [];
      const onWarn = (message) => hostWarnings.push(message);
      // dry-run 时 payload 尚未 stage（--dry-run 不建 home），改从源仓预演
      const surface = useHome && !dryRun
        ? linkPayloadToAgent({
          homeRoot, host, dest, preferLink: useLink, dryRun, platform: opts.platform, onWarn
        })
        : copySourceSurfaceToAgent({
          srcRoot, host, dest, payloadSkills, dryRun, platform: opts.platform, onWarn
        });

      // dry-run 不 stage payload，运行时文件同样从源仓预演
      const runtimeFiles = installRuntimeToAgent({
        runtimeDir: useHome && !dryRun ? path.join(homeRoot, 'payload', 'runtime') : null,
        srcRoot,
        dest,
        dryRun
      });
      const entries = surface.entries.concat(
        runtimeFiles.map((rel) => ({ rel, isDir: false, mode: dryRun ? 'planned-copy' : 'copied' }))
      );
      const orphans = cleanupOrphans(dest, prevRaw, entries, { dryRun, onLog: onWarn });
      const prev = migrateManifest(prevRaw);

      const manifest = {
        version,
        layout: LAYOUT_V2,
        host_key: hostKey,
        agent_dir: dest,
        agent_dir_kind: opts.agentDir ? 'custom' : (opts.location === 'global' ? 'global' : 'local'),
        link_mode: surface.linkMode,
        link_modes: Object.fromEntries(entries.filter((e) => e.mode !== 'noop').map((e) => [e.rel, e.mode])),
        payload_root: useHome ? path.join(homeRoot, 'payload') : null,
        install_location: opts.location === 'global' ? 'global' : 'local',
        source_kind: opts.ref ? 'remote' : 'local',
        source_dir: srcRoot,
        ref: opts.ref || null,
        commit: opts.commit || null,
        installed_at: (prev && prev.installed_at) || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        managed_dirs: [...new Set(entries.filter((e) => e.isDir).map((e) => e.rel))].sort(),
        managed_files: [...new Set(entries.filter((e) => !e.isDir).map((e) => e.rel))].sort()
      };
      writeManifest(dest, manifest, { dryRun });

      // 首次创建用户配置：不覆盖、不纳入 managed_*，卸载时保留
      const localPath = path.join(dest, LOCAL_YAML);
      if (!dryRun && !fs.existsSync(localPath)) {
        const exampleFrom = useHome
          ? path.join(homeRoot, 'payload', 'shared', LOCAL_EXAMPLE)
          : path.join(srcRoot, LOCAL_EXAMPLE);
        copyFileAtomic(exampleFrom, localPath);
      }

      if (!dryRun) {
        upsertInstallation({
          host_key: hostKey,
          agent_dir: dest,
          project_root: cwd,
          payload_root: manifest.payload_root,
          location: manifest.install_location,
          link_mode: manifest.link_mode,
          source_kind: manifest.source_kind,
          ref: manifest.ref,
          version,
          manifest_layout: manifest.layout,
          installed_at: manifest.installed_at
        }, homeRoot);
      }

      warnings.push(...hostWarnings);
      results.push({
        host: hostKey,
        agent_dir: dest,
        exit: EXIT.OK,
        version,
        layout: manifest.layout,
        link_mode: manifest.link_mode,
        payload_root: manifest.payload_root,
        managed_dirs: manifest.managed_dirs.length,
        managed_files: manifest.managed_files.length,
        orphans_removed: orphans.length,
        warnings: hostWarnings,
        dry_run: dryRun
      });
    } catch (e) {
      const exit = e && e.code === 'ELEDGERBUSY'
        ? EXIT.BUSY
        : (e instanceof SourceError ? EXIT.SOURCE : EXIT.IO);
      results.push({ host: hostKey, agent_dir: dest, exit, message: e.message });
      firstFailure = firstFailure || exit;
    }
  }

  if (opts.pruneLegacy === true) {
    const rules = loadLegacyRules(cfgRoot);
    for (const item of results) {
      if (item.exit !== EXIT.OK) continue;
      for (const hit of findLegacy(item.agent_dir, rules)) {
        if (opts.apply === true && dryRun !== true) {
          removeSurface(assertInside(item.agent_dir, hit.path));
          warnings.push(`[legacy] 已删除 ${hit.path}（${hit.id}）`);
        } else {
          warnings.push(`[legacy] 可清理 ${hit.path}（${hit.id}）—— 加 --apply 执行`);
        }
      }
    }
  }

  const okCount = results.filter((item) => item.exit === EXIT.OK).length;
  let exit = EXIT.OK;
  if (okCount !== results.length) {
    exit = okCount === 0 ? (firstFailure || EXIT.IO) : EXIT.PARTIAL;
  }
  return finishInstall(exit, null, results, warnings, wantJson);
}

if (isMain(import.meta.url)) {
  console.error('[install] 请通过 `helm-workflow install` 调用（scripts/cli.mjs）');
  process.exitCode = EXIT.ARG;
}
