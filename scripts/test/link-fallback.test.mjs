import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyEntry, mergeLinkMode, isLinkTo } from '../lib/agent-link.mjs';

function srcDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-link-'));
  const src = path.join(root, 'src');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, 'SKILL.md'), '# x\n');
  return { root, src };
}

test('link 抛 EPERM 时回退 copy 并返回 copied', () => {
  const { root, src } = srcDir();
  const dest = path.join(root, 'dest');
  const modes = [];
  const mode = applyEntry({
    root: dest,
    rel: 'skills/demo',
    target: src,
    isDir: true,
    preferLink: true,
    onWarn: (m) => modes.push(m),
    linkFn: () => {
      const error = new Error('EPERM');
      error.code = 'EPERM';
      throw error;
    }
  });
  assert.equal(mode, 'copied');
  assert.equal(fs.readFileSync(path.join(dest, 'skills', 'demo', 'SKILL.md'), 'utf8'), '# x\n');
  assert.equal(modes.length, 1);
  assert.match(modes[0], /EPERM/);
});

test('link 成功时返回 linked，且 isLinkTo 判定为真', () => {
  const { root, src } = srcDir();
  const dest = path.join(root, 'dest');
  const mode = applyEntry({ root: dest, rel: 'skills/demo', target: src, isDir: true, preferLink: true });
  assert.equal(mode, 'linked');
  assert.equal(isLinkTo(src, path.join(dest, 'skills', 'demo')), true);
});

test('link_mode 归并：任一 copy 即整体 copy', () => {
  assert.equal(mergeLinkMode(['linked', 'linked'], 'linux'), 'symlink');
  assert.equal(mergeLinkMode(['linked', 'copied'], 'linux'), 'copy');
  assert.equal(mergeLinkMode(['planned-copy'], 'linux'), 'copy');
  assert.equal(mergeLinkMode(['planned-link'], 'win32'), 'junction');
});

test('重复应用同一链接返回 noop', () => {
  const { root, src } = srcDir();
  const dest = path.join(root, 'dest');
  assert.equal(applyEntry({ root: dest, rel: 'skills/demo', target: src, isDir: true, preferLink: true }), 'linked');
  assert.equal(applyEntry({ root: dest, rel: 'skills/demo', target: src, isDir: true, preferLink: true }), 'noop');
});
