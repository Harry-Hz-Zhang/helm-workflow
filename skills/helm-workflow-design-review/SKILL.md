---
name: helm-workflow-design-review
description: Pre-implementation review of proposal, specs, design, and tasks. Use only before coding starts, not for diff review.
requires_skills: []
---

# HELM Design Review

## Overview

实现前审查 proposal/specs/design/tasks 的一致性与可执行性；只审 artifacts，不审代码 diff。

## When to Use

- `complexity_mode=standard` 且存在 🟡/🔴 task
- propose 阶段 artifacts 生成后、用户确认前

## When NOT to Use

- 代码 diff、已实现质量、测试验收

## Process

1. 读取 proposal、specs、design（如有）、tasks
2. **外部验收闸门（MUST）**：读取 `.helm-state.yaml` 的 `external_verification`；`required` 时检查 design 是否含验收清单与执行方式，缺失 → FAIL。
3. 审查：
   - 目标、范围、非目标（proposal）
   - spec 完整、可测试、无歧义
   - design 与架构 fit
   - tasks：原子动词+对象；无高熵 `Implement/Handle/Process` 作主语；🟡/🔴 含 RED/GREEN/ASSERT/DoD；≤3 层、5-9 子任务、独立验证；含「任务依赖关系」小节（依赖图、并行/串行、worktree 分组）
   - proposal ↔ specs ↔ design ↔ tasks 一致性
   - 边界、集成点、错误处理
4. artifact 问题标明必须回写哪个文件
5. standard 模式最多 2 轮修订后重审

### 模式分支（MUST）

1. 读 `apply_mode`。
2. `turbo` → **不启动**设计审查，写入 `.helm-state.yaml` 的 `design_review_status: skipped-by-turbo`，并在 log 记录一行。同时在 tasks.md 顶部确认 `apply_mode: turbo` 标注存在。
3. `strict` → 正常执行审查。
4. **HARD-GATE**：无论哪种模式，必须在 proposal 的固定栏回显 `apply_mode`，且与 state 一致；不一致 → 停止。

### tasks 质量审查项（strict）

- 是否出现高熵动词（"优化""完善""处理""支持"）作为唯一描述
- 是否超过 3 层嵌套
- 子任务数区间（按 `project.kind`）：
  - `service` / `library` / `web` / `mobile` / `multi` → 5–9
  - `data` / `infra` / `docs` → 2–6
  - 理由：文档、IaC、数据管道的单项 task 粒度天然更粗，5 条下限会逼拆碎
- 依赖图是否成环
- 每条验证是否含**可定位锚点**：
  - 用画像 `symbol_locator` / `symbol_pattern` 判定（`jvm` → 类型 + `#` + 方法；`dotted` → `模块.函数`；`path` → 相对路径；`heading` → 标题/`§`；`none` → 可观察输出四类之一）
  - **MUST NOT** 在 skill 正文里写死语言专属的方法标记形态
- 每条验证场景数是否 ≥ `min_scenarios[type]`
- 每个 task 是否有 `DoD:` 且每条 DoD 含"判定动作 + 期望结果"（`spec_source: none` 时这是硬要求，因为 DoD 是唯一规格源）

**轮次上限**：审查最多 2 轮；第 2 轮仍有 Critical → 退回 propose。


## Output Format

```text
RESULT: PASS | FAIL

Must Fix:
- [artifact:section] 问题描述

Should Improve:
- [artifact:section] 问题描述

Consistency Checklist:
- proposal <-> specs
- specs <-> design
- design <-> tasks

Summary: ...
```

## Verification

- [ ] 未使用通用 code-review 框架替代设计审查
- [ ] FAIL 时无 Must Fix 遗留即标 PASS

## Red flags

- 用 `code-reviewer` 路由冒充 design-reviewer
- 输出以「代码最佳实践」为主而非 artifact
