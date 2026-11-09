# Log — <change-name>

> 本文件是流程证据的唯一落盘处。缺段的门禁视为未执行。
> 追加式写入：不要删除历史段落，只追加新的日期小节。
> 路径基准：仓库根相对路径（见 `references/skill-loading-contract.md` 第 0 节）。

## 元信息

| 字段 | 值 |
| --- | --- |
| change | `<change-name>` |
| apply_mode | `turbo` / `strict` |
| target_repos | `[<repo-a>, <repo-b>]` |
| base_commit | `<sha>` |
| 开始时间 | `YYYY-MM-DDTHH:mm:ss+08:00` |

## Resolution

- mode: `workbench` / `single`
- root: `<绝对路径>`
- resolved: `<name>` -> `<绝对路径>`

## yyyy-MM-dd <phase>

### 事件

| 事件 | 说明 |
| --- | --- |
| <事件名> | <发生什么、依据是什么> |

### Skills Loaded

| skill | 来源 | 加载方式 |
| --- | --- | --- |
| `helm-workflow-router` | 本地 | Skill 工具 |
| `helm-workflow-chat-style` | 本地 | Skill 工具 |

### Convention Loaded

| 规范 | 触发依据 | 加载方式 | 应用到 |
| --- | --- | --- | --- |
| `db-design-convention` | `<Task N 含「新建订单表」>` | Read 全文 | `<Task N>` |
| `api-contract-convention` | `<Task N 改 OrderController#submit>` | Read 全文 | `<Task N>` |

> 未触发时本段写一行即可：`db: n/a（本次 change 无表结构改动）` 或 `api: n/a（无契约面改动）`，理由不得省略。
> 规范正文：`references/db-design-convention.md`、`references/api-contract-convention.md`。

### Apifox Sync

- project: `<projectId>`
- preflight: `<apifox auth status 与 endpoint list 结果>`
- existing: `<METHOD PATH → 接口 ID 或 none>`
- schema: `<cli-schema get 落盘路径>、<update 用的完整 JSON 路径>`
- validate: `<cli-schema validate 结果>`
- write: `<create/update 的对象与返回>`
- readback: `<endpoint get/list 回读结果>`
- authorized: `<破坏性变更的用户原话摘要，或 ->`
- blocked: `<权限阻塞原文摘要，或 ->`

> `authorized:` 与 `blocked:` 两行 MUST 出现，无内容写 `-`。未启用契约规范时整段写 `api: n/a（<原因>）`。

### Review Evidence

| Stage | Subagent ID | Verdict | 范围 |
| --- | --- | --- | --- |
| `spec` | `<id>` | `PASS` / `FAIL` | Task 1 diff |
| `quality` | `<id>` | `PASS` / `FAIL` | Task 1 diff |

> 段标题 MUST 以 `### Review Evidence` 开头（逐字）；允许的后缀只有两种：strict 逐 task 写 `### Review Evidence Task N`，turbo 集中审查写 `### Review Evidence Batch`。
> 低风险 task 跳过审查时，本段写一行：`skipped-lightweight-task: <task 编号> — <理由>`。

### Verification Evidence Task N

- command: `<实际执行的命令>`
- type: `<unit|integration|e2e|contract|snapshot|data-check|plan-diff|link-check|manual-steps|build>`
- result: `<pass|fail|skip|partial>`
- summary: `<关键输出行，含计数>`
- artifacts: `<可选>`

> `compileDeferred: true` 或 `build_command: null` 时，本节可写 `type: build` + `result: skip` + `summary: <原因>`，**不得**留空。
> 兼容旧格式：`### Build Evidence Task N` + `- exit code: 0` 仍被接受（归一化为 `type: build`）。

### Verification Evidence Unified

- scope: `Task 1–N`
- command: `<全量命令>`
- type: `<unit|integration|...>`
- result: `<pass|fail|skip|partial>`
- summary: `<关键输出行，含计数>`

> 兼容旧格式：`### 统一验证` + `- 统一验证 UT: ...` + `- 用例数: ...` + `- exit code: 0` 仍被接受（归一化为 `type: unit, style: unified`）。

### Reverse Sync

| 时间 | 触发原因 | 处理 |
| --- | --- | --- |
| <时间> | <文档与代码不符 / constraints 变化> | <改了什么> |

### 偏差与决定

- <偏差描述> → <采纳的处理方式> → <理由>

### 兼容示例（v1 字面量，MUST 保留）

> 本节只用于证明"旧格式仍被接受"，实际写证据时**不要**照着本节写，照上面的 v2 块写。
> 删除本节会同时打破两处验收：本 task 的验收（8 个字面量逐个 grep）与 B 阶段未开工时的 v1 兼容验收。
> 归一化映射：`### Build Evidence Task N` → `type: build`；`### 统一验证` → `type: unit, style: unified`。

```markdown
### Skills Loaded

| skill | 来源 | 加载方式 |
| --- | --- | --- |
| `helm-workflow-router` | 本地 | Skill 工具 |

### Review Evidence

| Stage | Subagent ID | Verdict | 范围 |
| --- | --- | --- | --- |
| `spec` | `<id>` | `PASS` / `FAIL` | Task 1 diff |

### Review Evidence Batch

| Stage | Subagent ID | Verdict | 范围 |
| --- | --- | --- | --- |
| `spec` | `<id>` | `PASS` / `FAIL` | Task 1–8 diff |

skipped-lightweight-task: <task 编号> — <理由>

### Build Evidence Task N

- command: `<编译命令>`
- exit code: 0

### 统一验证

- 统一验证 UT: `<测试命令>`
- 用例数: `<n> passed, <m> failed`
- exit code: 0
```
