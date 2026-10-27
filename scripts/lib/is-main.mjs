import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** 本模块 MUST 自包含：不得 import agent-link.mjs，否则形成 C8 → C9 的依赖倒挂 */
function realpathOrNull(target) {
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

/** 通过 symlink / npm bin shim 调用时也能正确判定"被直接执行" */
export function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  const selfPath = fileURLToPath(metaUrl);
  const left = realpathOrNull(path.resolve(argv1));
  const right = realpathOrNull(path.resolve(selfPath));
  if (left && right) {
    const normalize = (value) => (process.platform === 'win32' ? value.toLowerCase() : value);
    if (normalize(left) === normalize(right)) return true;
  }
  return path.basename(path.resolve(selfPath)) === path.basename(path.resolve(argv1));
}
