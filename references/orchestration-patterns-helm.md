# HELM Orchestration Patterns

改编自 [agent-skills orchestration-patterns](https://github.com/addyosmani/agent-skills/blob/main/references/orchestration-patterns.md)。

## 三层命名（L3 / L2 / L1）

| 层 | 示例 | 说明 |
| --- | --- | --- |
| L3 | `/helm-explore` | 用户 slash；**不等于** L1 skill 名 |
| L2 | `.codex/workflow/helm-explore.md` | 宿主编排；`canonical_skill: helm-workflow-explore` |
| L1 | `skills/helm-workflow-explore/` | 唯一流程真源 |

## Endorsed

### 1. Direct persona + skill

主会话或用户直接派发 `design-reviewer` / `implementer`，persona 内加载对应 `helm-*` skill。

### 2. Thin shell command

`/helm:propose` 仅加载 `helm-workflow-propose` 并按需派发 persona（≤30 行 shell）。

### 3. Sequential handoff（apply 复杂 task）

```text
implementer → checkpoint → implementation-reviewer → merge → commit
```

**不是**并行 fan-out（那是 verify/ship 阶段可选增强）。

### 4. User-driven pipeline

`/helm:init` → `/helm:new`（可选工作台）→ `/helm:explore` → `/helm:propose` → `/helm:apply` — 用户为编排者，无 meta-orchestrator persona。可选扩展不进入主链默认编排。

## Anti-patterns

- Persona 调用 Persona
- Shell 内写 TDD/审查细则
- 无 checkpoint 即 review
- meta-agent 自动路由（用 `helm-workflow-router` skill 意图表代替）
