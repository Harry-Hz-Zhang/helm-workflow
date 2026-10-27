---
name: helm-workflow-init
description: Initialize a workbench for product-line multi-repo orchestration. Agent-agnostic; supports CodeBuddy, Claude Code, Cursor, OpenCode, Codex.
requires_skills:
  - helm-workflow-router
---

# HELM Init

## Overview

`/helm:init`（等同 `/helm-init`）是**单一入口**：按条件内部分流 **Bootstrap**（空仓/残缺 → 全量治理构建）或 **Bind**（已就绪 workbench → 本机 links / workspace / clone / CodeGraph）。不新增 `/helm-bind`。

Bootstrap：收集清单 → **先拉齐**（URL 先 clone）→ AI 推断 → **一次确认** → 校验落盘 → 工具类型检测 → 子 agent 并行技术栈分析 → 跨项目拓扑分析 → 生成项目上下文 → CodeGraph + MCP → 报告。

Bind：同级扫描 → 窄表确认 → bind/clone → 写 `.state/repos.links.yaml` + `.code-workspace` → 本机 CodeGraph。幂等设计；二次运行对已就绪治理资产走 Bind，不重走全量产品线确认。

## When to Use

- 首次为产品线创建 workbench（Bootstrap）
- 已有 workbench，需构建或刷新本机多 Git 协作环境（Bind）
- 已有 workbench 但需增减仓库（Bootstrap 侧清单修正后再绑定）

## When NOT to Use

- 单库模式（无需 workbench）
- 仅需会话态（`.state/session-context.yaml`）——由 new/feature 等阶段负责；**init 不写 session-context**

## HARD-GATE

- 存在 `repos.manifest.yaml` 但 `validateManifest()` 失败，且**并非**「仅因含 `repo_path`」→ **硬停**，不落盘、不假装 Bind/Bootstrap 成功
- 若校验失败**仅因**含 `repo_path` → **不硬停**，进入「旧 `repo_path` 迁移」（见 Mode Gate / 迁移节）
- 窄表仍有未解决的「待定」→ 不落盘 links/workspace
- 用户对窄表答「否」→ 中止本轮绑定，不写 links/workspace
- 提交域隔离：workbench 仓仅提交治理资产；业务仓 / 模拟服务仓用 `git -C <resolve(name)>`（路径来自 links，非入库 `repo_path`）
   - `resolve(name)` 的路径权威是本机 `.state/repos.links.yaml`；**MUST NOT** 从入库 `repos.manifest.yaml` 的 `repo_path` 读取。
- **禁止 symlink/junction** 挂仓（禁止目录 symlink；MUST NOT 创建 `repos/` symlink/junction）
- MUST NOT 创建/更新 `.state/session-context.yaml`（init/Bind **不写** session-context）

## Process

### Mode Gate — Bootstrap / Bind 判定

入口先判定模式（单一 `/helm:init`，无第二 slash）：

**Bind**（**同时满足**以下三条件）：

1. 存在 `.workbench.yaml`，且含 `mode: workbench`、`productline`
2. 存在 `repos.manifest.yaml`，且通过严格 `validateManifest()`（或见下方「仅因 `repo_path`」迁移后再校验）
3. manifest 中已有 `role: workbench` 条目

**否则 → Bootstrap**（空仓或治理资产残缺）。

**校验失败分流**（已有 `repos.manifest.yaml` 时）：

1. 若 `validateManifest()` 失败**仅因**含 `repo_path` → **不硬停**；进入「剥离到 links → 窄表确认 → 删共享 `repo_path` → 再严格 `validateManifest()`」；通过后按 Bind 其它条件继续（或回 Bootstrap 若其它 Bind 条件未齐）
2. **其它**校验失败 → **硬停**，不落盘、不假装成功

**部分就绪**（如有合法 manifest、无 `.workbench.yaml`）→ Bootstrap，可复用已有 manifest 作种子。

| 模式 | 默认行为 |
|------|----------|
| **Bind** | 跳过重问产品线（除非用户显式要改）；无仓增删时跳过 S9–S11；不重写已有 AGENTS 业务段。仍做：同级扫描 + 窄表 → links/workspace → 按需 clone → 本机 CodeGraph |
| **Bootstrap** | 走 S2 摄入（先拉齐→一次确认）后 S3–S13；同级扫描仅作弱建议；一次确认已含本机路径，**确认后不再单独出窄表** |

### Bind — 本机绑定（已就绪 workbench）

1. **同级扫描**：workbench 父目录下一层子目录；仅含 `.git`；不递归。workbench 自身不参与扫描（路径为本机根，不以入库 `repo_path` 表示）。
2. **匹配优先级**（每个非 workbench 仓）：目录名 == 仓名 → 强匹配；`origin` 与 manifest `repo_url` 规范化后相等 → URL 匹配；多目录命中 → 歧义；都无 → 未找到。状态：`matched_name` | `matched_url` | `ambiguous` | `missing`。
3. **窄表确认**（四列）：

| 仓名 | 动作 | 路径 | 置信度 |
|------|------|------|--------|
| … | bind / clone / 待定 / 跳过 | 本地或 clone 目标；歧义列候选 | 高 / 中 / 低 / — |

- 置信度：高=目录名一致；中=仅 URL；低=歧义；—=未找到（默认 clone）
- 默认动作：高/中 → `bind`；未找到 → `clone` 到 `<workbench_parent>/<name>`；低 → `待定`（确认前必须点选或跳过）
- 表下提示：回复「是 / 否」；或文字更正（如 `mp-rules-test 跳过`）。**是**：执行（仍有「待定」则先追问，不静默落盘）。**否**：中止，不写 links/workspace。**更正**：改行后重打窄表。

**对用户说话纪律（Bind 与 Bootstrap 绑定确认共用）**：面向用户的主文案 MUST 用白话说明「在做什么 / 发现了什么 / 准备怎么做」。MUST NOT 仅以「同级扫描」「窄表确认」「Mode Gate」等内部步骤名作为用户可见主提示。推荐确认话术骨架：先说「在同目录下找到了这些本地仓库」；表头用「仓库 / 准备做什么 / 本地路径」；引导「是 / 否 / 改某一行」。skill 内部步骤标题与流程描述可继续使用「同级扫描 / 窄表」。待定门禁不变：待定未清不落盘。Bootstrap 治理落盘后的绑定复用确认表同样遵守本纪律。

4. **执行顺序**：先全部 bind（校验 `.git`）→ 再并行 clone（并发 ≤2）→ 汇总。单仓失败不阻断整次。
   - 并发上限取 `helm-workflow.local.yaml` 的 `clone_max_concurrency`（默认 2）；配置缺失时用默认值，不得静默改成其它值。
5. **落盘**：
   - 写入/覆盖 `.state/repos.links.yaml`（不入库）
   - 生成/更新 `<productline>.code-workspace`：`folders` = workbench 根 + 已成功 bind/clone 的非 workbench 仓（跳过项不入；**不是** manifest 仓数 +1）
   - **不**重写 `repos.manifest.yaml` / `.workbench.yaml`（除非本轮显式增删改仓）
   - **不创建、不更新** `.state/session-context.yaml`
6. **CodeGraph**：对已绑定 business 仓可靠触发 `codegraph init`（路径经 `resolve(name)`）+ 冒烟验 `.codegraph/` + MCP 幂等注册；结束报告用五态，失败不回滚 links/workspace。
   - 是否执行 `codegraph init` 由 `codegraph_init` 决定（默认 true）；设为 false 时跳过并记录 `codegraph_init: false`，不再作其它推断。
   - `resolve(name)` 的路径权威是本机 `.state/repos.links.yaml`；**MUST NOT** 从入库 `repos.manifest.yaml` 的 `repo_path` 读取。

### 旧 `repo_path` 迁移

二次 init 若共享 `repos.manifest.yaml` 仍含入库 `repo_path`（含历史 workbench 的 `repo_path: .`）——Mode Gate **不硬停**，按下列顺序（**须在严格 `validateManifest()` 之前**完成）：

1. **剥离到 links**：将各非 workbench 仓的 `repo_path` 写入 `.state/repos.links.yaml`（供窄表预填）；workbench 的历史 `repo_path: .` 丢弃、不入 links
2. **窄表确认**：用户确认绑定/clone/待定/跳过
3. **删共享 `repo_path`**：从共享 `repos.manifest.yaml` **删除**全部 `repo_path` 字段
4. **再严格 `validateManifest()`**：以无路径 manifest 调用严格 schema；若仍有**其它**错误 → 硬停

workbench 自身现仅靠 `role: workbench` 标识（强制排第一），**不含入库 `repo_path`**，**不再**要求入库 `repo_path: .`。

### S0 — 工具类型检测

技能执行前直接向当前 AI 编码工具提问，获取工具类型:

> "你运行在哪个 AI 编码工具中？返回以下之一: CodeBuddy | Claude Code | Cursor | OpenCode | Codex"

- 根据返回结果确定工具类型，用于后续 S11（项目上下文落盘）、S12（CodeGraph MCP）的工具适配
- 若返回"不确定"/"其他" → 输出所有工具指引，由用户自行选择
- **Bind 模式**：仍需 S0（MCP 注册依赖工具类型）；随后跳到「Bind — 本机绑定」，不进入 S2a

> **前置加载（HARD-GATE）**：MUST 用 Skill 工具实际加载 frontmatter `requires_skills` 的全部项（声明 ≠ 加载）；
> MUST 在本阶段日志写入 `### Skills Loaded` 证据段，声明了但未列出的依赖判为未加载；
> 任一项加载失败 → 立即停止，不得降级继续。
> 路径基准：仓库根相对路径（见 `references/skill-loading-contract.md` 第 0 节）。
> 完整规则见 `references/skill-loading-contract.md`。

2. 收集仓清单（缺名单时追问一句）：

| 字段 | 必填 | 说明 |
|------|:---:|------|
| 仓名 | ✅ | 全 manifest 唯一 |
| 本地项目根目录 | 二选一 | 仅本机，**不入**共享 manifest |
| Git 远程地址 | 二选一 | 如 `git@gitlab...` |

```
order-service    <本机绝对路径>/order-service
order-service-common git@gitlab.example.com:group/order-service-common.git
```

#### 阶段2 — 先拉齐（一次确认之前）

对每个仓：

1. 本地路径已有 `.git/` → 使用该路径  
2. 仅有 git URL → **先 clone** 到 `<workbench_parent>/<repo_name>`（浅克隆 `git clone --depth 1`；并发 ≤2）  
   - 并发上限取 `helm-workflow.local.yaml` 的 `clone_max_concurrency`（默认 2）；配置缺失时用默认值，不得静默改成其它值。
   - 克隆深度取 `clone_depth`（默认 1）；`clone_depth: 0` 表示全量克隆，必须显式说明原因。
3. **提供 URL = 同意先拉**，MUST NOT 再为「是否 clone」开门控  
4. Clone 失败 → `clone_failed`，**不阻断**；后续降级推断  
5. 输出 `「clone 结果: 成功 M / 跳过 S / 失败 F」`  
6. **禁止 symlink/junction**

#### 阶段3 — AI 扫描推断（不得询问用户）

**路径 A：本地代码可用**：

| 推断字段 | 推断方式 | 默认值 |
|---------|---------|--------|
| `role` | 可构建 / 可部署 → `business`；被其他仓依赖的库 → `lib`；无构建产物 → `docs`；治理仓 → `workbench` | `business` |
| `tech` | 取仓内主构建文件或主语言（如 `python` / `go` / `java` / `typescript` / `rust`） | `unknown` |
| `repo_url` | `git remote get-url origin` 或用户 URL | — |
| `branch` | `git branch --show-current` 或默认 `master` | `master` |
| `depends_on` | 仓名后缀关联（被依赖的仓列为上游） | — |
| `domain` | 有 `app.name` 的仓：读配置文件里的 `app.name`（**原样**值，如 `example-service`；短名也原样存），不区分 role/tech；无 `app.name` 的仓留空 | 空 |

**路径 B：clone 失败等**：仓名规则降级；`tech: [unknown]`；标注 `⚠️ 推断基于仓名/URL（clone 失败或非 git 仓）`。  
**路径 C：非 git 仓**：可扫则推断 role/tech；`repo_url`/`branch` 留空。

#### 阶段4 — 一次确认（唯一用户门控）

合并产品线、治理字段与本机绑定为一张卡：

| productline | name | role | tech | repo_url | branch | 本机动作 | 路径 | 状态 |
|-------------|------|------|------|----------|--------|----------|------|------|
| … | … | … | … | … | … | bind/clone/跳过/待定 | … | ✅已扫描 / ⚠️降级推断 / ⚠️非git仓 |

- 引导白话是 / 否 / 改某一行」；待定未清不落盘；否=取消  
- 可删仓：磁盘保留，提示 `本地目录 <path> 保留，如需清理请手动删除`  
- 改路径：用户/`mv` 挪目录后更新卡内路径；init **不**静默搬迁  
- 确认后进入 S3；**Bootstrap 确认后不再单独出窄表**

### S3 — 校验清单

调用 `validateManifest()` 校验：
- name 唯一性
- role 枚举约束（harry-workbench/business/lib/docs）
- business/lib tech 必填
- workbench 条目存在且建议为首条
- **禁止**共享清单含 `repo_path`（若仍有旧字段 → 先走「旧 `repo_path` 迁移」）

迁移后严格校验仍失败（或失败原因非仅 `repo_path`）→ 硬停，不创建任何文件（原子性）。

### S4 — 生成 manifest/workspace/config

1. 生成/更新 `.workbench.yaml`（productline/mode/templates/versions）
2. 生成/更新 `repos.manifest.yaml`（仓库权威清单；首条 `role: workbench`；**无**入库 `repo_path`）
3. 按一次确认结果生成/更新 `.state/repos.links.yaml`（**MUST** 数组格式，每条 `{name, path}`；**MUST NOT** 写成 `name: {path, status}` 的 map 格式），并生成/更新 `<productline>.code-workspace`（Bootstrap **不再**二次窄表）
   - `links` 固定结构：
     ```yaml
     version: 1
     links:
       - name: <repo-name>
         path: <absolute-path>
     ```
   - `folders[0]` = workbench 根；其后 = 已成功 bind/clone 的非 workbench 仓
   - `*.code-workspace` **不入库**（见 S6）
4. **MUST NOT** 创建/更新 `.state/session-context.yaml`（init **不写** session-context；留给 new/feature）

### S5 — 可见性校验

`.code-workspace` folders 数 = **1（workbench 根）+ 已成功 bind/clone 的非 workbench 仓数**（跳过/失败不计）。不匹配 → 硬停。  
（已废弃旧公式「folders = manifest 仓数 + 1」。）

### S6 — .gitignore 幂等追加

追加 `/.state/`、`/temp/`、`*.local`、`*.code-workspace`。不忽略 `openspec/`、`features/`、`knowledge/`。幂等：不产生重复行。MUST NOT 将 `.vscode/` / `.obsidian/` 写入标准强制块。

### S7 — 创建骨架目录 + AGENTS.md / CLAUDE.md

1. 创建骨架目录：`features/`、`knowledge/{product,tech}/`、`openspec/`。每个空目录含 `.gitkeep`。

2. **AGENTS.md**（薄规程，先写启动段）：
   - 启动规程（读配置/manifest；session-context 由后续阶段维护，init 不创建）
   - `git -C <resolve(name)>` 提交域隔离规则（路径来自 `.state/repos.links.yaml`）
   - `resolve(name)` 的路径权威是本机 `.state/repos.links.yaml`；**MUST NOT** 从入库 `repos.manifest.yaml` 的 `repo_path` 读取。
   - 不枚举仓清单（以 repos.manifest.yaml 为权威）
   - 不写 HELM 入口路径
   - **Bind**：已有 AGENTS 业务段则**不重写**

3. **CLAUDE.md**：指向 AGENTS.md。

### S8 — 增量检测（扫描前强制执行）

> Bind 且无仓增删 → **跳过 S9–S11**（本步可输出「无仓变更，跳过分析」）。

- 从 `repos.manifest.yaml` 尾部注释区解析已有项目记录（按 S11 写入的项目概览表行提取项目名）
- 无项目记录 → S = {}
- 从 manifest 当前 repo 列表获取项目名集合 C
- 新增 = C \ S（repo_name 精确匹配），不变 = C ∩ S
- 输出可见证据: "增量检测: 新增 N 项目, 不变 M 项目"
- 新增为空 → 跳过 S9~S11（除非用户显式指定重新分析）
- 有新增 → 执行 S9

### S9 — 子 Agent 并行项目分析

对每个 **新增** business 仓发起独立的分析子任务。所有项目必须并行启动，不可串行等待。

**S9a 并行启动子任务** — 工具适配表:

| 工具 | 启动方式 | 并行机制 | 结果交付 |
|------|---------|---------|---------|
| **CodeBuddy** | `Agent({subagent_type: "Explore", run_in_background: true})` | 同一条消息并行发起所有 Agent | 异步，`<agent-notification>` 标签自动投递 |
| **Claude Code** | Sub-agent / Task agent（后台模式） | 同一条消息并行发起所有子代理 | 子代理结果回显到对话 |
| **Cursor** | Agent / Composer 并行调用 | 同一条消息并行发起 | 结果内联回显到对话 |
| **OpenCode** | Subagent 系统 | 并行发起所有子代理 | 子代理输出回显到对话 |
| **Codex** | Agent 并行探索 | 并行发起所有 Agent | Agent 输出回显到对话 |

**CodeBuddy 专项规则**：平台可能自动创建 team，必须完全忽略：
- ❌ 不调用 `SendMessage` 联系任何 agent
- ❌ 不调用 `broadcast`
- ❌ 不看/不信 `<system-reminder data-role="team-context">` 中的队伍列表
- ✅ 仅被动等待 `<agent-notification>` / `<teammate-message>` 自动到达

**通用要求**：
- 每个子任务返回必须包含 `=== <项目名> ===` 标题标识
- Agent prompt 中必须包含项目名称

**S9b 子任务输出要求**（每个 agent 必须在返回中同时给出）：

```
=== <项目名> ===
## 项目基本信息
- 项目类型、语言、构建工具
- 自身坐标（groupId:artifactId:version）

## 技术栈
- 逐模块 JDK 版本（Maven: maven.compiler.release → maven.compiler.source → java.version → 父POM → 默认1.5）
- Gradle: settings.gradle → toolchain.languageVersion → sourceCompatibility → 继承 → 当前JDK
- 核心框架版本

## 工作空间内依赖 (IMPORTANT)
搜索构建文件中 groupId 属于以下范围内的所有依赖，判断是否指向工作空间内项目：
- com.example.* / com.acme.* / com.internal.*
格式: "- shared-utils: common-component:1.1.8 (pom.xml L163)"

## 业务领域 + 目录概要

## 对外API面（Runtime Call Surface，供跨项目匹配用） (IMPORTANT)
- Java Spring MVC: Grep @RequestMapping/@Controller/@RestController → 提取路径前缀
  格式: "/orders → OrderController"
- Java RPC 框架: 列出服务实现类暴露的接口路径
- 其他（Node.js/Go/Python/纯前端）: 写"不适用"

## API调用面（Runtime Call Targets，供跨项目匹配用） (IMPORTANT)
- Node.js 前端: 列出 src/apis/ / src/api/ / src/services/ 目录 → 抽样读3-5个文件提取URL前缀
  格式: "/orders → (orders.js)"
- Java: 从 @FeignClient / HttpClient / RestTemplate 提取目标 URL 前缀
  格式: "调用方法名 → URL前缀"
```

**S9c 结果完整性验证与自动重试**（HARD-GATE）:

AI 维护两个集合：E (expected) = S8 增量检测的所有"新增"项目；R (received) = 已收到 `=== <项目名> ===` 的项目。

每次收到一条子任务结果时增量比对：
- R == E → ✅ 完整，进入 S11
- R ⊂ E + 子任务已全部发起 + 合理时间内无更多结果 → 超时，计算缺失 = E \ R，触发重试

**自动重试**：缺失项目单独启动子任务重试，上限 3 次总尝试（原始1次 + 重试2次）。3次耗尽 → 告警 "分析失败（已重试3次）"，标注 ⚠️。

### S10 — 跨项目拓扑分析

从 S9 子 agent 返回的结果中提取，**不另起 Agent**。

**S10a 构建依赖拓扑**：
- 汇总所有 agent 返回的"工作空间内依赖"字段
- 构建依赖关系矩阵（无需读取额外构建文件——agent 已读取）
- 标注各项目在拓扑中的角色（"上游服务，被 <project> 依赖"、"共享基础组件"）

**S10b 运行时调用关系匹配**（HTTP API 调用链）：

匹配算法：
```
输入: 所有项目的 {对外API面, API调用面} 集合

1. 构建路由索引: 对外API面路径前缀 → Project 映射
2. 对每个调用的路径前缀 P_call:
   a. 在路由索引中查找前缀匹配（如 P_call="/orders/detail", 后端="/orders"）
   b. 多匹配 → 取最长前缀
   c. 无匹配 → 标记为"外部系统调用"
3. 聚合: 同一对 (调用方, 被调用方) 的所有匹配合并
```

输出可见证据:
```
| 调用方 | 被调用方 | 匹配路径 | 证据 |
|--------|---------|---------|------|
| web-frontend | backend-portal | /orders/*, /users/*, ... (N 条路径) | frontend API → backend @RequestMapping |
```

判定：
- 有匹配 → 拓扑图中标注虚线 "HTTP API（运行时调用，非构建依赖）"
- 无匹配 → 拓扑图不变
- 有前端+后端但运行时调用关系表为空 → ⚠️ 告警，**不**提示用户确认、**不**门控（完整调用关系/知识库反向生成 Out of Scope）

### S11 — 项目上下文落盘

将 S9~S10 的技术栈扫描和拓扑分析结果追加到 `repos.manifest.yaml` 尾部（**不生成独立文件，不修改项目仓库自身目录**）：

根据当前工具类型，按以下格式适配：

| 当前工具 | 内容存放位置 | 格式要求 |
| --- | --- | --- |
| CodeBuddy | `repos.manifest.yaml` 尾部 | 项目概览表 + Java 版本明细 + 跨项目拓扑关系图 |
| Claude Code | `repos.manifest.yaml` 尾部 | `# CLAUDE.md` + `This file provides guidance to Claude Code` 前缀 + 每个项目独立段落: 项目概述 + 技术栈概要 |
| OpenCode | `repos.manifest.yaml` 尾部 | 项目名称 + 项目约定 + 架构概要（约 150 行，多项目分段排列） |
| Codex | `repos.manifest.yaml` 尾部 | `# Repository Guidelines` + 项目结构 + 编码风格（200-400 词，多项目分段排列） |
| Cursor | `repos.manifest.yaml` 尾部 | 项目概述 + 技术栈概要 + 目录结构 |

**内容原则**（各工具 `/init` 通用）:
- 尾注**不得写本机路径**（路径只在 links / workspace）
- Java 之外的语言/框架不列具体版本号（版本更新频繁，列版本容易过时）
- 保持文档精简，避免生成过大的 MD 文件

**写入内容**：S9 子 agent 返回的项目表/版本 + S10 提取的拓扑关系（含构建依赖 + 运行时调用关系）。
- 项目上下文内容以 YAML 注释形式追加（`# ` 前缀）；保持 manifest 条目在前、注释在后，YAML 合法
- **写入后禁止再基于新到达的代理结果追加或覆盖内容**
- S9 有项目最终失败（3 次重试耗尽）→ 在 manifest 尾部标注该项目的分析状态为 "⚠️ 分析失败，需手动补充"
- 部分失败时拓扑标注：依赖矩阵有缺失项目 → 为缺失表行标注 "⚠️ 数据缺失"，并在拓扑图旁加注释

**幂等规则**：
- 先解析 manifest 尾部已有的项目上下文段（以 `# ` 开头的注释区）
- 已有记录按项目名覆盖更新；新增记录追加
- 再次运行时增量检测（S8）无新增项目 → 跳过 S11 写入

### S12 — CodeGraph 索引 + MCP 注册

> **合同（可靠启动 + 冒烟）**：废除纯 fire-and-forget「已触发」成功语义。失败 **MUST NOT** 回滚已写 links/workspace。本流程只认 `codegraph_init` 一个开关；历史键名 `codegraph_auto_index` 已废弃，出现即忽略并提示用户改名。

1. **可用性检查**：`codegraph --version`
   - 不可用 → 尝试安装：`npm install -g @colbymchenry/codegraph`（**不带版本号**，装最新），安装后继续
   - **MUST NOT** 安装其它错误/不存在的 codegraph 包名；仅用 `@colbymchenry/codegraph`
   - 安装失败 → 记五态 **安装失败**，输出提示后跳到 S13（不阻断 init）
   - 可用 → 继续

2. **可靠可执行入口 + 触发索引**：对每个已绑定 business 仓（路径经 `resolve(name)` / links）：
   - `resolve(name)` 的路径权威是本机 `.state/repos.links.yaml`；**MUST NOT** 从入库 `repos.manifest.yaml` 的 `repo_path` 读取。
   - **MUST** 优先经 shell 解析后的可执行入口
   - Windows：**MUST NOT** 使用 `Start-Process -FilePath "codegraph"`（无扩展名 npm shim 非 PE）；默认推荐 `cmd /c codegraph init "<resolved_path>"`
   - 非 Windows：`codegraph init <resolved_path>`（经 PATH/shell）
   - 排除 workbench 当前目录 `.`
   - 命令无法拉起或非零退出 → 立即记 **启动失败**（不等待冒烟）

3. **冒烟门禁**：触发后轮询目标仓是否出现 `.codegraph/`（间隔 **1s**，最多 **10s**）
   - 出现 → **已索引（冒烟通过）**
   - 超时未见 → **未生成索引**
   - 已有 `.codegraph/` → **跳过**（幂等）
   - **MUST NOT** 在未冒烟通过时报告成功态「已触发」

4. **MCP 注册**（按当前工具类型）：

   从 links 取首个 business 仓路径，组装 `--path` 参数。

   > 本表是**宿主自身**的配置文件位置，属 `references/skill-loading-contract.md` 第 0 节"禁止写死宿主目录名"的例外（只描述外部工具的事实位置，不作为 HELM 物料的落盘路径）；HELM 物料一律用 `<AGENT_DIR>/...`。

   | 工具 | 配置文件 | MCP 注册方式 |
   |------|---------|-------------|
   | CodeBuddy | `~/.codebuddy/.mcp.json` | 追加 `{"codegraph": {"type": "stdio", "command": "codegraph", "args": ["serve", "--mcp", "--path", "<business-path>"], "defer_loading": false}}` 到 `mcpServers` |
   | Claude Code | `~/.claude/.mcp.json` | 同上 |
   | Cursor | `~/.cursor/mcp.json` | 同上 |
   | OpenCode | `opencode.json`（workspace 根目录） | 同上。⚠️ 必须先 Read 再合并 |
   | Codex | `~/.codex/codex.toml` | 追加 `[[mcp_servers]]` 条目。⚠️ 必须先 Read 再合并 |

   - 已存在 `codegraph` 条目 → 跳过（幂等）
   - **禁止不读即写**（覆盖已有 MCP 配置）

5. **CodeGraph 使用指引**（中性；AGENTS 入库，本机就绪态**不**写入 AGENTS）：
   - 若 AGENTS.md **尚未**含 CodeGraph 段 → 追加中性指引：
   ```markdown
   ## CodeGraph 使用

   - 有 CodeGraph 索引时优先使用 CodeGraph MCP 工具；否则使用 Grep/Read
   - 符号定义、调用链、影响范围分析 → 优先 CodeGraph（若可用）
   - 字符串字面量、注释内容 → Grep
   ```
   - 已有 CodeGraph 指引段 → **不改**
   - MUST NOT 写入「本机已索引 / MCP 已注册」等就绪断言；本机是否就绪只出现在 **S13 结束报告**

6. **容错**：索引/冒烟/MCP 失败 **不阻断 init**，且 **不回滚** links/workspace

### S13 — 报告

输出结构化初始化报告（区分治理层 / 本机层）。CodeGraph 本机层 **五态**（每仓一条）：

`已索引（冒烟通过）` | `跳过` | `安装失败` | `启动失败` | `未生成索引`

**禁止**用「已触发」冒充冒烟成功。

```
╔══════════════════════════════════════════╗
║      <productline> workbench 初始化完成  ║
╠══════════════════════════════════════════╣
║  治理层: <已就绪 / 本轮新建>             ║
║  ✓ 项目注册: N 个目录                    ║
║  ✓ manifest: N 个仓                      ║
║  本机层: bind M / clone N / 跳过 S / 失败 F ║
║  ✓ links: .state/repos.links.yaml        ║
║  ✓ 项目分析: N 个项目技术栈已扫描        ║
║  ✓ 拓扑关系: 构建依赖 K 条 + HTTP 调用 H 条║
║  ✓ CodeGraph: <已索引（冒烟通过）/跳过/安装失败/启动失败/未生成索引> ║
║  ✓ CodeGraph MCP: <已注册 / 未安装>      ║
║  ✓ .state/ 就绪（未写 session-context）  ║
║  ✓ Git 完整历史: <已启动 fetch --unshallow / 无新 clone> ║
╚══════════════════════════════════════════╝
```

总标题仍可「初始化完成」；CodeGraph 失败仅在本机层如实列出（warn）。
### Post-init — fetch --unshallow

报告输出后，对本次 init **新 clone** 的项目异步执行：
- `git -C <resolved_path> fetch --unshallow`
- 并发度 ≤ 2
   - 并发上限取 `helm-workflow.local.yaml` 的 `clone_max_concurrency`（默认 2）；配置缺失时用默认值，不得静默改成其它值。
   - CodeGraph 并发上限取 `codegraph_max_concurrency`（默认 2）。
- **fire-and-forget**：不等待执行结果，不检查 exit code
- 失败不回滚，不提示用户（后台任务）

### ★ 硬停止规则（CRITICAL）

**S13 报告输出后，init 流程已结束。不得执行以下任何操作**：

| 禁止行为 | 原因 |
|---------|------|
| 为"完善拓扑"启动新的 Agent 或 Explore 子任务 | 拓扑已在 S10 从 agent 结果中提取 |
| 修改/重写已生成的 AGENTS.md 的业务内容 | 文档已在 S11 一次性完成（S12 追加中性 CodeGraph 指引除外） |
| 追加新的依赖分析、版本对比等内容 | 初始化阶段产物已交付 |
| 因后台任务（fetch）完成而继续处理 | fetch "即发即忘"；CodeGraph 冒烟已在 S12 完成 |
| 用「已触发」冒充 CodeGraph 冒烟成功 | 须用五态如实报告 |

> **判定**: S13 报告输出后仍有新增分析操作 → ❌ 严重流程违规

## 幂等性保证

| Step | 二次运行行为 |
|------|------------|
| Mode Gate | 已就绪 → Bind；仅因 `repo_path` → 先迁移再严格校验；其它非法 → 硬停；否则 Bootstrap |
| Bind | 跳过产品线与无变更 S9–S11；刷新 links/workspace |
| S2b clone | 已存在 git 仓 → 跳过；只 clone 新增 |
| S3 校验 | 重新校验 manifest，拒绝非法；禁止入库 `repo_path` |
| S4 生成 config | 覆盖更新 links/workspace；**不写** session-context |
| S8 增量检测 | 解析已有项目集合，仅分析新增；无新增 → 跳过 S9~S11 |
| S9 子 Agent 分析 | 增量检测后仅对新增项目启动 |
| S12 CodeGraph | 已有 `.codegraph/` → 跳过；冒烟五态报告；MCP 已注册 → 跳过；AGENTS 已有指引 → 不改 |
| S6 .gitignore | 幂等追加，无重复行 |

## Verification

- [ ] 单一 `/helm:init`；无 `/helm-bind`；Bootstrap/Bind 判定正确
- [ ] Mode Gate：仅因 `repo_path` 校验失败 → 不硬停，先迁移再严格 validateManifest；其它失败硬停
- [ ] Bootstrap：收集 → 先拉齐 → 推断 → 一次确认 → 落盘（无单独 S2a Y/N；确认后无二次窄表）
- [ ] 提供 URL = 同意先拉；clone 结果摘要；失败不阻断
- [ ] 一次确认卡含状态列 + 本机动作/路径；待定/否不落盘
- [ ] Bind：不重问产品线；无仓变更跳过 S9–S11；窄表白话纪律
- [ ] 旧 `repo_path` 迁移旁路保留
- [ ] S10b 空匹配只 ⚠️ 不门控
- [ ] 写出 `.state/repos.links.yaml`；workspace folders = 1 + 成功 bind/clone
- [ ] init/Bind **不写** session-context
- [ ] 旧 `repo_path` 迁移顺序：剥离 links → 窄表 → 删共享字段 → 再严格校验
- [ ] init 幂等执行（连续两次结果一致）
- [ ] manifest 校验拒绝非法清单（含禁止入库 `repo_path`）
- [ ] 缺失仓自动 clone 到 workbench 同级目录（浅克隆 --depth 1）
- [ ] 已存在 git 仓跳过 clone（不重复拉取）
- [ ] clone 失败不阻断 init（记录失败继续）
- [ ] **禁止 symlink/junction**；不创建 `repos/` symlink/junction
- [ ] 不创建 `<AGENT_DIR>/`
- [ ] 工具类型检测完成，后续步骤按工具适配
- [ ] 子 agent 分析含 `=== <项目名> ===` 标题标识
- [ ] 结果完整性验证通过（E == R）；缺失项目已自动重试（上限 3 次）
- [ ] 跨项目拓扑关系含构建依赖 + 运行时 HTTP 调用关系
- [ ] repos.manifest.yaml 尾部含项目上下文内容（按工具类型适配；尾注无本机路径）
- [ ] CodeGraph CLI 不可用时安装 `@colbymchenry/codegraph`（无版本号；禁错误包名）
- [ ] CodeGraph：可靠入口（Windows `cmd /c`；禁裸 Start-Process codegraph）+ 1s×≤10s 冒烟 `.codegraph/`；五态报告；禁「已触发」冒充成功；失败不回滚 links/workspace
- [ ] CodeGraph MCP 按工具类型注册（幂等，已存在跳过）
- [ ] AGENTS CodeGraph 指引为中性用法；无本机就绪断言；已有段不改
- [ ] 新 clone 项目异步 fetch --unshallow（fire-and-forget）
- [ ] 忽略 `codegraph_auto_index`（历史键名，已废弃；只认 `codegraph_init`）

## Red flags

- 仅因含 `repo_path` 校验失败却硬停（应先迁移再严格校验）
- manifest 其它校验失败仍创建文件（违反原子性）
- Bootstrap 拆回「S2d + 单独窄表」两轮确认或单独产品线 Y/N HARD-GATE
- S10b 空匹配再次门控用户确认
- 删除旧 `repo_path` 迁移旁路
- 以入库 `repo_path` 为权威路径源（应以 links + `resolve(name)`）
- init 写入 `.state/session-context.yaml`
- workspace 仍用「folders = manifest 仓数 + 1」旧公式
- AGENTS.md 硬编码仓名列表或本机 CodeGraph 就绪断言
- AGENTS.md 含 skills/ 或 AGENT_DIR 路径
- repos.manifest.yaml 项目上下文注释覆盖 manifest 条目（注释不可混入 YAML 数据段）
- S11 项目上下文内容生成独立文件（CODEBUDDY.md / CLAUDE.md / AGENTS.md）— 应统一追加到 manifest 尾部
- CodeGraph 未安装时静默跳过（必须执行安装或记录失败）
- Windows 用 `Start-Process -FilePath "codegraph"` 或未冒烟却报「已触发」
- 安装错误的 codegraph 全局包名（非 `@colbymchenry/codegraph`）；或给该包钉死版本号
- 消费或写入历史键名 `codegraph_auto_index`（应改用 `codegraph_init`）
- clone 全部失败硬停（应 warn 继续）
- MCP 注册不读即写（覆盖已有配置）
- 子 agent 分析 3 次重试后跳过不标注 ⚠️
- S13 报告输出后继续执行分析/修改/Agent 调用 → 严重流程违规
- **CodeBuddy 专项**：严禁使用 SendMessage/broadcast 或等待 Team 机制收集结果
- 混仓 commit（workbench 仓提交业务代码）
- 技术栈扫描失败导致 init 中断（应容错继续）
- 用 symlink/junction 挂仓
