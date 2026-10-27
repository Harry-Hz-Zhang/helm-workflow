---
name: helm-workflow-archive
description: Archive OpenSpec change after verify passes, then branch finish options. Use when verify has no Critical issues.
requires_skills:
  - helm-workflow-router
  - openspec-archive-change
  - superpowers:finishing-a-development-branch
---

# HELM Archive

## Overview

在 verify 无 Critical 后归档 change，并引导分支收尾。

## When to Use

- verify 结论允许 archive
- 用户显式要求归档

## When NOT to Use

- verify 仍有 Critical（应先 fix）
- propose/apply 未完成

## Process

### S0 — 双模根解析（HARD-GATE，workbench 模式专属）

1. 调用 `resolveRoot()` 获取 `{ root, mode }`
   - 解析契约见 `references/workbench-resolution.md`；**MUST NOT** 自行假设返回值或在失败时回退到当前目录。
2. `mode=single-repo`（单库）：走老行为（从 artifacts 抽取 change 摘要后直接进入 S1-S4，不写知识库、不做摘要晋升）
3. `mode=workbench`：写 change 摘要到 `knowledge/tech/{domain}/changes/{change}.md`（域缺失则用 `_unscoped`）；explore/propose/apply/fix/verify 不得写 `knowledge/`（archive 是唯一写入点）。

### S1 — 强制加载前置 skill

> **前置加载（HARD-GATE）**：MUST 用 Skill 工具实际加载 frontmatter `requires_skills` 的全部项（声明 ≠ 加载）；
> MUST 在本阶段日志写入 `### Skills Loaded` 证据段，声明了但未列出的依赖判为未加载；
> 任一项加载失败 → 立即停止，不得降级继续。
> 路径基准：仓库根相对路径（见 `references/skill-loading-contract.md` 第 0 节）。
> 完整规则见 `references/skill-loading-contract.md`。
   归档动作 / 分支收尾流程以已加载的对应 skill 为唯一权威。

### S2 — 归档 change

1. 确认 `.helm-state.yaml` 的 `verify_complete: true`（或 `last_verified_task` 覆盖全部 task）；不满足 → **停止**，先跑 verify。
2. 确认 `log.md` 含 `### Skills Loaded`，且含以 `### Review Evidence` 开头的段；缺失 → 先补证据再归档。
3. 移动 `<openspec>/changes/<name>/` → `<openspec>/changes/archive/<YYYY-MM-DD>-<name>/`。
4. 保留 `log.md` 与 `tasks.md`（审计依据），不删除。
5. `.helm-state.yaml` 与 `sprint-state.json`（若存在）**随 change 目录一并移入 archive**。
   **MUST NOT 单独删除** `.helm-state.yaml`：它是"这次 change 用了什么模式、走了哪些门禁"的唯一记录。
6. 归档动作的权威流程见 `openspec-archive-change`；本文件只规定 HELM 侧的准入条件与 state 归属。

**失败处理**：

- 目标目录已存在 → **停止**，不覆盖。
- 移动中断 → 记录已移动的文件清单，下次从断点继续。

### S3 — 分支收尾

1. 当前分支 = `.helm-state.yaml` 的 `branch_name`（缺失时用 `feature/<change-name>`）。
2. 展示三选项并等待用户选择：`保留分支（默认）` / `开 PR（用户自行在远端操作）` / `稍后处理`。
3. **MUST NOT** 自动 `git push`；**MUST NOT** 自动合并到主干；**MUST NOT** 自动删除分支。

### S4 — 归档后校验与收尾报告

1. 校验归档目录存在且含 `log.md`、`tasks.md`、`.helm-state.yaml`。
2. 校验原 change 目录已不存在（移动而非复制）。
3. 输出收尾报告：

```markdown
### Archive 完成

- change: <name>
- 归档路径: <path>
- 完成 task: <n> / <n>
- apply_mode: <turbo|strict>
- 证据齐全: Skills Loaded ✓ / Review Evidence ✓ / 验证证据 ✓
- state 归属: 已随 change 移入归档目录（未删除）
- 未做: 推送 / 合并 / 删分支（需用户显式执行）
```


## Verification

- [ ] verify 无 Critical 才执行
- [ ] `external_verification` 已读取，与 state 一致
- [ ] archive 路径符合 OpenSpec 约定
- [ ] 用户已知晓分支选项

## Red flags

- verify 有 Critical 仍 archive
- 把绝对路径写入入库 state
