# Tasks — <change-name>

<!-- 进度 MUST 用行首 Markdown checkbox，与 OpenSpec apply 一致。禁止仅用 ### Task 或行内 完成状态：`[ ]` -->

apply_mode: strict

> 本行必须与 `.helm-state.yaml` 的 `apply_mode` 一致；不一致触发 Reverse Sync。

<!--
  🟡/🔴 task 的 RED/验证小节不是写"添加测试覆盖核心场景"这种空话。
  每条场景必须给出：可定位锚点 + 输入/前置条件 + 期望结果 + 证据锚点，
  让 implementer 不需要再做设计判断。

  锚点形态由画像 `symbol_locator` 决定（不在本模板写死某一种）：
  - jvm     → `类型#方法`
  - dotted  → `模块.函数`
  - path    → 相对文件路径
  - heading → 标题 / `§章节`
  - none    → 具体命令 + 预期输出片段 / 配置键名 / 错误码或日志字面量

  合格场景长这样（形态随 locator 变，语义一致）：
  - 正常路径：给定 <输入> → 期望 <输出字段>=<值>，且 <下游调用> 发生 1 次
  - 终止/短路：给定 <空值/终止条件> → 期望 <主流程> 0 次调用
  - 异常/错误：给定 <依赖异常> → 期望 <默认值兜底 / 明确错误码>
  - 边界：给定 <上限 / 下限 / 空集> → 期望 <精确行为>
  - 调用次数/顺序：期望 <A> 调用 n 次、<B> 调用 0 次

  场景清单**最少**必须覆盖：happy path、终止/短路、错误/异常、边界、调用次数/顺序。

  禁止：
  - 写"测试核心场景" / "覆盖业务流"等抽象描述
  - 场景无锚点（implementer 拿到没法对照）
  - 场景不写输入与期望（implementer 要再做一次设计判断）
  - ASSERT/DoD 空着或只写"全部转绿"
-->

## 图例

| 标记 | 含义 |
| --- | --- |
| 🟢 | 低风险：单文件、无跨模块、无外部依赖 |
| 🟡 | 中风险：多文件或涉及既有逻辑修改 |
| 🔴 | 高风险：核心链路、并发、数据迁移、对外契约 |

## task 必填项

每个 task MUST 含以下五项：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `type` | 是 | `code` / `config` / `docs` / `data` / `infra` / `refactor`；缺失时按画像 `project.kind` 推导，并在 log 记 `type: <推导值> (default applied)` |
| `色标` | 是 | `🟢` / `🟡` / `🔴`（字段名固定写 `色标`，不再使用 `complexity`） |
| `files` | 是 | 本 task 允许改动的文件清单（apply 提交时校验范围） |
| 验证小节 | 是 | `code` / `refactor` / `data` 写 `RED:`；`config` / `docs` / `infra` 写 `验证:`。场景条数 MUST ≥ 画像 `min_scenarios[type]`；每条 MUST 含可定位锚点（形态由 `symbol_locator` 决定）+ 具体期望结果 + 证据锚点 |
| `DoD` | 是 | 完成后可观察的结果，每条含判定动作 + 期望结果 |

**MUST NOT** 在模板中写死任何语言专属路径、框架类名或异常类型（路径一律用 `<source_roots>` / `<test_roots>` 占位）。

## Wave 1

- [ ] Task 1: <原子动词 + 对象>
  - type: code
  - 色标：🟢
  - files:
  - RED: <命令 + 预期失败输出>
  - GREEN: <命令 + 预期通过>
  - ASSERT:
  - DoD:
  - 最小验证:

- [ ] Task 2: 为提交入口增加幂等校验

  - type: code
  - 色标：🔴
  - files:
    - `<source_roots>/orders/submit.*`
    - `<test_roots>/orders/submit_test.*`
  - RED:
    - 正常：同一幂等键重复提交 → 第二次返回首次结果，且不产生第二条记录
    - 边界：幂等键长度取上限 → 通过；超上限 → 返回明确的取值范围错误
    - 异常：存储层不可用 → 返回可重试错误，且不留下半成品记录
    - 空值：幂等键缺失 → 拒绝并指出缺失字段名
    - 并发：同一幂等键两路并发 → 仅一条记录落库（断言记录数 = 1）
  - GREEN:
    - `<test_command>`（仅跑该测试类，全部转绿）
  - ASSERT:
    - 重复提交路径下 `save` 调用 0 次（用 mock 验证调用次数）
    - 并发路径下断言记录数 = 1
  - DoD:
    - 上述 5 条验证全部通过（证据见 log 的 `### Verification Evidence Task 2`）
    - 重复提交不产生重复数据
  - 最小验证:
    - `<test_command>`
