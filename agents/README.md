# HELM Agent Personas

薄 Persona 定义：角色边界与输出格式。工作流步骤在 `skills/helm-workflow-*`；宿主入口是阶段 C 产出的四套薄壳：`.agents/commands/helm/*.md`、`.cursor/commands/helm-*.md`、`.opencode/commands/helm-*.md`、`.codex/workflow/helm-*.md`（canonical 源为 `commands/helm/*.md`）。

> **分发规则**：本文件（`agents/README.md`）是**导航文档，不是 persona**。安装器的 `buildPlan` MUST 只遍历 `agents/*.md` 中**除 `README.md` 以外**的文件，本文件 MUST NOT 进入 `managed_files`。

| Persona | Role | Best for |
| --- | --- | --- |
| [helm-explorer](helm-explorer.md) | 代码探索者 | explore 阶段决策树提取 + B 结局代码核实 |
| [design-reviewer](design-reviewer.md) | 设计审查者 | propose 阶段 artifacts 审查（实现前） |
| [implementer](implementer.md) | 实现者 | apply 阶段单 task 实现 |
| [implementation-reviewer](implementation-reviewer.md) | 实现审查者 | apply 阶段 diff + spec 对照 |

## 三层关系

| 层 | 示例 |
| --- | --- |
| Skill | `helm-workflow-implement-task` — 怎么做 |
| Persona | `implementer` — 谁来做 |
| Shell | `/helm-apply`（Cursor）/ `/helm:apply`（Claude、CodeBuddy）— 何时做 |

**Personas 不调用其它 Personas。** 编排由主会话或 shell command 完成。

## 决策矩阵

```text
实现前审查 artifacts？ → design-reviewer
实现单个 task？         → implementer
审查已实现 diff？       → implementation-reviewer
```
