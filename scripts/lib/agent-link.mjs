import fs from 'node:fs';
import path from 'node:path';

const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY', 'EEXIST']);

export function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function withRetry(fn, opts = {}) {
  const retries = opts.retries == null ? 4 : opts.retries;
  const delays = opts.delays || [20, 60, 150, 400];
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return fn();
    } catch (e) {
      last = e;
      if (!e || !RETRY_CODES.has(e.code) || attempt === retries) throw e;
      sleepSync(delays[Math.min(attempt, delays.length - 1)]);
    }
  }
  throw last;
}

export function realpathOrNull(target) {
  try {
    return fs.realpathSync.native(target);
  } catch (e1) {
    try {
      return fs.realpathSync(target);
    } catch (e2) {
      return null;
    }
  }
}

export function normalizeForCompare(value) {
  const abs = path.resolve(String(value));
  return process.platform === 'win32' ? abs.toLowerCase() : abs;
}

/** 越界校验：大小写不敏感 + realpath 兜底（防 junction 越界） */
export function assertInside(root, rel) {
  if (typeof rel !== 'string' || rel.trim() === '') throw new Error('非法相对路径（空）');
  if (path.isAbsolute(rel)) throw new Error(`非法路径（必须相对）: ${rel}`);
  const rootAbs = path.resolve(root);
  const abs = path.resolve(rootAbs, rel);
  const normRoot = normalizeForCompare(rootAbs);
  const normAbs = normalizeForCompare(abs);
  if (!(normAbs === normRoot || normAbs.startsWith(normRoot + path.sep))) {
    throw new Error(`非法路径（越出目标目录）: ${rel}`);
  }
  const realRoot = realpathOrNull(rootAbs);
  const realParent = realpathOrNull(path.dirname(abs));
  if (realRoot && realParent) {
    const nr = normalizeForCompare(realRoot);
    const np = normalizeForCompare(realParent);
    if (!(np === nr || np.startsWith(nr + path.sep))) {
      throw new Error(`非法路径（realpath 越界）: ${rel}`);
    }
  }
  return abs;
}

export function isLinkTo(targetAbs, destAbs) {
  let stat;
  try {
    stat = fs.lstatSync(destAbs);
  } catch {
    return false;
  }
  if (!stat.isSymbolicLink()) return false;
  const targetReal = realpathOrNull(targetAbs);
  const destReal = realpathOrNull(destAbs);
  if (targetReal && destReal) {
    return normalizeForCompare(targetReal) === normalizeForCompare(destReal);
  }
  try {
    const link = fs.readlinkSync(destAbs);
    return normalizeForCompare(path.resolve(path.dirname(destAbs), link)) === normalizeForCompare(targetAbs);
  } catch {
    return false;
  }
}

/** 只删表面：link 用 unlink，绝不对链接做 recursive rm（否则会删真源） */
export function removeSurface(targetAbs) {
  let stat;
  try {
    stat = fs.lstatSync(targetAbs);
  } catch {
    return false;
  }
  if (stat.isSymbolicLink()) {
    withRetry(() => fs.unlinkSync(targetAbs));
    return true;
  }
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(targetAbs)) {
      removeSurface(path.join(targetAbs, name));
    }
    withRetry(() => fs.rmdirSync(targetAbs));
    return true;
  }
  withRetry(() => fs.unlinkSync(targetAbs));
  return true;
}

export function mkdirp(target) {
  fs.mkdirSync(target, { recursive: true });
}

export function listFilesRecursive(root) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else out.push(rel);
    }
  };
  if (fs.existsSync(root)) walk(root, '');
  return out.sort();
}

export function copyFileAtomic(src, dest) {
  mkdirp(path.dirname(dest));
  const tmp = `${dest}.helm-tmp-${process.pid}-${Math.random().toString(16).slice(2, 8)}`;
  withRetry(() => fs.copyFileSync(src, tmp));
  try {
    withRetry(() => fs.renameSync(tmp, dest));
  } catch (e) {
    try {
      removeSurface(tmp);
    } catch (ignored) {
      /* 清理失败不掩盖原始错误 */
    }
    throw e;
  }
}

export function copyDirFresh(src, dest) {
  mkdirp(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirFresh(from, to);
    else copyFileAtomic(from, to);
  }
}

export function defaultLinkFn(platform) {
  return (target, dest, isDir) => {
    if (platform === 'win32' && isDir) {
      fs.symlinkSync(target, dest, 'junction');
    } else {
      fs.symlinkSync(target, dest, isDir ? 'dir' : 'file');
    }
  };
}

/**
 * 应用单个受管条目。
 * 返回 'noop' | 'linked' | 'copied' | 'planned-link' | 'planned-copy'
 */
export function applyEntry(opts) {
  const { root, rel, target, isDir } = opts;
  const dest = assertInside(root, rel);
  const preferLink = opts.preferLink === true;
  const dryRun = opts.dryRun === true;
  const onWarn = typeof opts.onWarn === 'function' ? opts.onWarn : () => {};

  if (!fs.existsSync(target)) throw new Error(`payload 条目缺失: ${target}`);
  if (preferLink && isLinkTo(target, dest)) return 'noop';
  if (dryRun) return preferLink ? 'planned-link' : 'planned-copy';

  mkdirp(path.dirname(dest));

  if (preferLink) {
    removeSurface(dest);
    try {
      (opts.linkFn || defaultLinkFn(opts.platform || process.platform))(target, dest, isDir);
      return 'linked';
    } catch (e) {
      onWarn(`link 失败（${dest}，${e.code || 'UNKNOWN'}），回退 copy`);
      removeSurface(dest);
    }
  }

  if (isDir) copyDirFresh(target, dest);
  else copyFileAtomic(target, dest);
  return 'copied';
}

/** 顶层 link_mode 归并：任何一条 copy 即整体 copy */
export function mergeLinkMode(modes, platform) {
  if (modes.some((m) => m === 'copied' || m === 'copied-fallback')) return 'copy';
  if (modes.every((m) => m === 'planned-copy')) return 'copy';
  return platform === 'win32' ? 'junction' : 'symlink';
}
