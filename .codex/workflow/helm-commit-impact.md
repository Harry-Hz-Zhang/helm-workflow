---
description: Derive affected entry points and an executable test checklist from a commit or diff, producing a Markdown report
---
# helm commit-impact —— 基于 commit/diff 推导影响入口与可执行测试清单，产出 Markdown 报告

本文件是**入口薄壳**，不承载流程细节。

## 加载要求（按顺序，缺一不可）

1. `skills/helm-workflow-router/SKILL.md` —— 确认当前 change、complexity 与下一步。
2. `skills/helm-workflow-commit-impact/SKILL.md` —— 本阶段的唯一流程真源，严格按其步骤执行。
3. `skills/helm-workflow-git-discipline/SKILL.md` —— 分支与提交纪律。
4. 同目录（`<AGENT_DIR>/`）下的 `helm-workflow.local.yaml`（存在则读）或 `helm-workflow.local.example.yaml`（默认值）配置文件，不是 skill，不进证据表。

## 开工前必须落盘的证据

在 `log.md` 写入：

### Skills Loaded

| skill | 来源 | 加载方式 |
| --- | --- | --- |
| helm-workflow-router | 本地 | Skill 工具 |
| helm-workflow-commit-impact | 本地 | Skill 工具 |
| helm-workflow-git-discipline | 本地 | Skill 工具 |

## 执行要点

1. `git rev-parse --show-toplevel` 定仓库根，报告里的路径一律相对它（非 git 仓库 / 只给了 patch 文本时跳过全部 git 命令，按 SKILL.md S0.1 处理）。
2. `git diff --stat` 拿变更规模（文件数 / 增删行）。
3. 按 SKILL.md 的 S0 表选择分析范围，空 diff 直接结束。

## 唯一交付物

一份 Markdown 报告文件（落盘位置见 SKILL.md 的 S5.1）。**不得只在对话里贴结论。**

## 禁止

- 不得修改任何代码或测试文件（`Write` 只允许写报告文件）。
- 不得联网、不得上报。
- 不得只给同步入口而不给异步入口；不得把「跑全量回归」当测试步骤。

## 触发方式

本宿主无原生 slash 命令。用户说 "run helm commit-impact" / "执行 helm commit-impact" 时加载本文件。
