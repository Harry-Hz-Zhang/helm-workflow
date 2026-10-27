---
name: helm-workflow-status
description: Show active changes, complexity mode, task progress, review stage, and next recommended HELM command.
requires_skills:
  - helm-workflow-router
---

# HELM Status

## Overview

汇总活跃 change 的 OpenSpec 状态、tasks 进度、`.helm-state.yaml` 与 log，并推荐下一步 slash/command。

## When to Use

- 不确定当前进行到何阶段
- 多 change 并行时需选型

## Process

> **前置加载（HARD-GATE）**：MUST 用 Skill 工具实际加载 frontmatter `requires_skills` 的全部项（声明 ≠ 加载）；
> MUST 在本阶段日志写入 `### Skills Loaded` 证据段，声明了但未列出的依赖判为未加载；
> 任一项加载失败 → 立即停止，不得降级继续。
> 路径基准：仓库根相对路径（见 `references/skill-loading-contract.md` 第 0 节）。
> 完整规则见 `references/skill-loading-contract.md`。
   阶段路由 / 命令表以已加载的 `helm-workflow-router` 为唯一权威。

2. 运行 `openspec list`；无活跃 change → 建议 explore/propose
3. 对每个活跃 change：
   - `openspec status --change <name>`
   - 统计 tasks `[x]` / `[ ]` 与 🟢/🟡/🔴 分布
   - 读取 `.helm-state.yaml`：phase、complexity、review stage、last_verified_task、known_issues、`external_verification`
   - 读取 `log.md` 最近条目
4. **下一步建议**：
   - artifacts 未完成 → propose
   - artifacts 完成、tasks 未完成 → apply
   - review/verify 待修 → fix
   - tasks 全完成无阻塞 → verify
   - verify 通过 → archive
5. 输出 13 阶段命令索引（宿主 slash 见 `helm-workflow-router` 命令表）

### 输出模板（MUST）

| 项 | 值 |
| --- | --- |
| apply_mode | `turbo` / `strict`（缺失则显示 `未设置`） |
| design_review_status | `pending` / `passed` / `skipped-by-turbo` |
| effectiveAutoCommit | `true` / `false` |
| compileDeferred / utDeferred | `true` / `false` |
| unifiedVerifyRequired | `true` / `false` |
| 已完成 task | `<n> / <total>`（`total` 用正则 `^\s*-\s*\[[ x]\]\s*Task\s+\d+` 计数） |
| 下一步 | `<阶段名>（`skipped-lightweight-task` 不阻塞 apply）` |

**规则**：`design_review_status: skipped-by-turbo` **不构成** apply 的阻塞条件，不得判为"不可 apply"。


## Verification

- [ ] 已读 state 与 tasks 再推荐
- [ ] 推荐与 phase 一致

## Red flags

- 未读 state 即建议 apply
- 混淆 lightweight 与 standard 的 design review 门槛
