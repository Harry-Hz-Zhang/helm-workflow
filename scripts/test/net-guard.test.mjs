import test from 'node:test';
import assert from 'node:assert/strict';
import { NET_GUARD_PATTERN, frontmatterScalar } from '../verify.mjs';

test('NET_GUARD_PATTERN 命中 https 与 ssh 形式的内网地址', () => {
  const hits = [
    'see https://gitlab.example.corp/foo',
    'see https://wiki.example.internal/page',
    'registry=http://npm.example.intra/repo',
    'ssh://gitlab.corp/group/repo',
    'https://a.svc/x'
  ];
  for (const text of hits) assert.equal(NET_GUARD_PATTERN.test(text), true, `应命中：${text}`);
});

test('NET_GUARD_PATTERN 命中 scp 风格的 git 内网地址', () => {
  // 内部 Git 平台最常见的就是这种写法，只查 https:// 会整类漏掉
  const hits = [
    'git@gitlab.corp:group/repo.git',
    'git@gitlab.example.corp:group/repo.git'
  ];
  for (const text of hits) assert.equal(NET_GUARD_PATTERN.test(text), true, `应命中：${text}`);
});

test('NET_GUARD_PATTERN 命中裸内网域名与内网 IPv4', () => {
  const hits = [
    'gitlab.corp',
    'push to wiki.internal',
    'http://10.0.0.1/repo',
    'http://192.168.1.10/repo',
    'http://172.16.5.4/repo'
  ];
  for (const text of hits) assert.equal(NET_GUARD_PATTERN.test(text), true, `应命中：${text}`);
});

test('NET_GUARD_PATTERN 大小写不敏感', () => {
  assert.equal(NET_GUARD_PATTERN.test('HTTPS://GITLAB.CORP/foo'), true);
  assert.equal(NET_GUARD_PATTERN.test('GIT@GITLAB.CORP:g/r.git'), true);
});

test('NET_GUARD_PATTERN 命中私服与关闭 TLS 的写法', () => {
  const hits = ['registry.npm.example', 'npm config set strict-ssl false', 'STRICT-SSL=false'];
  for (const text of hits) assert.equal(NET_GUARD_PATTERN.test(text), true, `应命中：${text}`);
});

test('NET_GUARD_PATTERN 不误伤公开域名与正常配置', () => {
  const clean = [
    'git+https://github.com/Harry-Hz-Zhang/helm-workflow.git',
    'https://docs.npmjs.com/cli',
    'https://raw.githubusercontent.com/obra/superpowers/main/LICENSE',
    'export const INTERNAL_TIMEOUT = 30;',
    'strict-ssl 保持默认值',
    'user@github.com',
    'npx gitnexus@1.6.12',
    'com.example.* / com.acme.*'
  ];
  for (const text of clean) assert.equal(NET_GUARD_PATTERN.test(text), false, `不应命中：${text}`);
});

test('frontmatterScalar 取标量并去掉引号', () => {
  const text = '---\ndescription: Serial per-task implementation (strict mode)\n---\nbody\n';
  assert.equal(frontmatterScalar(text, 'description'), 'Serial per-task implementation (strict mode)');

  const quoted = '---\ndescription: "Quoted value"\n---\n';
  assert.equal(frontmatterScalar(quoted, 'description'), 'Quoted value');

  assert.equal(frontmatterScalar('no frontmatter\ndescription: x\n', 'description'), null);
  assert.equal(frontmatterScalar('---\nname: x\n---\n', 'description'), null);
});
