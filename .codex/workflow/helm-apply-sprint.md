---
description: Resumable sprint-style implementation
---
# helm apply-sprint —— 可中断恢复的冲刺式实施

本文件是**入口薄壳**，不承载流程细节。

## 加载要求（按顺序，缺一不可）

1. `skills/helm-workflow-router/SKILL.md` —— 确认当前 change、complexity 与下一步。
2. `skills/helm-workflow-apply-sprint/SKILL.md` —— 本阶段的唯一流程真源，严格按其步骤执行。
3. `skills/helm-workflow-git-discipline/SKILL.md` —— 分支与提交纪律。
4. 同目录（`<AGENT_DIR>/`）下的 `helm-workflow.local.yaml`（存在则读）或 `helm-workflow.local.example.yaml`（默认值）。
5. 若 `apply_mode: turbo`：`skills/helm-workflow-reverse-sync/SKILL.md`。

## 开工前必须落盘的证据

在 `log.md` 写入：

### Skills Loaded

| skill | 来源 | 加载方式 |
| --- | --- | --- |
| helm-workflow-router | 本地 | Skill 工具 |
| helm-workflow-apply-sprint | 本地 | Skill 工具 |
| helm-workflow-git-discipline | 本地 | Skill 工具 |

## 禁止

- 不得在本文件内重述 skill 的步骤（会形成第二真源）。
- 不得跳过 `### Skills Loaded` 直接开始改代码。
- 不得在 `complexity=standard` 时跳过 tasks 复选框更新。

## 触发方式

本宿主无原生 slash 命令。用户说 "run helm apply-sprint" / "执行 helm apply-sprint" 时加载本文件。
