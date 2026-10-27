---
name: helm-workflow-review-implementation
description: Reviews git diff against specs after implementer checkpoint. Read-only. Use after helm-workflow-implement-task completes for standard or lightweight apply paths.
requires_skills: []
---

# HELM Review Implementation

## 审查范围

| 来源 | 范围 | 命令 |
| --- | --- | --- |
| apply · strict | 当前 task 的 diff | `git diff -- <task 的 files>` |
| apply · turbo（集中审查） | 累计 diff | `git diff <base_commit>..HEAD` |
| fix | 本次修复的 diff | `git diff <fix_start_commit>..HEAD` |

**规则**：

- 累计范围的起点由 `base_commit..HEAD` 的 `base_commit` 决定（即 `apply` S1.3 记录的 `git rev-parse HEAD`）。
- MUST NOT 复用超范围的历史证据。
- MUST NOT 引用另一个 task 的审查结论作为自身证据。
- `utDeferred: true` 时，不要求审查者重跑测试；但必须检查测试**文件**是否已写且断言具体。
- turbo 的集中审查中，各维度可合并为一次调用，但结论 MUST 按 `review_dimensions` 逐维度分行列出。


## Overview

implementer checkpoint 之后，对照 spec 审查 git diff；只读，不修改生产代码。

## Context placeholders

`{git_diff}`, `{specs}`, `{design}`, `{code_style}`, `{complexity}`（🟢/🟡/🔴）

## Process

1. 阅读实际 diff，不信任实现者自述
2. **验证证据复用**：默认检查 implementer 提供的 RED/GREEN/build 证据，不重复跑编译/测试；仅当证据缺失、未覆盖变更、review 中代码已变、构建/夹具/wiring 变更或高风险路径无法判断时，要求重跑并限定最小命令范围
3. 逐条对比 spec vs 实现
4. 维度：
   - **规范合规**（全部级别）：覆盖、scope creep、边界
   - **代码质量**（🟡/🔴）：架构、错误处理、测试有效性
   - **代码风格**（🟡/🔴）：项目规则
   - **安全**（🔴）：注入、泄露、权限
   - **DESIGN_ISSUE**：spec/design 本身缺陷
5. 不修改代码；引用 `file:line`

## Output Format

```text
### 审查结果：✅ 通过 / ❌ 需要修复

#### Critical
#### Important
#### DESIGN_ISSUE
#### Minor

#### 总结
- spec 覆盖率：X/Y
```

通过条件：无 Critical、Important、DESIGN_ISSUE。

## Verification

- [ ] 已读完整 diff
- [ ] 未直接改生产代码

## Red flags

- 仅读实现者摘要不读 diff
