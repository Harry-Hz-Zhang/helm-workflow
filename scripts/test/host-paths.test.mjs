import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadHosts } from '../lib/host-config.mjs';
import {
  STAGES,
  STAGE_DESCRIPTIONS,
  resolveCommandPath,
  resolveCommandName,
  commandParentDir,
  sourceSurfaceRoot,
  globalAgentDir,
  expandPattern
} from '../lib/host-paths.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const cfg = loadHosts(ROOT);

test('每个 ready 宿主的全部命令路径都可由布局推导且互不重复', () => {
  for (const [key, host] of Object.entries(cfg.hosts)) {
    if (host.status !== 'ready') continue;
    const paths = STAGES.map((stage) => resolveCommandPath(host, stage));
    assert.equal(paths.length, STAGES.length, key);
    assert.equal(new Set(paths).size, STAGES.length, `${key} 命令路径重复`);
    for (const rel of paths) assert.equal(path.isAbsolute(rel), false, `${key}: ${rel}`);
  }
});

test('全部宿主 × 全部阶段全部可推导（含 planned）', () => {
  for (const host of Object.values(cfg.hosts)) {
    for (const stage of STAGES) {
      assert.equal(typeof resolveCommandPath(host, stage), 'string');
    }
  }
});

test('agents 宿主的源布局在 .agents 内（缺陷 14）', () => {
  const host = cfg.hosts.agents;
  assert.equal(sourceSurfaceRoot(ROOT, host), path.join(ROOT, '.agents'));
  assert.equal(resolveCommandPath(host, 'apply'), 'commands/helm/apply.md');
});

test('copilot 使用 .prompt.md 双扩展名，continue 使用 .prompt', () => {
  const copilot = cfg.hosts['copilot-vscode'];
  assert.equal(resolveCommandPath(copilot, 'apply'), 'prompts/helm-apply.prompt.md');
  assert.equal(copilot.rules.frontmatter.applyTo, '**/*');
  const cont = cfg.hosts.continue;
  assert.equal(resolveCommandPath(cont, 'apply'), 'prompts/helm-apply.prompt');
});

test('flat 与 workflow 布局名字带 cluster 前缀', () => {
  assert.equal(resolveCommandPath(cfg.hosts.cursor, 'apply'), 'commands/helm-apply.md');
  assert.equal(resolveCommandPath(cfg.hosts.codex, 'apply'), 'workflow/helm-apply.md');
});

test('commandParentDir 对 root 布局返回 .', () => {
  assert.equal(commandParentDir(cfg.hosts.aider), '.');
  assert.equal(commandParentDir(cfg.hosts.cursor), 'commands');
  assert.equal(commandParentDir(cfg.hosts.claude), 'commands/helm');
});

test('未知 stage 抛错', () => {
  assert.throws(() => resolveCommandName(cfg.hosts.claude, 'nope'));
});

test('globalAgentDir 支持 {home} 与平台覆盖', () => {
  const claude = cfg.hosts.claude;
  assert.equal(globalAgentDir(claude, { platform: 'darwin', home: '/tmp/h', env: {} }), path.resolve('/tmp/h/.claude'));
  const opencode = cfg.hosts.opencode;
  // path.resolve 用宿主 OS 的分隔符，断言不能写死 '/'（Windows 上是 '\'）
  const opencodeDir = globalAgentDir(opencode, { platform: 'darwin', home: '/tmp/h', env: {} });
  assert.match(opencodeDir.split(path.sep).join('/'), /\.config\/opencode$/);
});

test('expandPattern 保留未知占位符', () => {
  assert.equal(expandPattern('{a}/{b}', { a: 'x' }), 'x/{b}');
});

test('STAGE_DESCRIPTIONS 覆盖全部阶段且全为英文', () => {
  assert.deepEqual(Object.keys(STAGE_DESCRIPTIONS).sort(), [...STAGES].sort());
  for (const [stage, text] of Object.entries(STAGE_DESCRIPTIONS)) {
    assert.equal(typeof text, 'string', stage);
    assert.ok(text.length > 0, `${stage} description 为空`);
    // 宿主菜单是英文界面，description 里不应有 CJK
    assert.doesNotMatch(text, /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/, `${stage} description 含中文`);
  }
});
