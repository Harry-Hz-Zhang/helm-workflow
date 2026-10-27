---
name: gitnexus-exploring
description: Load when the user asks "how does this code work", "what is the overall architecture", "who calls this", or "where is the main flow". Applies to reading unfamiliar code, mapping module responsibilities, and tracing a single execution path.
requires_skills: []
---

<!--
  Derived from abhigyanpatwari/GitNexus (.claude/skills/gitnexus-exploring/SKILL.md).
  PolyForm Noncommercial License 1.0.0.
  Required Notice: Copyright Abhigyan Patwari (https://github.com/abhigyanpatwari/GitNexus)
  See THIRD-PARTY-NOTICES.md. Noncommercial use only. Do not remove this notice.
-->

# 用 GitNexus 理解代码

## 何时使用

- 「登录鉴权是怎么走的？」
- 「这个项目的结构是什么样？」
- 「主要模块有哪些？」
- 「数据库相关逻辑在哪？」
- 阅读一段从没看过的代码

## 先探测 MCP 是否可用

动手之前先确认走哪条路径。

### 探测方式

尝试读取 `gitnexus://repos` 资源，或调用 `gitnexus_list_repos` 工具：

- 当返回有效数据时，MCP 可用，直接走 MCP 路径。
- 当报错、返回空、或 `gitnexus_list_repos` 工具不存在时，MCP 不可用，改走降级路径。

### MCP 路径（优先）

```text
1. 读取 gitnexus://repos                        → 找到已索引的仓库
2. 读取 gitnexus://repo/{name}/context           → 代码库概览，同时确认索引是否过期
3. gitnexus_query({query: "<要理解的东西>"})      → 找出相关执行流程
4. gitnexus_context({name: "<符号名>"})           → 深入单个符号
5. 读取 gitnexus://repo/{name}/process/{name}    → 追踪完整执行流程
```

### 降级路径（MCP 不可用）

用命令行加 grep 与读文件替代。每一步最多重试两次，失败就跳过该步继续下一步，不要卡在一个步骤上。

```text
1. 执行 npx gitnexus status 确认索引存在；没有索引则执行 npx gitnexus analyze --index-only
2. 读取 .gitnexus/AGENTS.md（索引摘要）获取架构概览与模块划分
3. 用 grep 搜索符号定义，例如 class 声明、函数定义
4. 用 grep 搜索调用者：按项目语言选择扩展名，例如 .java、.ts、.py
5. 读取源文件，手动追踪调用链，最多追三层
6. 用 grep 搜索外部调用模式，例如 HTTP 客户端、消息监听、RPC 引用
```

降级路径的输出格式与 MCP 路径保持一致，让阅读结论的人不必关心数据是怎么取到的。

## 检查清单

```text
- [ ] 探测 MCP 可用性
- [ ] 读取 gitnexus://repo/{name}/context（MCP 路径）或读 .gitnexus/AGENTS.md（降级路径）
- [ ] 用 gitnexus_query 或 grep 搜索相关概念
- [ ] 查看返回的流程或搜索结果
- [ ] 用 gitnexus_context 或 grep 加读文件追踪关键符号
- [ ] 读取流程资源或源文件
- [ ] 读实现细节，确认结论有代码位置支撑
```

## 可用资源

| 资源 | 能拿到什么 |
| --- | --- |
| `gitnexus://repo/{name}/context` | 统计信息与索引过期提示 |
| `gitnexus://repo/{name}/clusters` | 全部功能分区及内聚评分 |
| `gitnexus://repo/{name}/cluster/{name}` | 分区成员与文件路径 |
| `gitnexus://repo/{name}/process/{name}` | 逐步的执行追踪 |

## 工具用法

**gitnexus_query**：按概念找相关执行流程。

```text
gitnexus_query({query: "支付处理"})
→ 流程：CheckoutFlow、RefundFlow、WebhookHandler
→ 按流程分组的符号，带文件位置
```

**gitnexus_context**：单个符号的完整视图。

```text
gitnexus_context({name: "validateUser"})
→ 上游调用：loginHandler、apiMiddleware
→ 下游调用：checkToken、getUserById
→ 参与的流程：LoginFlow（第 2/5 步）、TokenRefresh（第 1/3 步）
```

## 示例：「支付处理是怎么实现的？」

```text
1. 读取 gitnexus://repo/my-app/context        → 918 个符号，45 条流程
2. gitnexus_query({query: "支付处理"})
   → CheckoutFlow：processPayment → validateCard → chargeStripe
   → RefundFlow：initiateRefund → calculateRefund → processRefund
3. gitnexus_context({name: "processPayment"})
   → 上游：checkoutHandler、webhookHandler
   → 下游：validateCard、chargeStripe、saveTransaction
4. 读取支付模块的源文件，确认实现细节
```

结论里要给出具体文件与符号位置。只描述「大概是这样」而不给位置，等于没查。
