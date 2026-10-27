---
name: helm-workflow-apply-sprint
description: Resumable sprint apply — checkpoint state, serial per-task blue-red loop, TDD and dual review. Use for long standard changes needing interrupt recovery.
requires_skills:
  - helm-workflow-router
  - helm-workflow-apply
  - superpowers:test-driven-development
  - superpowers:subagent-driven-development
---

# HELM Apply Sprint

## Overview

可恢复的长流程 apply：持久化 sprint 状态、逐 task 蓝红对抗、checkpoint commit。行为与 `helm-workflow-apply` 一致，额外支持中断恢复。

## When to Use

- 多 task、standard 模式、需跨 session 恢复
- 用户显式调用 apply-sprint 而非单次 apply

## When NOT to Use

- lightweight 且 task 极少 — 可用 `helm-workflow-apply`
- design review 未完成（standard）

## Process

### Phase 0 — 前置

> **前置加载（HARD-GATE）**：MUST 用 Skill 工具实际加载 frontmatter `requires_skills` 的全部项（声明 ≠ 加载）；
> MUST 在本阶段日志写入 `### Skills Loaded` 证据段，声明了但未列出的依赖判为未加载；
> 任一项加载失败 → 立即停止，不得降级继续。
> 路径基准：仓库根相对路径（见 `references/skill-loading-contract.md` 第 0 节）。
> 完整规则见 `references/skill-loading-contract.md`。
   中断恢复时同样必须重新加载并写入证据，不依赖前次 session 残留。
1. standard：`design_review_passed` 且 2 轮 design review 已完成
2. 若有 `exploration_handoff_path`，必读 handoff
3. 读取 proposal、specs、design、tasks、log、state、宿主 templates
4. 分支门控：参考 `helm-workflow-git-discipline` Branch Confirm 子流程；在 master/main 上必须由用户确认（接受默认 `feature/<change-name>` / 自定义 / 取消），禁止静默硬停
5. **Commit 策略加载（MUST）**：按 `helm-workflow-apply` S1 步骤 3 读取 `auto_commit`（缺省 `false`）并按 `apply` S1.3 派生五个旗标，同时持久化 `commit_message_guidance`（缺省 `""`）到 `.helm-state.yaml.runtime`；中断恢复时重新读取并覆盖 runtime，确保跨 session 一致

### Phase 1 — 状态文件

- **Canonical 路径**（与宿主无关）：`.openspec/changes/<change-name>/sprint-state.json`
- 在 `.helm-state.yaml` 回写 `sprint_state_path`（同上相对路径）、`execution_mode: sprint`
- 格式参考：仓库 `templates/sprint-state.example.json`
- **禁止**写入宿主配置根下的 `sprint-state/` 子目录（历史路径已废弃；状态必须与 change 同目录）
- 恢复：显示已完成 checkpoint，从下一未完成 task 继续
- 新启动：记录 started_at、task 总数、complexity

### Phase 1.5 策略对齐（MUST）

apply-sprint **不定义私有策略**，一律沿用 `helm-workflow-apply`：

| 维度 | 来源 |
| --- | --- |
| `apply_mode` 与五个派生旗标 | `apply` S1.3 |
| 色标审查矩阵与审查维度 | `apply` S4.0 / S4.1 |
| 审查证据闸门 | `apply` S4.2 |
| 集中审查 | `apply` S4.5 |
| 延迟策略 | `apply` S3.5 |
| 统一验证 | `apply` S6.8 |
| 收口顺序（构建 → 统一验证 → 勾选 → commit） | `apply` S6 |

本文件只额外规定**跨 sprint 的断点续跑**规则。


### Phase 2 — 任务循环（串行）

对每个 `- [ ]` task，按 `helm-workflow-apply`：

1. implementer + `helm-workflow-implement-task`；TDD RED/GREEN/REFACTOR
2. Reverse Sync 闸门（`REVERSE_SYNC_REQUIRED`）
3. spec reviewer → code quality reviewer（默认复用 implementer 验证证据，见 `helm-workflow-apply` S4）
4. 🔴 可选 design-reviewer 预审 artifacts
5. 通过后：tasks（含双层 checkbox 回写，见 `helm-workflow-apply` S6）→ log → state → 最小验证 → **构建 exit code 0**（`compileDeferred: true` 或 turbo 时**跳过**本轮的构建门，改由集中统一验证承担）→ **commit gate 强制 re-load**（主会话重读 `.helm-state.yaml.runtime` 取 `effectiveAutoCommit` / `autoCommitForcedOff` 与 `commit_message_guidance`，对抗跨 task / 跨 session 遗忘）→ 按 `effectiveAutoCommit` / `autoCommitForcedOff` 收口：
   - `autoCommitForcedOff: true` 或 `effectiveAutoCommit: false`：**不**触发 `git commit`；**不**提示用户 commit；**不**校验工作区干净；sprint checkpoint 仅记 `tasks.md` 完成状态，commit_hash 留空；直接进入下一 task
   - `effectiveAutoCommit: true`：**主会话自行**根据 `git diff --cached` + 当前 task + 重读到的 `commit_message_guidance`（非空遵原文约束，空时自由生成）生成 message 并 `git commit` → 更新 sprint checkpoint（commit hash）；子代理不参与 message 生成

**turbo 模式下的 sprint 循环**：

1. 每轮只做"实现 + checkpoint"，**不审查、不编译、不勾选**。
2. `commit_hash` 字段留空是**合法**的（turbo 零 per-task commit），不得判为 sprint 失败。
3. 勾选 `[x]` 统一推迟到最后一个 sprint 的集中审查 PASS + 统一验证 `result: pass` 之后。

**workbench 多仓**：每轮开始前 MUST：

1. 从 `.helm-state.yaml` 读取 `branch_name` 与 `target_repos`（**不得**使用会话早期缓存）。
2. 对 `target_repos` 中每个仓执行 `git -C <resolve(name)> branch --show-current`，确认与 `branch_name` 一致。
3. 任一仓分支不一致 → **停止**该仓并报 `BLOCKED`（写明仓名 / 期望分支 / 实际分支）。
4. **MUST NOT** 自动 `git stash`；**MUST NOT** 自动 `git checkout`。

> 分支确认的权威定义在 `skills/helm-workflow-git-discipline/SKILL.md` 的 `Branch Confirm Subflow`。本文件**不引用**任何名为 `checkoutBranches` 的函数（该函数不存在）。


### Phase 3 — 完成

- 输出 checkpoint 列表、TDD/review 摘要
- 建议 `/helm-workflow-verify`

### 中断恢复

同 change 再次进入本 skill → 读 sprint state → 从最后 checkpoint 后继续。

## Verification

- [ ] master/main 入口经过 Branch Confirm 子流程
- [ ] `effectiveAutoCommit: true` 时每 task 有 checkpoint commit；`autoCommitForcedOff: true` 或 `effectiveAutoCommit: false` 时 checkpoint 仅记 tasks 状态，未触发 git 操作或打断用户
- [ ] sprint state 与 tasks.md 一致
- [ ] 无并行多个 implementer

## Red flags

- 跳过 standard design review 前置
- Critical 未修复仍 checkpoint
- 无 TDD 证据即 review
- 与 `helm-workflow-apply` 并行 dispatch 多实现子代理
