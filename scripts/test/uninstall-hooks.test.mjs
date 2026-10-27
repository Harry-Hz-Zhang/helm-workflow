import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInstall } from '../install.mjs';
import { runUninstall, removeHostReferences } from '../uninstall.mjs';
import { writeManifest, readManifest } from '../lib/manifest.mjs';
import { loadHosts } from '../lib/host-config.mjs';
import { EXIT } from '../lib/runtime-filenames.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const cfg = loadHosts(ROOT);

function installed() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-hooks-'));
  const home = path.join(base, 'home');
  const dest = path.join(base, '.claude');
  const res = runInstall({ target: 'claude', agentDir: dest, homeDir: home, sourceDir: ROOT, cwd: base, json: true });
  assert.equal(res.exit, 0, JSON.stringify(res));
  return { base, home, dest };
}

test('hooks 条目先被摘除，再删受管文件', () => {
  const box = installed();
  const settings = path.join(box.dest, 'settings.json');
  fs.writeFileSync(settings, JSON.stringify({
    hooks: { PostToolUse: [{ matcher: '*', hooks: [{ command: 'helm-hook-a' }] }, { matcher: 'x', hooks: [{ command: 'other' }] }] }
  }, null, 2), 'utf8');

  const host = { hooks: { file: 'settings.json', entries: [{ jsonPath: 'hooks.PostToolUse', matchContains: 'helm' }] } };
  const warnings = [];
  const result = removeHostReferences({ dest: box.dest, host, warnings });
  assert.equal(result.removed, 1);
  const after = JSON.parse(fs.readFileSync(settings, 'utf8'));
  assert.equal(after.hooks.PostToolUse.length, 1);
  assert.match(JSON.stringify(after), /other/);
});

test('宿主配置 JSON 非法 → 该配置零改动、返回 error', () => {
  const box = installed();
  const settings = path.join(box.dest, 'settings.json');
  fs.writeFileSync(settings, '{ broken json', 'utf8');
  const direct = removeHostReferences({
    dest: box.dest,
    host: { hooks: { file: 'settings.json', entries: [{ jsonPath: 'hooks.PostToolUse' }] } }
  });
  assert.match(direct.error, /JSON 非法/);
  assert.equal(fs.readFileSync(settings, 'utf8'), '{ broken json', '非法配置不得被重写');
});

test('kept 列表与实际剩余文件一致，且 local.yaml 被保留', () => {
  const box = installed();
  fs.writeFileSync(path.join(box.dest, 'user-note.md'), 'mine\n');
  const result = runUninstall({ agentDir: box.dest, homeDir: box.home, json: true });
  assert.equal(result.exit, EXIT.OK, JSON.stringify(result));
  const kept = result.results[0].kept;
  assert.ok(kept.includes('user-note.md'));
  assert.ok(kept.includes('helm-workflow.local.yaml'));
  for (const rel of kept) assert.ok(fs.existsSync(path.join(box.dest, rel)), `${rel} 已不存在却出现在 kept`);
});

test('无清单时拒绝删除（退出 1）', () => {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-nomanifest-'));
  fs.mkdirSync(path.join(dest, 'skills'), { recursive: true });
  const result = runUninstall({ agentDir: dest, homeDir: path.join(dest, 'h'), cfgRoot: ROOT, json: true });
  assert.equal(result.exit, EXIT.CHECK);
  assert.ok(fs.existsSync(path.join(dest, 'skills')));
});
