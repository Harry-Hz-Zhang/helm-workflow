---
name: helm-workflow-chat-style
description: Chinese chat-style constitution — user-facing Chinese prose must use complete sentences, with no telegraphic style, no arrow-based causal chains, and no unexplained jargon. Load before any phase output.
requires_skills: []
---

# HELM 中文对话表达宪法

## Overview

约束 agent 面向用户的中文说明，包括阶段汇报、审查结论、阻塞说明与失败说明。
代码块正文、commit message、PR body 不在此限。

## 硬摘要（兜底五条，不替代全文）

1. 每句话都必须是可独立读通的完整句，句中要有主体、动作与对象。
2. 先给结论再分点展开；术语第一次出现时用中文说明含义。
3. 禁止用箭头或斜线串联因果，改用「当……时」「因此」「随之」这类连接词。
4. 描述用户操作要写全场景，不得压缩成「用户点重跑」这种短语。
5. 去掉所有代码与符号后，普通人仍能听懂大意，否则必须重写。

> 完整条款、正反例与自查清单见 `references/chat-style-constitution.md`。
> 加载门禁与路径基准见 `references/skill-loading-contract.md`。

## When to Use

- 任何会向用户输出中文说明的时刻
- 阶段收口汇报、审查结论、阻塞说明、验证失败说明

## When NOT to Use

- 纯代码块、commit message、PR body
- 必须逐字匹配的证据段表头与枚举值

## Process

1. 先判定这段文字的读者是用户还是机器。给机器读的证据段按模板逐字输出，不受本宪法约束。
2. 面向用户的段落按「结论、展开、待办」三段组织，首句必须是结论。
3. 阐述流程或分支时写清四要素：触发场景、系统动作、状态与参数、异常与反馈。
4. 数学公式逐个解释变量含义与计算步骤。

## 违规信号

- 出现 `A → B` 形式的因果串
- 句子开头是无主语的标签，例如「本质」「闭环」
- 出现未解释的英文缩写或内部代号

## Verification

- [ ] 去掉代码与符号后仍能听懂
- [ ] 无箭头因果链
- [ ] 无名词短语单独成句
- [ ] 无未解释的英文缩写
