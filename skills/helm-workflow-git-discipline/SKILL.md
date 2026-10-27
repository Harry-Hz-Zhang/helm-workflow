---
name: helm-workflow-git-discipline
description: Git branch confirm, per-task commit (configurable), and no-auto-push rules for HELM apply/fix. Use before committing during helm-workflow-apply or helm-workflow-fix.
requires_skills: []
---

# HELM Git Discipline

## Overview

apply/fix 阶段的 Git 纪律：进入分支前确认、单 task commit（可配置）、禁止自动 push。

## Branch Confirm Subflow（master/main 入口）

进入 apply/fix 前 `git branch --show-current`：

- **非 master/main**：直接放行。
- **master/main**：**不得**直接在该分支上 apply/fix，但**也不得**静默硬停。按以下子流程处理：
  1. 生成默认分支名：`feature/<change-name>`（`change-name` 取自 `.openspec/changes/<name>/` 目录名；fix 阶段取自 `.helm-state.yaml` 的 `active_change`）
     - 若 `.helm-state.yaml` 已有 `branch_name`，以该值为默认值；否则用 `feature/<change-name>`。
  2. 主会话**必须**通过用户确认机制（如 `AskUserQuestion` 或等价的交互式提示）展示：
     - 当前分支（master/main）
     - 建议默认分支名（`feature/<change-name>`）
     - 三选项：`接受默认` / `自定义分支名` / `取消 apply`
  3. 用户选择：
     - `接受默认` → 执行 `git checkout -b feature/<change-name>` 并继续
     - `自定义分支名` → 再次询问用户分支名，校验非空且非 master/main 后 `git checkout -b <user-input>` 并继续
     - `取消 apply` → 停止当前 phase，不创建分支
   4. 切换分支前的工作区检查：
      - `effectiveAutoCommit: true` → **强制确认工作区干净**（`git status --porcelain` 为空）；脏则**停止**，要求用户自行 commit 或 discard。**MUST NOT** 自动 stash。
      - 否则 → **只提示**，输出一行 `工作区不干净（已允许）：<n> 个文件`，然后继续；**不得**阻断、**不得** stash、**不得**代为 commit。
  5. 创建分支后回写 `.helm-state.yaml`：`base_commit = git rev-parse HEAD`

**禁止**在用户未确认前自动切分支或 stash 改动。

## 提交策略（派生表）

**唯一权威**：`.helm-state.yaml` 中的五个派生旗标。`helm-workflow.local.yaml` 的 `auto_commit` **只在 strict 模式下**作为 `effectiveAutoCommit` 的取值来源。

| `apply_mode` | `effectiveAutoCommit` | `autoCommitForcedOff` | 行为 |
| --- | --- | --- | --- |
| `strict` | `auto_commit: true` | `false` | 每 task 审查通过 + 构建 `result: pass` 后 commit 一次 |
| `strict` | `auto_commit: false` | `false` | 不动 git index；不提示、不校验工作区干净 |
| `turbo` | `false` | `true` | **零 per-task commit**；commit 时机完全由用户决定 |

**五个派生旗标（全部由 `apply` S1.3 写入，本文件只读不推导）**：`effectiveAutoCommit` / `autoCommitForcedOff` / `compileDeferred` / `utDeferred` / `unifiedVerifyRequired`。其中 `compileDeferred` / `utDeferred` / `unifiedVerifyRequired` 不直接改变提交动作，但 `unifiedVerifyRequired: true` 时 `commit_hash` 为空属于正常（turbo 零 per-task commit），不得判为异常。

**任何模式下 MUST NOT 自动 `git push`。**

**读取纪律**：每次准备 commit 前 MUST 重新读取 `.helm-state.yaml`，不得使用会话早期缓存。runtime 块不可读 → **停止**，要求用户手动检查 state 文件。

### `effectiveAutoCommit: true` 时的要求

1. 每个完成的 task **一个独立 commit**，由**主会话**执行（审查通过 + 验证证据 `result: pass` 之后）。
2. Commit message：
   - 读 `.helm-state.yaml.runtime.commit_message_guidance`；非空 → 按原文约束生成；**禁止**改写、压缩、翻译 guidance 原文。
   - 空（默认）→ 自由生成简短 message，工作流不预设固定格式。
   - 子代理（implementer / reviewer）**不**参与 message 生成。
3. 进入 task 循环前要求工作区干净；进入下一 task 前同样要求工作区干净。
4. 提交前校验 `git diff --cached --name-only` **仅**含当前 task 声明的 `files`；含其他未完成 task 的文件 → **停止**（禁止 batch commit）。
5. 最小验证未通过 / 审查未通过 → 不得 commit。

### `autoCommitForcedOff: true` 或 `effectiveAutoCommit: false` 时的要求

1. **不**执行 `git add` / `git commit`，工作流不直接动 git index。
2. **不**在 task 间提示用户 commit；**不**校验工作区干净（只允许在日志记一行当前状态）。
3. 仍**必须**完成：审查、验证证据、`tasks.md` 双层回写、`log.md` 与 `.helm-state.yaml` 更新。
4. `log.md` 中标注 `autoCommitForcedOff: true` 或 `effectiveAutoCommit: false`。


## Verification

- [ ] master/main 入口：用户确认过分支决策（接受默认/自定义/取消），未静默切换
- [ ] `git branch --show-current` 非 main/master 才开始实现
- [ ] `effectiveAutoCommit: true` 时每个 `- [x]` task 有对应 commit
- [ ] `autoCommitForcedOff: true` 或 `effectiveAutoCommit: false` 时未触发任何 `git add`/`git commit`，未在 task 间打断用户
- [ ] 无未经请求的 push

## Red flags

- master/main 上静默硬停而不询问用户
- 未经确认就自动切分支或 stash 改动
- `autoCommitForcedOff: true` 或 `effectiveAutoCommit: false` 时仍触发 `git commit`
- `autoCommitForcedOff: true` 或 `effectiveAutoCommit: false` 时仍提示用户 commit 或校验工作区干净打断流程
- `effectiveAutoCommit: true` 时未做工作区/diff 范围校验
- 在 main/master 上 commit 实现变更
- reviewer 未通过即 commit
- 工作流自动 push
