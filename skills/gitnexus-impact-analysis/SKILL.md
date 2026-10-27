---
name: gitnexus-impact-analysis
description: Load when the user asks "what does this change affect", "what could break", or "is this change safe". Applies to assessing the blast radius before editing code and to checking the impact scope of a change before committing.
requires_skills: []
---

<!--
  Derived from abhigyanpatwari/GitNexus (.claude/skills/gitnexus-impact-analysis/SKILL.md).
  PolyForm Noncommercial License 1.0.0.
  Required Notice: Copyright Abhigyan Patwari (https://github.com/abhigyanpatwari/GitNexus)
  See THIRD-PARTY-NOTICES.md. Noncommercial use only. Do not remove this notice.
-->

# 用 GitNexus 做影响分析

## 何时使用

- 「改这个函数安全吗？」
- 「改这里会坏什么？」
- 「这个改动的影响面有多大？」
- 「还有谁在用这段代码？」
- 开始一次非平凡改动之前
- 提交之前，确认本次改动到底影响了哪些流程

## 工作流

```text
1. gitnexus_impact({target: "X", direction: "upstream"})  → 找出依赖它的地方
2. 读取 gitnexus://repo/{name}/processes                   → 查看受影响流程
3. gitnexus_detect_changes()                               → 把当前改动映射到受影响的流程
   注意：scope 只允许 unstaged / staged / all
4. 评估风险等级并汇报
```

若返回「索引过期」，先在终端执行 `npx gitnexus analyze --index-only`，再重跑工作流。

## 检查清单

```text
- [ ] 用 gitnexus_impact 查上游依赖，direction 取 upstream
- [ ] 先看 d=1 的项，这些是一定会坏的
- [ ] 关注置信度高于 0.8 的依赖
- [ ] 读取 processes 资源，确认受影响的执行流程
- [ ] 提交前用 gitnexus_detect_changes 复核，scope 只取 unstaged / staged / all
- [ ] 给出风险等级与结论
```

## 怎么读输出

| 深度 | 风险等级 | 含义 |
| --- | --- | --- |
| d=1 | WILL BREAK | 直接调用者或导入者，改动后必然受影响 |
| d=2 | LIKELY AFFECTED | 间接依赖，很可能受影响 |
| d=3 | MAY NEED TESTING | 传递影响，需要测试覆盖 |

## 风险分级

| 影响范围 | 风险 |
| --- | --- |
| 少于 5 个符号、少量流程 | 低 |
| 5 到 15 个符号、2 到 5 条流程 | 中 |
| 超过 15 个符号或大量流程 | 高 |
| 命中关键路径，例如鉴权、支付 | 严重 |

## 工具用法

**gitnexus_impact**：查符号的影响面。

```text
gitnexus_impact({
  target: "validateUser",
  direction: "upstream",
  minConfidence: 0.8,
  maxDepth: 3
})

→ d=1（WILL BREAK）：
  - loginHandler（鉴权模块登录入口）[CALLS, 100%]
  - apiMiddleware（接口中间件）[CALLS, 100%]

→ d=2（LIKELY AFFECTED）：
  - authRouter（路由层）[CALLS, 95%]
```

**gitnexus_detect_changes**：按 git 差异分析影响面。

```text
gitnexus_detect_changes({scope: "staged"})

→ 改动：3 个文件里的 5 个符号
→ 受影响：LoginFlow、TokenRefresh、APIMiddlewarePipeline
→ 风险：中
```

`scope` 只能取 `unstaged`、`staged`、`all`。不要用历史提交作为比较基准：刚建完索引就做这种比较，会产出上千条噪音，把真正相关的几条淹掉。需要对着某次提交评估影响时，改用 `unstaged` 或 `staged` 把当前改动限定在本次工作区。

## 示例：「改 validateUser 会坏什么？」

```text
1. gitnexus_impact({target: "validateUser", direction: "upstream"})
   → d=1：loginHandler、apiMiddleware（WILL BREAK）
   → d=2：authRouter、sessionManager（LIKELY AFFECTED）

2. 读取 gitnexus://repo/my-app/processes
   → LoginFlow 与 TokenRefresh 都会经过 validateUser

3. 结论：2 个直接调用者、2 条流程，风险等级为中
```

汇报时把直接调用者与间接依赖分开说，并给出每条风险判定的依据：符号数、流程数、是否命中关键路径。只说「影响不大」而不给这三个数字，读者无法复核。
