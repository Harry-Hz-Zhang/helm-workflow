import fs from 'node:fs';
import path from 'node:path';

/**
 * payload skill 集合的**唯一真源**：`scripts/payload-skills.json` 的
 * `prefix`（默认 helm-workflow-）∪ `whitelist`。
 *
 * 安装、校验、孤儿清理三处 MUST 都调用本函数，禁止各自再算一次。
 */

const DEFAULT_PREFIX = 'helm-workflow-';

function readConfig(pkgRoot) {
  const file = path.join(pkgRoot, 'scripts', 'payload-skills.json');
  if (!fs.existsSync(file)) {
    throw new Error(`payload 白名单缺失：${file}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`payload 白名单不可解析：${file}（${err.message}）`);
  }
  return {
    prefix: typeof parsed.prefix === 'string' && parsed.prefix ? parsed.prefix : DEFAULT_PREFIX,
    whitelist: Array.isArray(parsed.whitelist) ? parsed.whitelist.filter((v) => typeof v === 'string') : []
  };
}

/**
 * 返回 payload 要安装的 skill 目录名（去重、稳定排序）。
 *
 * @param {string} pkgRoot 包根目录（含 skills/ 与 scripts/）
 * @returns {string[]}
 */
export function resolvePayloadSkills(pkgRoot) {
  if (!pkgRoot || typeof pkgRoot !== 'string') {
    throw new Error('resolvePayloadSkills 需要包根目录');
  }
  const skillsDir = path.join(pkgRoot, 'skills');
  if (!fs.existsSync(skillsDir)) {
    throw new Error(`skills 目录不存在：${skillsDir}`);
  }
  const { prefix, whitelist } = readConfig(pkgRoot);
  const existing = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const selected = new Set();
  for (const name of existing) {
    if (name.startsWith(prefix)) selected.add(name);
  }
  for (const name of whitelist) {
    if (existing.includes(name)) selected.add(name);
  }

  if (selected.size === 0) {
    throw new Error(`payload skill 集合为空：${skillsDir}（检查 payload-skills.json 的 prefix / whitelist）`);
  }
  return [...selected].sort();
}

/** 白名单里登记但 skills/ 下不存在的项（供 verify 报错用） */
export function missingWhitelistSkills(pkgRoot) {
  const { whitelist } = readConfig(pkgRoot);
  const skillsDir = path.join(pkgRoot, 'skills');
  return whitelist.filter((name) => !fs.existsSync(path.join(skillsDir, name)));
}
