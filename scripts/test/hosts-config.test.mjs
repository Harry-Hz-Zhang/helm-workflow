import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  loadHosts,
  normalizeHost,
  normalizeHosts,
  resolveHostKey,
  selectHosts,
  ArgError
} from '../lib/host-config.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

test('当前 hosts.json 满足 schema v2 且全部可校验', () => {
  const cfg = loadHosts(ROOT);
  assert.equal(cfg.schemaVersion, 2);
  assert.equal(Object.keys(cfg.hosts).length, 14);
  assert.equal(Object.values(cfg.hosts).filter((h) => h.status === 'ready').length, 6);
});

test('v1 字段可映射：command_layout / slash_style / agent_source / maturity', () => {
  const nested = normalizeHost('claude', {
    command_layout: 'nested',
    slash_style: 'colon',
    agent_source: 'root',
    maturity: 'p0'
  });
  assert.equal(nested.commandDir, 'commands/{cluster}');
  assert.equal(nested.commandName, '{stage}');
  assert.equal(nested.slashStyle, 'colon');
  assert.equal(nested.agentSource, 'root');
  assert.equal(nested.status, 'ready', 'p0 缺 status 时推导为 ready');

  const flat = normalizeHost('cursor', { command_layout: 'flat', maturity: 'p1' });
  assert.equal(flat.commandDir, 'commands');
  assert.equal(flat.commandName, '{cluster}-{stage}');
  assert.equal(flat.status, 'planned');
});

test('legacy 无 schemaVersion 的裸 host 表也能归一化', () => {
  const cfg = normalizeHosts({ claude: { command_layout: 'nested', maturity: 'p0' } });
  assert.ok(cfg.hosts.claude);
  assert.equal(cfg.sourceVersion, 1);
});

test('planned 宿主被 selectHosts 以 ArgError 拒绝', () => {
  const cfg = loadHosts(ROOT);
  assert.throws(() => selectHosts(cfg, 'codebuddy'), (e) => e instanceof ArgError && e.exitCode === 2);
});

test('未知宿主 / 空 target 均抛 ArgError', () => {
  const cfg = loadHosts(ROOT);
  assert.throws(() => resolveHostKey(cfg, 'nosuchhost'), ArgError);
  assert.throws(() => resolveHostKey(cfg, ''), ArgError);
});

test('别名可解析且 requireReady=false 时允许 planned', () => {
  const cfg = loadHosts(ROOT);
  assert.equal(resolveHostKey(cfg, 'zcode'), 'agents');
  assert.deepEqual(selectHosts(cfg, 'codebuddy', { requireReady: false }), ['codebuddy']);
});

test('非法 checks.severity 被拒绝', () => {
  assert.throws(
    () => normalizeHost('x', { maturity: 'p0', checks: [{ path: 'a', severity: 'block' }] }),
    /severity/
  );
});

test('ready 宿主必须至少有一条 severity=fail 的 check', () => {
  assert.throws(
    () => normalizeHost('x', { maturity: 'p0', checks: [{ path: 'a', severity: 'warn' }] }),
    /severity=fail/
  );
});
