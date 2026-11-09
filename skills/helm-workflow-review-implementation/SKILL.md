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

`{git_diff}`, `{specs}`, `{design}`, `{code_style}`, `{complexity}`（🟢/🟡/🔴）, `{conventions}`

## Process

1. 阅读实际 diff，不信任实现者自述
2. **验证证据复用**：默认检查 implementer 提供的 RED/GREEN/build 证据，不重复跑编译/测试；仅当证据缺失、未覆盖变更、review 中代码已变、构建/夹具/wiring 变更或高风险路径无法判断时，要求重跑并限定最小命令范围
3. 逐条对比 spec vs 实现
4. 维度：
   - **规范合规**（全部级别）：覆盖、scope creep、边界
   - **代码质量**（🟡/🔴）：架构、错误处理、测试有效性
   - **代码风格**（🟡/🔴）：项目规则
   - **安全**（🔴）：注入、泄露、权限
   - **数据库**（`db` 维度，命中即必审）：见下节
   - **接口契约**（`api` 维度，命中即必审）：见下节
   - **DESIGN_ISSUE**：spec/design 本身缺陷
5. 不修改代码；引用 `file:line`

## 规范维度审查（db / api）

`{conventions}` 指明本次命中哪个规范时，这两个维度 MUST 逐条给结论，判定口径以真源文件为准，本文不复制规则正文。

### db 维度

真源：`references/db-design-convention.md` 第 8 节 X 组。

- 先确认设计文档存在，再比对文档与 DDL 是否逐字一致（字段名、类型、非空、默认值、注释、索引五项）。
- 确认通用字段没有写进文档，同时确认 DDL 里七件齐全。
- 确认枚举列是 `CODE 含义` 逐行，且取值与枚举类一致。
- 确认无外键、表级 `utf8mb4`、每列与表都有 `COMMENT`。
- 确认实体骨架齐全：DO、BO、枚举、Mapper、Repo、Service、Application。
- 输出格式：`X1: pass/fail — <证据>`，逐条到 X9，不许写"表设计合理"。

### api 维度

真源：`references/api-contract-convention.md` 第 7 节 K 组。

- 从 diff 反推本次改动的 `METHOD + PATH`，与 `### Apifox Sync` 变更表逐行比对，缺接口即 Critical。
- 检查每条写入都有 `cli-schema get` 全量、`validate` 通过、写后回读三项证据。
- 检查破坏性变更（删接口、改类型、可选转必填、删枚举）是否有用户授权原话。
- 检查是否新建了与已有接口同 `METHOD + PATH` 的重复接口。
- 规范未启用时，检查 `### Convention Loaded` 给出的 `n/a` 理由是否成立（CLI 缺失、无 `settings.json`、`api_contract: none`）。理由不成立 → Important。
- 输出格式：`K13: pass/fail — <证据>`，逐条到 K20。


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
- [ ] 命中 `db` 时 X1–X9 逐条给了结论与证据
- [ ] 命中 `api` 时 K13–K20 逐条给了结论与证据

## Red flags

- 仅读实现者摘要不读 diff
- 有建表改动却只审 Java 代码，没打开 `docs/db` 文档
- 有接口改动却只看代码，没比对 Apifox 变更表
- 用「表设计合理」「接口已同步」这类无证据的一句话代替逐条判定
