---
name: helm-workflow-fix
description: Targeted fix after review or verify — Reverse Sync first, then TDD fix and dual review. Use when Critical/Important issues remain post-apply.
requires_skills:
  - helm-workflow-router
  - helm-workflow-reverse-sync
  - helm-workflow-git-discipline
  - superpowers:test-driven-development
  - systematic-debugging
  - superpowers:subagent-driven-development
---

# HELM Fix

## Overview

承接 review/verify 结论做**定向修复**：先 Reverse Sync，再 TDD 改代码，双阶段 review，单 fix commit。不得扩展为新的大规模 apply。

## When to Use

- `/helm-workflow-verify` 报告 Critical/Important
- apply 阶段 review 未通过且需定向修补
- 用户给出明确 issue summary

## When NOT to Use

- 全新功能实现 — 回到 `helm-workflow-apply` 或更新 tasks 后 apply
- 未确定修复目标时直接改代码

## Process

### S0 — 双模根解析（HARD-GATE，workbench 模式专属）

1. 调用 `resolveRoot()` 获取 `{ root, mode }`
   - 解析契约见 `references/workbench-resolution.md`；**MUST NOT** 自行假设返回值或在失败时回退到当前目录。
2. `mode=workbench`：
   - Reverse Sync 改 `<root>/.openspec/changes/<name>/`（及必要时 feature 级 `outline-design.md`）
   - 禁止改错根（MUST NOT 改业务仓 openspec）
3. `mode=single-repo`（单库）：
   - Reverse Sync 改 `<cwd>/.openspec/changes/<name>/`（今日行为）
   - 保持今日行为

### S1 — 强制加载前置 skill

> **前置加载（HARD-GATE）**：MUST 用 Skill 工具实际加载 frontmatter `requires_skills` 的全部项（声明 ≠ 加载）；
> MUST 在本阶段日志写入 `### Skills Loaded` 证据段，声明了但未列出的依赖判为未加载；
> 任一项加载失败 → 立即停止，不得降级继续。
> 路径基准：仓库根相对路径（见 `references/skill-loading-contract.md` 第 0 节）。
> 完整规则见 `references/skill-loading-contract.md`。
   TDD / Reverse Sync / systematic-debugging 等约束以已加载的对应 skill 为唯一权威，本 SKILL 不重写其规则。

### S1.5 策略继承与差异

fix **继承** `helm-workflow-apply` 的全部策略与门禁，仅以下三处不同：

| 维度 | apply | fix |
| --- | --- | --- |
| 审查强度 | 按色标（🟢 可跳过） | **至少 1 次独立审查，无论色标**（含 turbo） |
| 审查范围 | 当前 task / 累计 | 本次修复的 diff |
| 审查时机 | 编译前 | 编译前（turbo 也必须在编译前审一次） |

其余一致：`apply_mode` 派生（S1.3）、延迟策略（S3.5）、统一验证（S6.8）、`### Skills Loaded` 证据、`target_repos` 闸门、收口顺序（构建 → 统一验证 → 勾选 → commit）。

**Reverse Sync**：若修复过程中发现 specs/design 与代码事实不符 → 必须先走 `helm-workflow-reverse-sync`（本文件 S5），并在 `tasks.md` 的对应 task 补 `files:` 字段。


### S2 — 分支门控与问题定位

1. 分支门控：参考 `helm-workflow-git-discipline` Branch Confirm 子流程；master/main 上必须由用户确认（接受 `feature/<change-name>` / 自定义 / 取消），禁止静默硬停
2. 确定 change 与问题来源（用户摘要 > 会话 review > `log.md`）

### S3 — 读取 artifacts

1. 读取 proposal、specs、design、tasks、log、`.helm-state.yaml` 与宿主 templates

### S4 — Commit 策略加载

1. **Commit 策略加载（MUST）**：按 `helm-workflow-apply` S1 步骤 3 读取 `auto_commit`（缺省 `false`）并按 `apply` S1.3 派生五个旗标，同时持久化 `commit_message_guidance`（缺省 `""`）到 `.helm-state.yaml.runtime`

### S5 — Reverse Sync

1. **Reverse Sync（改代码前，MUST）**：
   a. 定位问题涉及的文件列表
   b. 逐一对照 `tasks.md` 的 `files:` 清单 — 任一修复文件不在列表中 → **先更新 `tasks.md` 补充该文件**，再改代码
   c. 检查 `specs/` 是否覆盖本次修复范围 — 宏观描述足够则不改 spec，细节遗漏则补充
   d. 回写 `log.md` 记录 RS 决策（补充了哪些 artifact、为什么 spec 不需要改）
   e. 纯实现缺陷（artifact 已覆盖但代码实现有误）也须在 log 记录依据，无 RS 时明确标注 `reverse_sync: not required`

### S6 — 更新 state

1. 更新 state：`current_phase: fix`，`active_review_stage: reverse_sync`

### S7 — 定向实现

1. **定向实现**：仅 issue 范围；TDD RED/GREEN/REFACTOR 证据；超范围则先更新 tasks + log

### S8 — 双 review

1. **双 review**：spec reviewer → code quality reviewer；🔴 task MUST 派 design-reviewer 预审 artifacts；reviewer 默认复用 implementer 的 RED/GREEN/build 证据（缺失、未覆盖、代码已变或高风险路径除外）

### S9 — 收口与 commit

1. 通过后：tasks（若适用）→ log → state → 最小验证 → **commit gate 强制重读**：主会话再次读 `.helm-state.yaml.runtime` 取 `effectiveAutoCommit` / `autoCommitForcedOff` 与 `commit_message_guidance`，按 `effectiveAutoCommit` / `autoCommitForcedOff` 收口：`false` 时不触发 git 操作、不提示用户 commit、不校验工作区，由用户自行决定 commit 时机；`true` 时**主会话自行**根据 `git diff --cached` + issue 摘要 + `commit_message_guidance`（非空遵原文约束，空时自由生成）生成 message 并 `git commit`，子代理不参与 message 生成。既有验证证据仍有效时可复用；禁止自动 push

### S10 — 下一步建议

1. 建议下一步：继续 fix / verify / archive

## Verification

- [ ] Reverse Sync 先于编码（MUST 执行 S5 a-e 全流程）
- [ ] 修复文件与 tasks.md `files:` 列表一致（S5 证据段通过）
- [ ] 双 review 无 Critical/Important/DESIGN_ISSUE 遗留
- [ ] 有 TDD 证据与最小验证记录

## Red flags

- 只修不审
- 跳过 S5 Reverse Sync 直接改代码
- 修复文件不在 tasks.md `files:` 中但未回写
- fix 演化为多 task 并行大改
