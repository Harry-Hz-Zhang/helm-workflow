---
name: helm-workflow-reverse-sync
description: Stops implementation when artifacts conflict with code facts or user constraints. Use during propose, apply, or fix when spec/proposal/design/tasks disagree with reality.
requires_skills: []
---

# HELM Reverse Sync

## Overview

文档是事实源。实现偏离文档时，**先更新 artifacts，再继续编码**。

## When to Use

- 实现中发现 spec 缺项
- proposal/specs/design 与代码事实冲突
- 用户口述与 formal artifacts 冲突
- 边界条件、集成点在文档中缺失

## Process

1. **STOP** — 不得自行脑补实现
2. 记录冲突点（文件路径、类/方法、artifact 章节）
3. 标明必须回写的 artifact：`proposal` / `specs` / `design` / `tasks`
4. 在 `log.md` 记录偏差与处理方式
5. 更新 `.helm-state.yaml`：`reverse_sync_required: true`（直至回写完成置 false）
6. 主会话或用户完成 artifact 更新后，才继续原 task

## When NOT to Use

- 只是实现细节与 design 的措辞差异，不影响对外行为。
- 只是 tasks 顺序调整，且依赖关系未变。
- 代码尚未开始写（apply 之前的所有偏差走 propose 修订，不走 Reverse Sync）。

## 触发条件（任意一条）

| # | 触发 |
| --- | --- |
| T1 | `specs/` 中的 Requirement 与代码实际行为不符 |
| T2 | `design.md` 的技术决策与实现所需能力不符 |
| T3 | `tasks.md` 的 `files:` 与实际改动文件不符 |
| T4 | `apply_mode` 在 `tasks.md` 与 `.helm-state.yaml` 不一致 |
| T5 | `target_repos` 未覆盖实际需要写入的仓库 |
| T6 | 用户新增约束（配置、依赖、环境限制）使原方案不可行 |

## 证据格式（MUST）

在 `log.md` 写：

```markdown
### Reverse Sync

| 时间 | 触发 | 原文档内容 | 代码事实 | 处理 |
| --- | --- | --- | --- | --- |
| 2026-10-25T14:02 | T1 | spec 要求返回 200 | 实际返回 202 | 修订 spec Requirement |
```

**规则**：

- MUST NOT 只写"已同步"，必须写清"原内容 vs 事实 vs 处理"。
- 修订后 MUST 把 `.helm-state.yaml` 的 `reverse_sync_required` 置回 `false`。
- `target_repos` 补清单流程：未声明仓 → 硬停 → 补 yaml + 在 `design.md` 镜像 → 再置 `false`。


## Verification

- [ ] 冲突已写入 `log.md`
- [ ] 相关 artifact 已更新且互相一致
- [ ] 子代理输出 `REVERSE_SYNC_REQUIRED` 时主会话未继续 commit

## Red flags

- 先改代码再补文档
- 用「后面实现时再看」绕过 propose 澄清
- 静默采纳与 spec 冲突的实现
