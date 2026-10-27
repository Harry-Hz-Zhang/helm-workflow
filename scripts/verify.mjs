#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXIT } from './lib/runtime-filenames.mjs';
import { loadHosts } from './lib/host-config.mjs';
import { STAGES, STAGE_DESCRIPTIONS, resolveCommandPath, sourceSurfaceRoot } from './lib/host-paths.mjs';
import { resolvePayloadSkills } from './lib/payload-skills.mjs';
import { isMain } from './lib/is-main.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const STAGE_SKILLS = STAGES.map((stage) => `helm-workflow-${stage}`);
const NON_STAGE_SKILLS = ['helm-workflow-git-discipline', 'helm-workflow-reverse-sync'];
const AGENTS = ['design-reviewer.md', 'implementer.md', 'implementation-reviewer.md', 'helm-explorer.md'];
const TEMPLATES = [
  'spec.md',
  'tasks.md',
  'log.md',
  'exploration-handoff.md',
  'helm-state.example.yaml',
  'helm-auto-memory.md',
  'implementer.context.md',
  'reviewer.context.md',
  'sprint-state.example.json',
  'code-review-report.md',
  'commit-impact-report.md'
];
const REFERENCES = [
  'skill-loading-contract.md',
  'chat-style-constitution.md',
  'workbench-resolution.md',
  'orchestration-patterns-helm.md',
  path.posix.join('installation', 'hosts-config.md'),
  path.posix.join('installation', 'instructions-snippet.md')
];
const CHAT_STYLE_SKILL = 'helm-workflow-chat-style';
const CHAT_STYLE_REFERENCE = 'references/chat-style-constitution.md';
const LICENSE_FILES = ['LICENSE', 'THIRD-PARTY-NOTICES.md'];
// 第三方来源的文件必须保留署名块，缺了就是许可违规（MIT 要求随附版权声明，PolyForm 要求 Required Notice）
const ATTRIBUTED_SKILLS = [
  'systematic-debugging',
  'gitnexus-cli',
  'gitnexus-debugging',
  'gitnexus-exploring',
  'gitnexus-guide',
  'gitnexus-impact-analysis',
  'gitnexus-setup'
];
const ATTRIBUTION_REFERENCE = 'THIRD-PARTY-NOTICES.md';
// 公开分发前的硬红线：payload 内的文件不得出现内网域名、私服地址、关闭 TLS 校验的写法。
// 公司专有名不写进校验器（那本身就是泄漏），由本机 helm-workflow.blocklist.local 提供。
// 覆盖 http(s)、ssh://、scp 风格 git@host:path、内网 IPv4，且大小写不敏感 ——
// 内部 Git 平台最常见的就是 scp 风格的 git@ 写法，只查 https:// 会漏掉。
export const NET_GUARD_PATTERN = new RegExp(
  [
    // http(s):// 或 ssh:// + 任意主机的内网后缀
    String.raw`(?:https?|ssh)://[^\s'"\`]*(?:\.(?:corp|internal|intra|lan|local)|\.svc)(?![a-z0-9])`,
    // scp 风格：user@host:path（内部 Git 平台的常见写法）
    String.raw`[a-z0-9._%+-]+@[a-z0-9.-]*\.(?:corp|internal|intra|lan|local|svc)(?![a-z0-9])`,
    // 裸内网域名（无 scheme）。排除 `com.internal.dto` / `com.internal.*` 这类包名占位，
    // 它们后面紧跟 . 或 *，不是主机名。
    String.raw`\b[a-z0-9-]+\.(?:corp|internal|intra|lan|svc)(?![a-z0-9.*])`,
    // 内网 IPv4 段
    String.raw`\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b`,
    String.raw`registry\.npm\.example`,
    String.raw`strict-ssl\s*[=:]?\s*false`
  ].join('|'),
  'i'
);
// 豁免必须精确到单个文件，且每条都要有理由。不豁免任何目录，也不豁免规则文档 ——
// 把真实内网地址写进 AGENTS.md 或 README 是最常见的泄漏路径。
export const NET_GUARD_SKIP = new Set([
  // 校验器自身必须写出被禁止的模式才能实现检测
  'scripts/verify.mjs',
  // 单测必须给出被禁止的样本才能验证护栏本身
  'scripts/test/net-guard.test.mjs',
  // 黑名单词表本身就是泄漏，且由本机提供、不入库；扫描它会自己命中自己
  'helm-workflow.blocklist.local'
]);
// 本机态文件的判定模式：只描述"什么样的文件不属于仓库"，不点名任何业务仓或具体路径。
// 与 .gitignore 同源，但不能只靠 .gitignore —— `git add -f` 会绕过它。
const LOCAL_STATE_PATTERNS = [
  /(^|\/)\.env(\.|$)/,
  /\.local\.yaml$/,
  /\.blocklist\.local$/,
  /\.code-workspace$/,
  /(^|\/)\.mcp\.json$/,
  /(^|\/)opencode\.json$/,
  /(^|\/)\.codex\/config\.toml$/,
  /(^|\/)reviews\//,
  /(^|\/)temp\//,
  /\.(pem|key|crt|cer|jks|keystore|p12)$/,
  /(^|\/)id_(rsa|ed25519|ecdsa|dsa)$/
];
// 扫描集 = git 索引里的全部文件 - 含 NUL 字节的二进制 - 单文件豁免。
// 不用扩展名白名单、不用目录白名单：新增语言、新增目录、无扩展名文件（Dockerfile、LICENSE、.gitignore）
// 都会整类漏掉，而漏掉的正是能藏住泄漏的地方。
const BINARY_PROBE_BYTES = 8192;

/** 返回 true = 二进制，false = 文本，null = 读取失败（不能当成安全跳过）。 */
function hasNulByte(abs) {
  let fd;
  try {
    fd = fs.openSync(abs, 'r');
    const buf = Buffer.alloc(BINARY_PROBE_BYTES);
    const n = fs.readSync(fd, buf, 0, BINARY_PROBE_BYTES, 0);
    for (let i = 0; i < n; i += 1) if (buf[i] === 0) return true;
    return false;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function listTrackedFiles(root) {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024
    });
    const files = out.split('\0').filter(Boolean);
    return files.length > 0 ? files : null;
  } catch {
    return null;
  }
}

function listByWalk(root) {
  const out = [];
  const walk = (rel) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '__pycache__') continue;
      const childRel = rel ? path.posix.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) walk(childRel);
      else if (entry.isFile()) out.push(childRel);
    }
  };
  walk('');
  return out;
}

/**
 * 收集内网红线扫描集。
 * basis 为 git 时覆盖全部已跟踪文件；git 不可用（未安装 git、或目录不是仓库）时退回全目录遍历，
 * 此时扫描范围反而更大，但会带上未跟踪文件。
 */
export function collectNetGuardFiles(root = ROOT) {
  const tracked = listTrackedFiles(root);
  const candidates = tracked ?? listByWalk(root);
  const files = [];
  const binary = [];
  const unreadable = [];
  for (const rel of candidates) {
    if (NET_GUARD_SKIP.has(rel)) continue;
    const nul = hasNulByte(path.join(root, rel));
    if (nul === null) unreadable.push(rel);
    else if (nul) binary.push(rel);
    else files.push(rel);
  }
  return { files, binary, unreadable, basis: tracked ? 'git' : 'walk' };
}
const CHAT_STYLE_SURFACES = [
  '.cursor/rules/helm-core.mdc',
  path.posix.join('.github', 'instructions', 'helm-core.instructions.md')
];
const EVIDENCE_LITERALS = [
  '### Skills Loaded',
  '### Review Evidence',
  '### 统一验证',
  '- 统一验证 UT:',
  '- exit code: 0',
  CHAT_STYLE_SKILL
];

/**
 * 取 frontmatter 里某个标量键的值（去掉引号与行尾空白）。
 * 只服务于「多宿主 description 是否漂移」这类等值比对，不做完整 YAML 解析。
 */
export function frontmatterScalar(text, key) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return null;
  const block = text.slice(3, end).replace(/\r\n/g, '\n');
  const match = block.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  if (!match) return null;
  const raw = match[1].trim();
  return raw.replace(/^(['"])(.*)\1$/, '$2');
}

/**
 * frontmatter 必须能被真实 YAML 解析器读取。
 * 最常见的破坏源是 U+00A0（不换行空格）和 Tab 被当成缩进 —— 宿主会静默丢弃整个 skill，
 * 所以这里做静态兜底（不引第三方 YAML 库）。
 */
export function validateFrontmatter(text, required = ['name', 'description']) {
  const problems = [];
  if (!text.startsWith('---')) return ['缺少 frontmatter 起始 ---'];
  const end = text.indexOf('\n---', 3);
  if (end < 0) return ['缺少 frontmatter 结束 ---'];
  const block = text.slice(3, end).replace(/\r\n/g, '\n');
  if (block.includes('\u00a0')) problems.push('frontmatter 含 U+00A0（不换行空格），YAML 缩进非法');
  if (block.includes('\t')) problems.push('frontmatter 含 Tab，YAML 缩进非法');
  for (const key of required) {
    if (!new RegExp(`^${key}:`, 'm').test(block)) problems.push(`frontmatter 缺 ${key}`);
  }
  return problems;
}

export function runVerify(opts = {}) {
  const items = [];
  const add = (name, status, detail = '') => items.push({ name, status, detail });
  const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

  let payloadNames = [];
  try {
    payloadNames = resolvePayloadSkills(ROOT);
    add('payload 集合可解析', payloadNames.length > 0 ? 'pass' : 'fail', `${payloadNames.length} 个`);
  } catch (e) {
    add('payload 集合可解析', 'fail', e.message);
  }

  // canonical 覆盖整个 payload（不是只覆盖 stage + 白名单），否则新增 skill 会漏检
  const canonicalNames = payloadNames.length > 0 ? payloadNames : [...STAGE_SKILLS, ...NON_STAGE_SKILLS];
  for (const name of canonicalNames) {
    const rel = path.posix.join('skills', name, 'SKILL.md');
    if (!exists(rel)) {
      add(`canonical skill ${name}`, 'fail', rel);
      continue;
    }
    add(`canonical skill ${name}`, 'pass', rel);

    const text = read(rel);
    const problems = validateFrontmatter(text, ['name', 'description', 'requires_skills']);
    add(`${name} frontmatter 可解析`, problems.length === 0 ? 'pass' : 'fail', problems.join('；'));
    if (problems.length === 0 && !new RegExp(`^name: ${name}$`, 'm').test(text)) {
      add(`${name} frontmatter name 与目录一致`, 'fail', `期望 name: ${name}`);
    }
  }

  for (const agent of AGENTS) {
    const rel = path.posix.join('agents', agent);
    if (!exists(rel)) continue;
    const problems = validateFrontmatter(read(rel));
    add(`agent ${agent} frontmatter 可解析`, problems.length === 0 ? 'pass' : 'fail', problems.join('；'));
  }

  // 薄壳 description 必须与 STAGE_DESCRIPTIONS 真源逐字一致，否则宿主菜单会漂移：
  // 同一个阶段在 Claude / Cursor / Codex / Copilot 里显示成不同文案。
  for (const shell of fs.readdirSync(path.join(ROOT, 'commands', 'helm'))) {
    const rel = path.posix.join('commands', 'helm', shell);
    const problems = validateFrontmatter(read(rel), ['description']);
    add(`command shell ${shell} frontmatter 可解析`, problems.length === 0 ? 'pass' : 'fail', problems.join('；'));
  }

  for (const name of STAGE_SKILLS) {
    const rel = path.posix.join('skills', name, 'SKILL.md');
    if (!exists(rel)) continue;
    add(`${name} 声明 Skills Loaded`, read(rel).includes('### Skills Loaded') ? 'pass' : 'fail', rel);
  }

  for (const agent of AGENTS) add(`agent ${agent}`, exists(path.posix.join('agents', agent)) ? 'pass' : 'fail', agent);
  for (const template of TEMPLATES) add(`template ${template}`, exists(path.posix.join('templates', template)) ? 'pass' : 'fail', template);
  for (const reference of REFERENCES) {
    add(`reference ${reference}`, exists(path.posix.join('references', reference)) ? 'pass' : 'fail', reference);
  }

  // 许可合规：许可证文件必须存在，第三方来源的文件必须带指向 NOTICE 的署名块
  for (const file of LICENSE_FILES) {
    add(`license file ${file}`, exists(file) ? 'pass' : 'fail', file);
  }
  for (const name of ATTRIBUTED_SKILLS) {
    const rel = path.posix.join('skills', name, 'SKILL.md');
    if (!exists(rel)) continue;
    add(`${name} 含第三方署名`, read(rel).includes(ATTRIBUTION_REFERENCE) ? 'pass' : 'fail', ATTRIBUTION_REFERENCE);
  }

  // 本机态文件绝不入库：按通配判定而不是按具体文件名白名单，改了名字同样拦得住。
  // 这些文件带本机绝对路径、业务仓名或凭据，公开后无法撤回。
  const trackedFiles = listTrackedFiles(ROOT) ?? [];
  const localStateOffenders = trackedFiles.filter((rel) => LOCAL_STATE_PATTERNS.some((re) => re.test(rel)));
  add(
    `本机态文件未入库（${trackedFiles.length} 个已跟踪文件）`,
    localStateOffenders.length === 0 ? 'pass' : 'fail',
    localStateOffenders.slice(0, 5).join('；')
  );

  // 公开分发红线：仓库内不得残留内网域名 / 私服地址 / 关闭 TLS 校验的写法。
  // 公司专有名不能用字面量写进校验器（那本身就是泄漏），改由本机 helm-workflow.blocklist.local 提供。
  const scan = collectNetGuardFiles(ROOT);
  const scanned = scan.files;

  const netHits = [];
  const patterns = [{ label: '内网域名 / 私服地址', re: NET_GUARD_PATTERN }];
  const localBlocklist = path.join(ROOT, 'helm-workflow.blocklist.local');
  if (fs.existsSync(localBlocklist)) {
    const lines = fs.readFileSync(localBlocklist, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    if (lines.length > 0) {
      // 词表由本机手写，可能含未转义的正则元字符：编译失败必须判 fail，不能静默跳过
      try {
        patterns.push({ label: '本机黑名单术语', re: new RegExp(lines.join('|'), 'i') });
        add('本机黑名单可编译', 'pass', `${lines.length} 条`);
      } catch (e) {
        add('本机黑名单可编译', 'fail', `helm-workflow.blocklist.local 正则非法：${e.message}`);
      }
    }
  }
  for (const rel of scanned) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const { label, re } of patterns) {
      if (re.test(text)) {
        netHits.push(`${rel}（${label}）`);
        break;
      }
    }
  }
  add(
    `内网标识扫描（${scanned.length} 个文件，来源 ${scan.basis}）`,
    netHits.length === 0 ? 'pass' : 'fail',
    netHits.slice(0, 8).join('；')
  );
  if (scan.binary.length > 0) {
    add('二进制文件跳过扫描', 'warn', `${scan.binary.length} 个：${scan.binary.slice(0, 3).join('；')}`);
  }
  // 读不到的文件无法判定是否泄漏，必须拦住，不能当成安全
  if (scan.unreadable.length > 0) {
    add('扫描集存在读取失败的文件', 'fail', scan.unreadable.slice(0, 5).join('；'));
  }

  // 表达宪法注入点：router 声明 + persona 指针 + 宿主常驻规则指针（真源由 REFERENCES 校验）
  if (exists('skills/helm-workflow-router/SKILL.md')) {
    const router = read('skills/helm-workflow-router/SKILL.md');
    add('router 声明表达宪法 skill', router.includes(`- ${CHAT_STYLE_SKILL}`) ? 'pass' : 'fail', CHAT_STYLE_SKILL);
  }
  for (const agent of AGENTS) {
    const rel = path.posix.join('agents', agent);
    if (!exists(rel)) continue;
    add(`agent ${agent} 指向表达宪法`, read(rel).includes(CHAT_STYLE_REFERENCE) ? 'pass' : 'fail', CHAT_STYLE_REFERENCE);
  }
  for (const rel of CHAT_STYLE_SURFACES) {
    if (!exists(rel)) continue;
    add(`${rel} 指向表达宪法`, read(rel).includes(CHAT_STYLE_REFERENCE) ? 'pass' : 'fail', CHAT_STYLE_REFERENCE);
  }

  if (exists('templates/log.md')) {
    const log = read('templates/log.md');
    for (const literal of EVIDENCE_LITERALS) {
      add(`log.md 含「${literal}」`, log.includes(literal) ? 'pass' : 'fail', '');
    }
  }

  let cfg = null;
  try {
    cfg = loadHosts(ROOT);
    add('hosts 配置', 'pass', cfg.file);
  } catch (e) {
    add('hosts 配置', 'fail', e.message);
  }
  if (cfg) {
    for (const [key, host] of Object.entries(cfg.hosts)) {
      const surface = sourceSurfaceRoot(ROOT, host);
      const missing = [];
      for (const stage of STAGES) {
        const rel = resolveCommandPath(host, stage);
        const abs = path.join(surface, rel);
        const shown = path.relative(ROOT, abs).split(path.sep).join('/');
        if (fs.existsSync(abs)) add(`host ${key} ${stage}`, 'pass', shown);
        else if (host.status === 'ready') add(`host ${key} ${stage}`, 'fail', shown);
        else missing.push(shown);
      }
      if (missing.length > 0) add(`host ${key} 薄壳`, 'warn', `status=${host.status}，缺 ${missing.length}/${STAGES.length}：${missing[0]} …`);

      // 同一阶段的薄壳在 8 个宿主面各存一份，description 必须逐字等同，
      // 否则同一个 /helm:apply 在不同宿主里显示成不同文案（英文改写时最容易漏掉某个面）。
      if (host.status === 'ready') {
        const drift = [];
        for (const stage of STAGES) {
          const abs = path.join(surface, resolveCommandPath(host, stage));
          if (!fs.existsSync(abs)) continue;
          const actual = frontmatterScalar(fs.readFileSync(abs, 'utf8'), 'description');
          if (actual !== STAGE_DESCRIPTIONS[stage]) drift.push(`${stage}: ${actual ?? '(缺失)'}`);
        }
        add(`host ${key} 薄壳 description 与真源一致`, drift.length === 0 ? 'pass' : 'fail', drift.slice(0, 3).join('；'));
      }
      for (const check of host.checks) {
        // checks 描述的是"安装后应有"的产物：命令/规则在宿主表面，skills/agents/templates 是共享 payload
        const abs = path.join(surface, check.path);
        const shared = path.join(ROOT, check.path);
        const found = fs.existsSync(abs) || fs.existsSync(shared);
        if (found) add(`host ${key} check ${check.path}`, 'pass', '');
        else if (check.severity === 'fail' && host.status === 'ready') add(`host ${key} check ${check.path}`, 'fail', check.path);
        else add(`host ${key} check ${check.path}`, 'warn', check.path);
      }
    }
  }

  if (exists('references/installation/hosts-config.md') && cfg) {
    const doc = read('references/installation/hosts-config.md');
    for (const [key, host] of Object.entries(cfg.hosts)) {
      const row = doc.split('\n').find((line) => line.startsWith(`| ${key} |`));
      // commandDir 为 '.' 时 includes('.') 恒真，退化为只校验行存在
      const inDoc = Boolean(row) && (host.commandDir === '.' || row.includes(host.commandDir));
      add(`hosts-config.md 覆盖 ${key}`, inDoc ? 'pass' : 'warn', inDoc ? '' : '文档表格未同步（不阻断）');
    }
  }

  const failed = items.filter((item) => item.status === 'fail').length;
  const warned = items.filter((item) => item.status === 'warn').length;
  const passed = items.filter((item) => item.status === 'pass').length;
  const exit = failed > 0 ? EXIT.CHECK : EXIT.OK;

  if (opts.json === true) {
    console.log(JSON.stringify({ ok: exit === EXIT.OK, command: 'verify', exit, passed, failed, warned, items }, null, 2));
  } else {
    for (const item of items) {
      const label = item.status === 'pass' ? 'PASS' : (item.status === 'warn' ? 'WARN' : 'FAIL');
      console.log(`${label}  ${item.name}${item.detail ? `  ${item.detail}` : ''}`);
    }
    console.log(`\n${passed} passed, ${failed} failed, ${warned} warned`);
  }
  return { exit, passed, failed, warned, items };
}

if (isMain(import.meta.url)) {
  process.exitCode = runVerify({ json: process.argv.includes('--json') }).exit;
}
