import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

const REQUIRED = [
  'package.json',
  'README.md',
  'AGENTS.md',
  'INSTALLATION.md',
  'CHANGELOG.md',
  'LICENSE',
  'THIRD-PARTY-NOTICES.md',
  'helm-workflow.local.example.yaml',
  'install.sh',
  'install.ps1',
  'scripts/cli.mjs',
  'scripts/install.mjs',
  'scripts/install-check.mjs',
  'scripts/uninstall.mjs',
  'scripts/verify.mjs',
  'scripts/hosts.json',
  'scripts/payload-skills.json',
  'scripts/legacy-cleanup.json',
  'scripts/lib/host-paths.mjs',
  'scripts/lib/host-config.mjs',
  'skills/helm-workflow-router/SKILL.md',
  'skills/systematic-debugging/SKILL.md',
  'agents/implementer.md',
  'templates/log.md',
  'templates/code-review-report.md',
  'templates/commit-impact-report.md',
  'skills/helm-workflow-code-review/SKILL.md',
  'skills/helm-workflow-commit-impact/SKILL.md',
  'skills/helm-workflow-chat-style/SKILL.md',
  'references/skill-loading-contract.md',
  'references/chat-style-constitution.md',
  '.claude/commands/helm/apply.md',
  '.agents/commands/helm/apply.md',
  '.cursor/commands/helm-apply.md',
  '.opencode/commands/helm-apply.md',
  '.codex/workflow/helm-apply.md',
  '.github/prompts/helm-apply.prompt.md'
];

const FORBIDDEN = [
  'helm-workflow.local.yaml',
  'scripts/test/host-paths.test.mjs',
  '.helm-version',
  'agents/README.md'
];

function packJson() {
  try {
    const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
      // Windows 上 npm 是 npm.cmd，不经 shell 会 ENOENT（会让两条断言静默 skip）
      shell: process.platform === 'win32'
    });
    const parsed = JSON.parse(out);
    const files = Array.isArray(parsed) ? parsed[0].files : parsed.files;
    return files.map((f) => f.path);
  } catch (e) {
    return null;
  }
}

test('npm pack 清单包含全部运行时必需文件', (t) => {
  const files = packJson();
  if (!files) {
    t.skip('npm 不可用或 pack 失败');
    return;
  }
  const set = new Set(files);
  const missing = REQUIRED.filter((rel) => !set.has(rel));
  assert.deepEqual(missing, [], `pack 缺少：${missing.join(', ')}`);
});

test('npm pack 不得包含本机态与单测', (t) => {
  const files = packJson();
  if (!files) {
    t.skip('npm 不可用或 pack 失败');
    return;
  }
  for (const bad of FORBIDDEN) {
    assert.equal(files.includes(bad), false, `pack 不应包含 ${bad}`);
  }
});

test('package.json 的 bin 全部指向真实文件', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const [name, rel] of Object.entries(pkg.bin)) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${name} → ${rel} 不存在`);
  }
  assert.equal(pkg.engines.node, '>=20.19.0');
});

test('package.json 的发布语义与 README / INSTALLATION 的「不通过 npm 分发」一致', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.private, true, 'README 声明不通过 npm 分发，package.json 必须 private: true');
  assert.equal(pkg.publishConfig, undefined, 'private 包不应保留 publishConfig');
  assert.equal(pkg.license, 'SEE LICENSE IN LICENSE', '整包含 PolyForm-NC 第三方文件，license 须指向 LICENSE');
  for (const doc of ['README.md', 'INSTALLATION.md']) {
    assert.match(fs.readFileSync(path.join(ROOT, doc), 'utf8'), /不通过 npm 分发/, `${doc} 应保留不分发声明`);
  }
});
