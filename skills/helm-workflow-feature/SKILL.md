---
name: helm-workflow-feature
description: Compatibility entry point — merged into helm-workflow-new. This skill only forwards; it carries no workflow of its own.
requires_skills:
  - helm-workflow-new
---

# HELM Feature（兼容入口）

> 加载门禁：见 `references/skill-loading-contract.md`（5 行内联摘要由 `helm-workflow-new` 承载，本壳不重复）。

`helm-workflow-new` 是 feature 容器创建的唯一入口；本文件不定义任何流程、不读任何配置。

**何时用本入口**：老用户的书签、外部文档引用、历史 change 里的 `/helm:feature` 调用。

**行为**：加载并完整执行 `helm-workflow-new`（契约见 `references/skill-loading-contract.md`），不附加额外规则；自检段 `### Skills Loaded` MUST 列出 `helm-workflow-new`，并在 log 记一行 `feature -> new 转发（兼容入口）`。

新用户直接用 `helm-workflow-new` 或 `/helm:new`。
