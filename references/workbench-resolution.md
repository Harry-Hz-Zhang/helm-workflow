# 工作台路径解析契约（Workbench Resolution）

> 本文件定义 `resolveRoot()` 与 `resolve(name)` 的唯一实现语义。
> 所有阶段 skill 的 S0 MUST 引用本文件，MUST NOT 自行假设返回值或回退路径。
> 路径基准：本文件内所有仓库内路径均为**仓库根相对路径**（见 `references/skill-loading-contract.md` 第 0 节）。

## 1. 两种运行模式

| mode | 判定条件 | root 含义 |
| --- | --- | --- |
| `workbench` | 当前目录或任一祖先目录存在 `.workbench.yaml` | 该 `.workbench.yaml` 所在目录 |
| `single` | 不存在 `.workbench.yaml`，但当前目录在 git 仓库内 | git 仓库根 |
| 无 | 两者皆无 | 解析失败 |

`single` 模式下，`resolve(name)` MUST 只返回该仓库自身；请求其它仓库名 MUST 失败。

## 2. `resolveRoot()`

### 签名

```
resolveRoot() -> { root: string, mode: "workbench" | "single" } | Failure
```

### 行为

1. 从当前工作目录向上查找 `.workbench.yaml`，最多 10 层。
2. 找到 → 返回 `{ root: <该目录绝对路径>, mode: "workbench" }`。
3. 未找到 → 用 `git rev-parse --show-toplevel` 取仓库根。
4. 取到 → 返回 `{ root: <仓库根>, mode: "single" }`。
5. 取不到 → 失败，错误信息 MUST 包含："未找到工作台清单（.workbench.yaml），也不在 git 仓库内。请先执行 `/helm:init`，或进入目标仓库目录后重试。"

### 禁止

- MUST NOT 用 `process.cwd()` 直接当 root（cwd 可能是子目录）。
- MUST NOT 在失败时回退到"当前目录"。
- MUST NOT 因为缺 `.workbench.yaml` 就报错 —— 单仓项目的正常态是没有该文件（见第 6 章）。

## 3. `resolve(name)`

### 签名

```
resolve(name: string) -> string | Failure
```

### 行为

1. 读取 `<root>/.state/repos.links.yaml`（workbench 模式）或 `<root>/.helm/repos.links.yaml`（single 模式，若存在）。
2. 在 `repos` 列表中按 `name` 精确匹配。
3. 命中 → 返回该条目的 `path`（绝对路径）。
4. 未命中 → 失败，错误信息 MUST 列出 links 中已登记的全部仓库名，并提示："请先在 `.state/repos.links.yaml` 中登记 `<name>` 的本地路径。"
5. `name` 为保留字 `self` → 直接返回 `<root>`，不查 links 文件（见第 6 章）。

### 权威性（重要）

- 路径的**唯一权威**是本机 links 文件（`.state/repos.links.yaml`）。
- MUST NOT 从入库的 `repos.manifest.yaml` 读取 `repo_path` 字段作为路径来源。
- `repos.manifest.yaml` 只描述"有哪些仓、分支策略、依赖关系"，不含本机路径。
- 若 links 中无该仓，即使 manifest 有 `repo_path`，也 MUST 失败（防止把 A 机器的路径带到 B 机器）。
- 例外：`name` 为 `self` 时不走本节的权威链（`self` 不是已登记仓，是当前根的同义词）。

### links 文件格式

```yaml
version: 1
repos:
  - name: order-service
    path: <本机绝对路径>/order-service
    type: business
  - name: order-mock
    path: <本机绝对路径>/order-mock
    type: service
```

## 4. 多仓操作范围（`target_repos`）

涉及写入或 git 操作前，MUST 取得本次 change 声明的 `target_repos` 列表（来源：`.helm-state.yaml`）。

规则：

1. 需要写入的仓库 MUST 在 `target_repos` 中；不在 → 停止，先补声明（并同步 `design.md`）。
2. 提交 MUST 按仓隔离：一次 commit 只含一个仓库的改动。
3. MUST NOT 在 workbench 仓提交业务仓的代码；MUST NOT 在业务仓提交治理资产。
4. 每次 git 操作前 MUST 重新读取 `target_repos`，不得使用会话早期缓存。
5. 规则 1 的"停止"只对 `repo_mode: workbench` 生效；`repo_mode: single` 下 `target_repos` 恒为 `[self]`，永不因未声明而停止（见第 6 章）。

## 5. 不在本契约范围内

- **分支确认**：由 `skills/helm-workflow-git-discipline/SKILL.md` 的 `Branch Confirm Subflow` 定义。本契约**不提供** `checkoutBranches` 之类的函数。
- 分支名与 `target_repos` 的对应关系记录在 `.helm-state.yaml` 的 `branch_name` 与 `target_repos` 两个字段中。
- **`repo_mode` 的取值来源**：由项目画像 `helm-profile.yaml` 定义（23 键与默认值见 `helm-workflow.local.example.yaml` 的 `# profile:` 段）。本契约只消费，不推导。

## 6. single 模式

`repo_mode: single`（显式声明，或 `auto` 下 `<root>/<state_dir>/repos.links.yaml` 不存在）时：

- `resolveRoot()` MUST 返回 `{ root: <仓库根>, mode: 'single' }`，MUST NOT 报错。
- `target_repos` MUST 解析为 `[self]`；`self` 是保留字，MUST NOT 当作目录名去拼接路径。
- MUST NOT 要求存在 `repos.manifest.yaml` 或 `repos.links.yaml`。
- MUST NOT 因 `target_repos` 未显式声明而停止。
- 若 `repo_mode: workbench` 却出现 `target_repos: [self]` → 判配置错误，硬停。

## 7. 证据要求

在 log.md 中 MUST 记录：

```markdown
### Resolution

- mode: workbench
- root: <绝对路径>
- target_repos: [order-service, order-mock]
- resolved: order-service -> <绝对路径>
```

`single` 模式下 `### Resolution` 段 MUST 写成：

```markdown
### Resolution

- mode: single
- root: <绝对路径>
- target_repos: [self]
- resolved: self -> <绝对路径>
```

缺少该段时，apply/verify/archive MUST 判为流程不完整。
