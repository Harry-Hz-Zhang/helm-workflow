import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertInside, applyEntry, removeSurface } from '../lib/agent-link.mjs';

function tmp(prefix = 'helm-path-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('assertInside 拒绝绝对路径、.. 与空串', () => {
  const root = tmp();
  assert.throws(() => assertInside(root, '/etc/passwd'), /必须相对/);
  assert.throws(() => assertInside(root, '../escape'), /越出/);
  assert.throws(() => assertInside(root, 'a/../../escape'), /越出/);
  assert.throws(() => assertInside(root, ''), /空/);
  assert.ok(assertInside(root, 'skills/x/SKILL.md').startsWith(path.resolve(root)));
});

test('同名前缀目录不被误判为根内', () => {
  const root = tmp();
  const sibling = `${root}2`;
  const rel = path.relative(root, path.join(sibling, 'x'));
  assert.throws(() => assertInside(root, rel), /越出/);
});

test('removeSurface 对链接只摘链接，不删真源内容', () => {
  const root = tmp();
  const outside = tmp('helm-outside-');
  fs.writeFileSync(path.join(outside, 'keep.md'), 'keep\n');
  const link = path.join(root, 'linked');
  try {
    fs.symlinkSync(outside, link, 'dir');
  } catch {
    return; // 平台不支持符号链接时跳过
  }
  removeSurface(link);
  assert.equal(fs.existsSync(link), false);
  assert.equal(fs.readFileSync(path.join(outside, 'keep.md'), 'utf8'), 'keep\n');
});

test('EXDEV 时回退 copy（不抛错）', () => {
  const root = tmp();
  const src = path.join(root, 'src');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, 'a.md'), 'a\n');
  const dest = path.join(root, 'dest');
  const mode = applyEntry({
    root: dest,
    rel: 'templates',
    target: src,
    isDir: true,
    preferLink: true,
    linkFn: () => {
      const e = new Error('EXDEV');
      e.code = 'EXDEV';
      throw e;
    }
  });
  assert.equal(mode, 'copied');
  assert.equal(fs.readFileSync(path.join(dest, 'templates', 'a.md'), 'utf8'), 'a\n');
});
