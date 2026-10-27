---
name: gitnexus-debugging
description: Load when the user is debugging a defect, tracing where an error comes from, or asking "why does this fail here". Applies to locating suspect code from an error message, tracing the call chain, and confirming the root-cause location.
requires_skills: []
---

<!--
  Derived from abhigyanpatwari/GitNexus (.claude/skills/gitnexus-debugging/SKILL.md).
  PolyForm Noncommercial License 1.0.0.
  Required Notice: Copyright Abhigyan Patwari (https://github.com/abhigyanpatwari/GitNexus)
  See THIRD-PARTY-NOTICES.md. Noncommercial use only. Do not remove this notice.
-->

# 用 GitNexus 排查缺陷

## 何时使用

- 「这个函数为什么失败？」
- 「这个报错是从哪来的？」
- 「谁调用了这个方法？」
- 「这个接口返回 500」
- 排查缺陷、异常或不符合预期的行为

## 先探测 MCP 是否可用

### 探测方式

尝试读取 `gitnexus://repos` 资源，或调用 `gitnexus_list_repos` 工具：

- 当返回有效数据时，MCP 可用，直接走 MCP 路径。
- 当报错、返回空、或 `gitnexus_list_repos` 工具不存在时，MCP 不可用，改走降级路径。

### MCP 路径（优先）

```text
1. gitnexus_query({query: "<错误信息或现象>"})        → 找相关执行流程
2. gitnexus_context({name: "<可疑符号>"})             → 看调用者、被调用者、参与的流程
3. 读取 gitnexus://repo/{name}/process/{name}         → 追踪执行流程
4. gitnexus_cypher({query: "MATCH path..."})          → 需要时自定义调用链查询
```

### 降级路径（MCP 不可用）

按错误关键词用 grep 加读文件定位。每一步最多重试两次，失败就跳过继续下一步。

```text
1. 按错误关键词搜索源码：grep 错误信息或异常类型名，扩展名按项目语言选择，例如 .java、.ts、.py
2. 从搜索结果定位可疑方法或类
3. 搜索该方法的调用者
4. 读源文件，提取方法体内的下游调用
5. 搜索异常处理位置，例如 catch 块或错误分支
6. 读关键源文件确认根因，最多追三层
```

降级路径的输出格式与 MCP 路径保持一致，让阅读结论的人不必关心数据是怎么取到的。

## 检查清单

```text
- [ ] 探测 MCP 可用性
- [ ] 弄清现象：错误信息原文、预期行为与实际行为
- [ ] 用 gitnexus_query 或 grep 按错误关键词搜索
- [ ] 从结果里锁定可疑函数
- [ ] 用 gitnexus_context 或 grep 加读文件追调用者与被调用者
- [ ] 追踪执行流程（MCP：读流程资源；降级：读源文件）
- [ ] 需要自定义链路时用 gitnexus_cypher（仅 MCP 路径，降级路径跳过这一步）
- [ ] 读源文件确认根因，并给出代码位置
```

## 常见现象与查法

| 现象 | 查法 |
| --- | --- |
| 明确的错误信息 | 用 `gitnexus_query` 搜错误文本，再对抛出位置做 `context` |
| 返回值不对 | 对目标函数做 `context`，顺着被调用者追数据流 |
| 偶发失败 | 做 `context` 后重点看外部调用与异步依赖 |
| 性能问题 | 做 `context` 后找调用者多的符号，那些通常就是热点路径 |
| 最近才坏 | 用 `gitnexus_detect_changes`，`scope` 取 `unstaged`、`staged` 或 `all` |

`detect_changes` 不要用历史提交当比较基准：刚建完索引就做这种比较会产出大量噪音。需要限定范围时用工作区三种 `scope`。

## 工具用法

**gitnexus_query**：找与错误相关的代码。

```text
gitnexus_query({query: "支付校验错误"})
→ 流程：CheckoutFlow、ErrorHandling
→ 符号：validatePayment、handlePaymentError、PaymentException
```

**gitnexus_context**：看可疑符号的完整上下文。

```text
gitnexus_context({name: "validatePayment"})
→ 上游调用：processCheckout、webhookHandler
→ 下游调用：verifyCard、fetchRates（外部接口）
→ 参与的流程：CheckoutFlow（第 3/7 步）
```

**gitnexus_cypher**：自定义调用链查询。

```cypher
MATCH path = (a)-[:CodeRelation {type: 'CALLS'}*1..2]->(b:Function {name: "validatePayment"})
RETURN [n IN nodes(path) | n.name] AS chain
```

## 示例：「支付接口偶发返回 500」

```text
1. gitnexus_query({query: "支付错误处理"})
   → 流程：CheckoutFlow、ErrorHandling
   → 符号：validatePayment、handlePaymentError

2. gitnexus_context({name: "validatePayment"})
   → 下游调用：verifyCard、fetchRates（外部接口）

3. 读取 gitnexus://repo/my-app/process/CheckoutFlow
   → 第 3 步：validatePayment 调用 fetchRates（外部）

4. 根因：fetchRates 调外部接口时没有设置超时，网络抖动时上游等待超时后返回 500
```

根因必须落到具体代码位置与触发条件。结论里写「可能是网络问题」而不指出缺失的超时设置，属于没有查到根因。
