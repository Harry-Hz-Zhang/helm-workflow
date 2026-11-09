# 数据库设计与实体骨架规范

> 本文件是**唯一真源**。`helm-workflow-apply`、`helm-workflow-implement-task`、`helm-workflow-review-implementation`、`helm-workflow-verify`、`helm-workflow-propose`、`helm-workflow-design-review` 只写指针与本阶段门禁，不复制本文正文。
> 路径基准：本文件内的仓库内路径均为**仓库根相对路径**（见 `references/skill-loading-contract.md` 第 0 节）；`docs/db` 指目标业务仓的根目录下的 `docs/db`（可用画像键 `db_doc_root` 覆盖）。
> 门禁编号：`T` 组管设计文档，`B` 组管通用字段，`Q` 组管建表语句，`E` 组管实体与分层，`X` 组是收口自检总表。skill 里引用编号即引用本文件条款。

## 0. 五条铁律

1. **顺序不可颠倒**：建表需求 → 数据库设计文档 → 人工检查确认 → 建表语句 → 实体骨架。禁止先写 DDL、禁止先写 DO、禁止用"代码即文档"跳过文档。
2. **文档必须落盘**：无论需求来自开发人员给字段、AI 自行设计还是外部系统导出，表设计文档 MUST 保存到 `docs/db/<领域>/<业务>.md`。设计只存在于对话里视为未完成。
3. **通用字段不进文档**：七件通用字段由 Java 抽象 DO 承载，字段表里不出现；但建表语句里必须逐表写全。
4. **不建显式外键**：除需求方显式要求，建表语句 MUST NOT 出现 `FOREIGN KEY` 约束；关联关系只写在文档的「关联的表」列与应用层代码里。
5. **字符集表级统一**：表级 MUST 写 `DEFAULT CHARSET=utf8mb4`，不逐列指定字符集。

## 1. 五步流水线

| 步骤 | 产出 | 归属 | 门禁 |
| --- | --- | --- | --- |
| 1 建表需求 | 业务字段清单（字段含义、是否必填、是否枚举、是否关联其它表） | 需求方 | 缺「是否必填」时不得进入第 2 步 |
| 2 数据库设计文档 | `docs/db/<领域>/<业务>.md` | implementer | T 组 |
| 3 人工检查确认 | 用户确认字段命名与语义 | 用户 | 需求方只给字段时 MUST 停在此步等确认 |
| 4 建表语句 | flyway 迁移脚本 | implementer | Q 组 |
| 5 实体骨架 | DO / BO / 枚举 / Mapper / Repo / Application / Service | implementer | E 组 |

两种入口的差异只在第 3 步：

- **开发人员给字段**：AI 产出文档后**停下来**，把文件路径交给用户检查调整；用户明确确认后才出 DDL。擅自跳过确认直接建表属于流程违规。
- **AI 全程完成**：文档与 DDL 在同一次 change 内交付，但文档仍必须先落盘，再据文档生成 DDL。先写 DDL 再反填文档同样属于流程违规。

不允许出现"本次先建表，文档下次补"。文档与 DDL 属于同一个 task 的可交付范围。

## 2. 目录与文件

```text
docs/
└── db/
    ├── order/                    # DDD 领域，一个领域一个目录
    │   ├── order.md              # 一个业务一个文件
    │   └── order_item.md
    └── pay/
        └── payment.md
```

规则：

- 目录名、文件名一律小写下划线，与 DDD 领域名和业务名对应。
- 同一个业务内的多张表写在同一个文件里，每张表一个 `##` 级标题。
- 同一个领域内的多个业务各占一个文件，不合并成大文件。
- 领域目录不建 `README.md` 之类的导航文件，避免与表文档混淆。

## 3. 文档结构

每个文件固定结构如下，逐字照抄骨架、替换内容：

```markdown
# <领域名> 领域数据模型

## <业务名>

表名: `xxxx_xxxx`

| 字段 | 字段含义 | mysql中的数据类型 | 是否为非空 | 枚举值 | 关联的表 | 默认值 |
| --- | --- | --- | --- | --- | --- | --- |
| order_no | 订单对外编号，全局唯一 | varchar(32) | Y | | | |
| status | 订单状态，进入终态后不再变更 | varchar(32) | Y | | | WAIT_PAY |
| user_id | 下单用户标识 | bigint | Y | | user | |

### 索引

- `UNIQUE KEY uk_order_no (order_no)`，保证对外编号唯一
- `KEY idx_user_status (user_id, status)`，供用户维度按状态列表查询

### 变更记录

| 日期 | 变更 | 说明 |
| --- | --- | --- |
| 2026-01-01 | 新建 | 首版 |
```

枚举列的写法：

| 字段 | 字段含义 | mysql中的数据类型 | 是否为非空 | 枚举值 | 关联的表 | 默认值 |
| --- | --- | --- | --- | --- | --- | --- |
| gender | 用户性别 | varchar(32) | Y | MAN 男,<br>GIRL 女,<br>OTHER_GENDER 其他性别 | | UNKNOWN |

多行枚举在 md 表格里用 `<br>` 换行，或用列表在表格下方逐行补写，两种都可以，但**不得**压缩成一行用 `/` 分隔。

## 4. 字段表逐列规则（T 组）

| # | 规则 | 判定口径 |
| --- | --- | --- |
| T1 | 只用七列，顺序固定 | 列名为 `字段` / `字段含义` / `mysql中的数据类型` / `是否为非空` / `枚举值` / `关联的表` / `默认值`，一表一表格；出现第三列表格、散文描述、或用「见代码」代替 → FAIL |
| T2 | 字段列是库内真实列名 | snake_case，与 DDL 逐字一致；出现 `created_by` 等通用字段行 → FAIL（见 B1）；出现「沿用 BaseModel」占位 → FAIL |
| T3 | 字段含义写业务语义 | 不得与列名同义反复（`status` 写「状态」）；允许为空时 MUST 写明空值语义（未开始 / 未知 / 不适用） |
| T4 | 数据类型带长度或精度 | `varchar(64)`、`decimal(12,2)`、`datetime(3)`、`tinyint(1)`；`int` / `bigint` 可省略长度；写 `string` / `int(字符串)` / `日期` → FAIL |
| T5 | 是否为非空只写 `Y` 或留空 | 非空写 `Y`；允许为空留空。写 `N` / `否` / `是` → FAIL（留空即"可空"，不需要第二个值） |
| T6 | 枚举值逐行 `CODE 含义` | 每条形如 `MAN 男`，行尾逗号，CODE 全大写字母、数字与下划线组成（正则 `^[A-Z][A-Z0-9_]*$`）；用中文当 CODE、用数字当 CODE、只写「状态枚举」→ FAIL |
| T7 | 枚举必须穷举 | 该列所有合法取值都列出，不允许 `...` 或「等」；新增取值须同步文档与 `COMMENT` |
| T8 | 关联的表写被关联表名 | 写 `user` 或 `user.id`；只写「用户表」「关联订单」这种自然语言 → FAIL；仅作逻辑关联说明，不要求建外键 |
| T9 | 默认值写 DDL 原文 | `0`、`NULL`、`CURRENT_TIMESTAMP(3)`、`WAIT_PAY`；无默认留空（不是写 `无`）；写入方必填的列写 `-（写入方必填）` |
| T10 | 索引单独成节 | 每行一个 `UNIQUE KEY` 或 `KEY`，写全索引名与列顺序，并附一句用途；索引不得混进字段表 |
| T11 | 文档与 DDL 逐字一致 | 字段名、类型、非空、默认值、注释、索引五项任一不一致 → FAIL（以文档为准改 DDL，或走 Reverse Sync 改文档） |

## 5. 通用字段（B 组）

七件通用字段，任何业务表都有（外部依赖引入的表除外）：

| # | 字段 | 含义 | 类型 | 约束 |
| --- | --- | --- | --- | --- |
| 1 | `id` | 数据库自增主键 | `bigint unsigned` | `NOT NULL AUTO_INCREMENT` |
| 2 | `created_by` | 创建人用户 id | `bigint` | `NOT NULL DEFAULT 0` |
| 3 | `updated_by` | 更新人用户 id | `bigint` | `NOT NULL DEFAULT 0` |
| 4 | `created_at` | 创建时间 | `datetime(3)` | `NOT NULL DEFAULT CURRENT_TIMESTAMP(3)` |
| 5 | `updated_at` | 更新时间 | `datetime(3)` | `NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)` |
| 6 | `version` | 乐观锁版本号 | `int` | `NOT NULL DEFAULT 0` |
| 7 | `deleted` | 是否删除，软删标记 | `tinyint(1)` | `NOT NULL DEFAULT 0` |

规则：

| # | 规则 | 判定口径 |
| --- | --- | --- |
| B1 | 通用字段不进设计文档 | 字段表出现上述七行任一 → FAIL。通用字段的唯一说明位置是本文件的第 5 节与 `BaseModel` 源码，文档里不重复、不占位 |
| B2 | 通用字段必须进建表语句 | 每张新建表的 DDL 都显式写出七列；七列之间 MUST 按上表 1–7 的先后顺序连续排列，并且整体位于业务字段之后。缺任一列、七列内部顺序错乱、或把 `id` 夹在业务字段中间 → FAIL |
| B3 | 抽象 DO 承载 | Java 工程用一个抽象类封装（示例名 `BaseModel`），业务 DO MUST 继承，不得逐表重复声明七个字段 |
| B4 | 写入语义由框架自动填充 | 创建人 / 更新人 / 创建时间 / 更新时间由自动填充处理器赋值；`version` 由乐观锁插件维护；业务代码 MUST NOT 手写这四个字段的赋值 |
| B5 | 软删语义统一 | 所有查询默认过滤 `deleted = 0`（MyBatis-Plus 逻辑删除）；物理删除只在数据治理脚本中出现，且必须在文档「变更记录」写明 |

抽象 DO 骨架（字段与注解是规范，类名与包名按工程现状调整）：

```java
public abstract class BaseModel {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField(fill = FieldFill.INSERT)
    private Long createdBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @Version
    private Integer version;

    @TableLogic
    private Integer deleted;
}
```

## 6. 建表语句（Q 组）

### 6.1 文件与命名

- 位置：`src/main/resources/db/migration/`（工程已用其它目录时跟随现状，并在文档「变更记录」注明）。
- 文件名：`V<yyyyMMddHHmm>__<snake_case_描述>.sql`，双下划线分隔版本与描述，版本号单调递增，不修改已执行的历史脚本。
- 一次 change 涉及多表时，同一次迁移内按依赖顺序书写，先建被引用的表。

### 6.2 语句规则

| # | 规则 | 判定口径 |
| --- | --- | --- |
| Q1 | 表级字符集 | `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`（排序规则跟随库默认，可显式写 `COLLATE`）；逐列写 `CHARACTER SET` → FAIL |
| Q2 | 不建外键 | 出现 `FOREIGN KEY` / `CONSTRAINT ... REFERENCES` → FAIL（需求方显式要求时须在文档「变更记录」写明来源与理由） |
| Q3 | 表与列都有注释 | 每个列定义 MUST 带 `COMMENT '中文含义'`，表尾 MUST 带 `COMMENT='业务含义'`；缺任一 → FAIL |
| Q4 | 注释关键字写法 | SQL 关键字是 `COMMENT`。需求口述里的「COMMIT」指的就是列注释，落盘时 MUST 写成 `COMMENT`，不得照抄 `COMMIT` |
| Q5 | 通用字段写全 | 见 B2，七列顺序固定出现在业务字段之后 |
| Q6 | 枚举列用字符串存 CODE | 默认 `varchar(32)`，不在 MySQL 层用 `ENUM` 类型；取值约束由应用层枚举类保证，新增取值不需要改表结构 |
| Q7 | 索引命名 | 唯一索引 `uk_<列或语义>`，普通索引 `idx_<列或语义>`；软删表的唯一索引 MUST 把 `deleted` 纳入或在文档说明由应用层保证唯一 |
| Q8 | 金额与比例 | 金额用 `decimal(18,2)`（按业务精度调整并在文档写明），MUST NOT 用 `float` / `double` |
| Q9 | 空值与默认值一致 | DDL 的可空性与默认值 MUST 与文档字段表逐格一致，包括 `NULL` 与 `''` 的区别 |
| Q10 | 可重复执行 | 迁移脚本只前滚；修正已上线的表通过新增脚本完成，不 `DROP` 后重建（除非需求方明确要求并记录） |

示例（节选，注意通用字段与注释）：

```sql
CREATE TABLE `t_order` (
  `order_no`    varchar(32)  NOT NULL                COMMENT '订单对外编号，全局唯一',
  `user_id`     bigint       NOT NULL                COMMENT '下单用户标识',
  `status`      varchar(32)  NOT NULL DEFAULT 'WAIT_PAY' COMMENT '订单状态，进入终态后不再变更',
  `id`          bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `created_by`  bigint       NOT NULL DEFAULT 0       COMMENT '创建人用户 id',
  `updated_by`  bigint       NOT NULL DEFAULT 0       COMMENT '更新人用户 id',
  `created_at`  datetime(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at`  datetime(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  `version`     int          NOT NULL DEFAULT 0       COMMENT '乐观锁版本号',
  `deleted`     tinyint(1)   NOT NULL DEFAULT 0       COMMENT '是否删除：0 否，1 是',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`, `deleted`),
  KEY `idx_user_status` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单主表';
```

## 7. 实体与分层（E 组）

### 7.1 模型职责

| 模型 | 职责 | 规则 |
| --- | --- | --- |
| DO | 一张表一个，只做持久化映射 | `XxxDO extends BaseModel`；字段与列一一对应；不写业务判断 |
| 枚举类 | 承接文档里「枚举值」列的 CODE | `XxxStatusEnum`，含 CODE、中文含义、`of(String)` 解析；代码里 MUST NOT 出现枚举字面量 |
| BO | DDD 聚合，承接领域行为 | `XxxBO`；DO 里的关联 id 与枚举在 BO 里转成枚举与对象；Controller 只返回 VO，不直接暴露 DO |
| DTO / VO | 入参与出参 | 与 BO 分离，字段命名面向接口语义 |

### 7.2 分层骨架

| 层 | 职责 | 说明 |
| --- | --- | --- |
| Mapper | 单表 CRUD | MyBatis-Plus `BaseMapper<XxxDO>` 已提供，MUST NOT 手写等价单表 SQL；复杂查询写 XML 或注解 SQL |
| Repo | DO 与 BO 转换、组合查询 | 接口 `XxxRepo` + 实现 `XxxRepoImpl`；事务之外可复用的查询放这里 |
| Service | 领域服务 | 领域规则、状态流转、跨表不变量 |
| Application | 用例编排 | 事务边界、调用 Service 与 Repo、组装 VO |
| Controller | HTTP 契约 | 参数校验、DTO 转 BO、返回 VO；不含业务分支 |

包名按工程现状放置，默认形如 `infrastructure/persistence/mapper`、`domain/repository`、`domain/service`、`application`、`interfaces/rest`。

### 7.3 新建表的强制交付面

新建一张表时，同一个 task 内 MUST 一次性搭好下列内容，不得留 `TODO` 或"后续补"：

| # | 规则 | 判定口径 |
| --- | --- | --- |
| E1 | DO 与 BO 同时存在 | 只有 DO 没有 BO（或反之）→ FAIL；纯查询表可省 BO，但须在 design 写明理由 |
| E2 | 枚举类齐全 | 文档枚举列每个取值都在枚举类里，`of()` 对未知值显式抛业务异常 |
| E3 | 四层骨架齐全 | Mapper / Repo / Service / Application 各有对应类型，方法签名覆盖基础 CRUD（新增、按 id 查、按 id 更新、分页或列表） |
| E4 | 命名一致 | 类型名 = 表名去掉前缀并转驼峰，加层后缀；不允许 `XxxManager` / `XxxHelper` 代替分层 |
| E5 | 不返回 DO | Controller / Application 对外方法签名不出现 DO；出现 → FAIL |

## 8. 收口自检（X 组）

apply 收口、verify、code-review 都按此表逐条判定。任一 `FAIL` 时不得勾选 task、不得 commit、不得判 verify 通过。

| # | 检查 | 判定命令或方式 | 失败后果 |
| --- | --- | --- | --- |
| X1 | 设计文档存在且在 `docs/db/<领域>/<业务>.md` | 列目录 + 读文件 | 阻断 |
| X2 | 字段表合规（T1–T9） | 逐格比对 | 阻断 |
| X3 | 索引单独成节（T10） | 读文档 | 阻断 |
| X4 | 文档无通用字段行（B1） | grep `created_by\|updated_by\|created_at\|updated_at\|version\|deleted` 命中字段表 | 阻断 |
| X5 | DDL 有通用字段（B2）与注释（Q3） | grep `COMMENT` 数 ≥ 列数 + 1 | 阻断 |
| X6 | DDL 无外键（Q2）、表级 utf8mb4（Q1） | grep `FOREIGN KEY` 无命中；grep `CHARSET=utf8mb4` 命中 | 阻断 |
| X7 | 文档与 DDL 一致（T11） | 字段名集合、类型、可空、默认值四项比对 | 阻断 |
| X8 | 实体骨架齐全（E1–E5） | 检索类型与方法 | 阻断 |
| X9 | 迁移脚本命名合规（6.1） | 文件名正则 `^V\d{12}__[a-z0-9_]+\.sql$` | 阻断 |

## 9. 反例

| 反例 | 问题 | 正确做法 |
| --- | --- | --- |
| 先写 `CREATE TABLE`，再补一份 md | 违反铁律 1，文档退化成 DDL 的抄写 | 先出文档，确认后由文档生成 DDL |
| 字段表里列了 `id` `created_at` `deleted` | 违反 B1，文档会被逐表复制，改动七处 | 删掉这七行，通用字段只在 DDL 与 `BaseModel` 出现 |
| 枚举列写「状态：0 待支付 / 1 已支付」 | 违反 T6，数字 CODE 无法自解释 | 改成 `WAIT_PAY 待支付,` `PAID 已支付`，用 `varchar(32)` 存 CODE |
| 「是否为非空」列写 `是` / `否` | 违反 T5，两个值等于制造歧义 | 非空写 `Y`，可空留空 |
| 建表时加 `FOREIGN KEY (user_id) REFERENCES user(id)` | 违反 Q2，分库与批量导入时会锁表 | 去掉外键，在文档「关联的表」列说明关系 |
| 只给 `status` 注释，其他列没注释 | 违反 Q3，后续接手者只能猜字段含义 | 每列都写 `COMMENT` |
| 只生成了 DO 与 Mapper | 违反 E3，业务代码会在 Service 里直接操作 DO | 补齐 Repo / Service / Application / 枚举 / BO |
