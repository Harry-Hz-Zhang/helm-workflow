---
name: gitnexus-guide
description: Load when the user needs to look up which tools GitNexus exposes, which resource URIs exist, how to query the graph structure, or which GitNexus skill to use. Triggers on "what can GitNexus do" and "how do I use this tool".
requires_skills: []
---

<!--
  Derived from abhigyanpatwari/GitNexus (.claude/skills/gitnexus-guide/SKILL.md).
  PolyForm Noncommercial License 1.0.0.
  Required Notice: Copyright Abhigyan Patwari (https://github.com/abhigyanpatwari/GitNexus)
  See THIRD-PARTY-NOTICES.md. Noncommercial use only. Do not remove this notice.
-->

# GitNexus 速查

GitNexus 的工具、资源与图结构的集中参考。任务不明确时先看这里，再决定加载哪个技能。

## 从这里开始

任何涉及代码理解、调试、影响分析或重命名的任务，先按下面三步走：

1. 读取 `gitnexus://repo/{name}/context`，拿到代码库概览并确认索引是否过期。
2. 按下表找到对应技能并加载它。
3. 按该技能的工作流与检查清单执行。

第一步若提示索引过期，先在终端执行 `npx gitnexus analyze --index-only`。

## 技能对照

| 任务 | 加载哪个技能 |
| --- | --- |
| 理解架构、问「这段代码怎么工作」 | `gitnexus-exploring` |
| 评估影响面、问「改这里会坏什么」 | `gitnexus-impact-analysis` |
| 追踪缺陷、问「这个报错从哪来」 | `gitnexus-debugging` |
| 批量重命名符号 | 本文件的「工具参考」表，使用 `rename` 工具 |
| 工具、资源、图结构速查 | `gitnexus-guide`（即本文件） |
| 建索引、查状态、清索引、生成 wiki | `gitnexus-cli` |
| 配置 MCP、排查工具不可用 | `gitnexus-setup` |

## 工具参考

| 工具 | 提供什么 |
| --- | --- |
| `query` | 按概念检索相关执行流程，结果按流程分组 |
| `context` | 单个符号的完整视图：调用者、被调用者、参与的流程 |
| `impact` | 符号影响面，按深度 1/2/3 与置信度给出 |
| `trace` | 两个符号之间的调用路径 |
| `detect_changes` | 按 git 差异分析当前改动的影响面 |
| `rename` | 多文件协同重命名，每个改动带置信度 |
| `cypher` | 直接查图，使用前先读 `gitnexus://repo/{name}/schema` |
| `gitnexus_list_repos` | 列出已索引的仓库 |

`detect_changes` 只接受工作区范围：`scope` 取 `unstaged`、`staged` 或 `all`。不要用历史提交作为比较基准，刚建完索引时那样做会产出大量噪音。

## 资源参考

这些资源读取成本低，适合用来导航。

| 资源 | 内容 |
| --- | --- |
| `gitnexus://repo/{name}/context` | 统计信息与索引新鲜度 |
| `gitnexus://repo/{name}/clusters` | 全部功能分区及其内聚评分 |
| `gitnexus://repo/{name}/cluster/{clusterName}` | 某个分区的成员 |
| `gitnexus://repo/{name}/processes` | 全部执行流程 |
| `gitnexus://repo/{name}/process/{processName}` | 单个流程的逐步追踪 |
| `gitnexus://repo/{name}/schema` | 供 Cypher 使用的图结构定义 |

## 图结构

**节点**：`File`、`Function`、`Class`、`Interface`、`Method`、`Community`、`Process`

**边**：通过 `CodeRelation.type` 表达，取值有 `CALLS`、`IMPORTS`、`EXTENDS`、`IMPLEMENTS`、`DEFINES`、`MEMBER_OF`、`STEP_IN_PROCESS`

查询某个函数的直接调用者：

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```

写 Cypher 之前先读一次 `gitnexus://repo/{name}/schema`：不同版本对节点标签与关系名可能有差异，按实际 schema 写才不会查空。
