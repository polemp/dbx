# DBX 数据库结构对比功能增强设计文档

## 一、项目概述

### 1.1 目标
增强 DBX 的"比较数据库"（Schema Diff）功能，实现：
1. **可配置的比较选项**：每个数据库类型拥有专属的比较选项配置
2. **PostgreSQL 完整支持**：支持表、视图、函数、索引、序列、触发器、规则、所有者等对象类型
3. **配置管理**：保存多个对比配置到 localStorage，支持下拉选择、导出、导入
4. **配置内容**：包含源/目标连接、数据库、schema 以及所有比较选项
5. **分阶段实施**：先做阶段一（选项 UI + 已有功能开关），再做阶段二（新增对象类型对比）

### 1.2 当前状态
- 当前 Schema Diff 支持：表(table)、视图(view)、列(columns)、索引(indexes)、外键(foreign_keys)、触发器(triggers)
- 缺少：函数、序列、规则、所有者、约束细分（主键/唯一键/检查/排除）
- 没有选项配置 UI
- 没有配置保存/导入导出功能

### 1.3 参考 UI
参考 Navicat 的结构同步界面：
- 左侧：源服务器选择（连接/数据库/schema）
- 右侧：目标服务器选择
- 下方：比较选项树形复选框 + 保存/加载配置按钮
- 底部：保存配置、加载配置、选项、比较按钮

---

## 二、数据结构设计

### 2.1 比较选项类型

```typescript
// apps/desktop/src/types/schemaDiff.ts
export interface SchemaDiffCompareOptions {
  tables: boolean;
  primaryKeys: boolean;
  foreignKeys: boolean;
  uniqueKeys: boolean;
  checks: boolean;
  exclusions: boolean;
  views: boolean;
  functions: boolean;
  indexes: boolean;
  sequences: boolean;
  triggers: boolean;
  rules: boolean;
  owners: boolean;
  cascadeDelete: boolean;
  sequenceLastValues: boolean;
}
```

### 2.2 配置类型

```typescript
export interface SchemaDiffConfig {
  id: string;                    // 唯一标识
  name: string;                  // 配置名称（可重命名）
  createdAt: number;             // 创建时间
  updatedAt: number;             // 最后修改时间
  sourceConnectionId: string;    // 源连接ID
  sourceDatabase: string;        // 源数据库
  sourceSchema: string;          // 源schema
  targetConnectionId: string;    // 目标连接ID
  targetDatabase: string;        // 目标数据库
  targetSchema: string;          // 目标schema
  options: SchemaDiffCompareOptions;  // 比较选项
}
```

### 2.3 选项树节点类型

```typescript
export interface SchemaDiffOptionItem {
  id: keyof SchemaDiffCompareOptions;
  labelKey: string;              // i18n key
  defaultChecked: boolean;
  children?: SchemaDiffOptionItem[];
}
```

### 2.4 PostgreSQL 默认选项

```typescript
export const DEFAULT_POSTGRES_OPTIONS: SchemaDiffCompareOptions = {
  tables: true,
  primaryKeys: true,
  foreignKeys: true,
  uniqueKeys: true,
  checks: true,
  exclusions: true,
  views: true,
  functions: true,
  indexes: true,
  sequences: true,
  triggers: true,
  rules: true,
  owners: true,
  cascadeDelete: false,
  sequenceLastValues: true,
};
```

### 2.5 可扩展的数据库类型配置

```typescript
export const SCHEMA_DIFF_OPTIONS_BY_DB_TYPE: Record<string, SchemaDiffOptionItem[]> = {
  postgres: POSTGRES_SCHEMA_DIFF_OPTIONS,
  opengauss: POSTGRES_SCHEMA_DIFF_OPTIONS,  // 兼容PG
  // mysql: MYSQL_SCHEMA_DIFF_OPTIONS,       // 后续扩展
  // sqlserver: SQLSERVER_SCHEMA_DIFF_OPTIONS,
};
```

---

## 三、配置管理方案

### 3.1 存储位置
- **localStorage key**: `dbx-schema-diff-configs`
- **格式**: `SchemaDiffConfig[]` 的 JSON 字符串

### 3.2 操作功能
1. **创建配置**：生成新ID，默认名称为"New Config"或用户指定
2. **重命名配置**：修改 `name` 字段
3. **复制配置**：基于现有配置创建副本
4. **删除配置**：从列表中移除（保留至少一个默认配置）
5. **导出配置**：下载单个配置或全部配置为 JSON 文件
6. **导入配置**：从文件或文本导入，支持自动重命名避免冲突
7. **自动保存**：选项变更后自动保存到 localStorage

### 3.3 命名冲突处理
导入时如果名称已存在，自动重命名为 `"Name (1)"`、`"Name (2)"`...

---

## 四、UI 组件设计

### 4.1 组件拆分

#### 4.1.1 `SchemaDiffConfigSelector.vue`
**职责**：配置选择器，包含下拉菜单和操作按钮
**位置**：SchemaDiffDialog 顶部
**包含元素**：
- 配置下拉选择框
- 新建配置按钮 (+)
- 重命名按钮
- 复制按钮
- 删除按钮
- 导出当前配置按钮
- 导入配置按钮
- 导出全部配置按钮

#### 4.1.2 `SchemaDiffOptionsPanel.vue`
**职责**：递归渲染选项树
**位置**：SchemaDiffDialog 底部"选项"区域
**包含元素**：
- 树形复选框列表
- 支持父子联动：
  - 父项选中 → 所有子项选中
  - 父项取消 → 所有子项取消
  - 部分子项选中 → 父项显示"半选"状态（indeterminate）
- 根据数据库类型动态渲染不同的选项树

#### 4.1.3 改造 `SchemaDiffDialog.vue`
**职责**：集成配置管理和选项面板
**布局调整**：
```
┌─────────────────────────────────────────────────┐
│ [Title: 比较数据库]                              │
├─────────────────────────────────────────────────┤
│ [ConfigSelector: 配置1 ▼] [+] [重名] [复制] [删]│
├─────────────────────────────────────────────────┤
│  源                          目标                │
│  [连接 ▼]      [↔]          [连接 ▼]           │
│  [数据库 ▼]                  [数据库 ▼]          │
│  [Schema ▼]                  [Schema ▼]          │
├─────────────────────────────────────────────────┤
│  ▼ 比较选项                                      │
│  [x] 比较表                                      │
│    [x] 比较主键                                  │
│    [x] 比较外键                                  │
│    ...                                          │
│  [x] 比较视图                                    │
│  [x] 比较函数                                    │
│  ...                                            │
├─────────────────────────────────────────────────┤
│         [取消]              [开始比较]           │
└─────────────────────────────────────────────────┘
```

### 4.2 样式参考
- 选项面板使用深色/浅色自适应背景
- 树形缩进使用 `ml-6`
- 复选框使用自定义 SVG 实现（项目中无 checkbox 组件）
- 选项区域默认折叠，点击展开

---

## 五、状态管理

### 5.1 Composable: `useSchemaDiffConfig.ts`

提供以下 API：

```typescript
function useSchemaDiffConfig() {
  configs: ComputedRef<SchemaDiffConfig[]>;
  activeConfigId: Ref<string>;
  activeConfig: ComputedRef<SchemaDiffConfig | null>;
  ensureDefaultConfig: (dbType?: string) => void;
  createConfig: (name: string, base?: SchemaDiffConfig) => SchemaDiffConfig;
  renameConfig: (id: string, name: string) => void;
  deleteConfig: (id: string) => void;
  duplicateConfig: (id: string) => void;
  exportConfigs: () => string;
  exportActiveConfig: () => string;
  importConfigs: (jsonText: string) => { imported: number; renamed: number };
  updateActiveConfigOptions: (options: SchemaDiffCompareOptions) => void;
  updateActiveConfigConnection: (
    side: "source" | "target",
    updates: Partial<SchemaDiffConfig>
  ) => void;
}
```

### 5.2 配置同步策略
- 当用户切换连接/数据库/schema 时，自动更新当前活跃配置
- 当用户修改选项时，立即保存到 localStorage
- 对话框打开时，加载上次活跃的配置
- 如果没有任何配置，自动创建一个默认配置

---

## 六、国际化

### 6.1 需要新增的 i18n key

```typescript
schemaDiff: {
  // 配置管理
  selectConfig: "选择配置",
  newConfigName: "New Config",
  newConfig: "新建配置",
  renameConfig: "重命名配置",
  duplicateConfig: "复制配置",
  deleteConfig: "删除配置",
  exportConfig: "导出配置",
  exportAllConfigs: "导出全部配置",
  importConfig: "导入配置",
  importFromFile: "从文件导入",
  importFromText: "从文本导入",
  importPlaceholder: "粘贴 JSON 配置...",
  importInvalidJson: "无效的 JSON 格式",
  configName: "配置名称",

  // 比较选项
  options: {
    tables: "比较表",
    primaryKeys: "比较主键",
    foreignKeys: "比较外键",
    uniqueKeys: "比较唯一键",
    checks: "比较检查约束",
    exclusions: "比较排除约束",
    views: "比较视图",
    functions: "比较函数",
    indexes: "比较索引",
    sequences: "比较序列",
    triggers: "比较触发器",
    rules: "比较规则",
    owners: "比较所有者",
    cascadeDelete: "用级联删除",
    sequenceLastValues: "比较序列最后值",
  },
}
```

---

## 七、后端扩展（阶段二）

### 7.1 新增类型定义（Rust）

```rust
// crates/dbx-core/src/schema_diff.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionDiff {
    #[serde(rename = "type")]
    pub diff_type: String,
    pub name: String,
    pub source: Option<FunctionInfo>,
    pub target: Option<FunctionInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SequenceDiff { ... }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleDiff { ... }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnerDiff { ... }
```

### 7.2 扩展 SchemaDiffPreparationOptions

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaDiffPreparationOptions {
    pub source_tables: Vec<TableInfo>,
    pub target_tables: Vec<TableInfo>,
    pub source_details: Vec<TableSchemaDetail>,
    pub target_details: Vec<TableSchemaDetail>,
    // 新增
    pub source_functions: Vec<FunctionInfo>,
    pub target_functions: Vec<FunctionInfo>,
    pub source_sequences: Vec<SequenceInfo>,
    pub target_sequences: Vec<SequenceInfo>,
    pub source_rules: Vec<RuleInfo>,
    pub target_rules: Vec<RuleInfo>,
    pub source_owners: HashMap<String, String>,
    pub target_owners: HashMap<String, String>,
    pub compare_options: HashMap<String, bool>,
    pub database_type: DatabaseType,
    pub target_schema: Option<String>,
    pub ignore_comments: bool,
}
```

### 7.3 PostgreSQL 元数据查询

#### 函数/存储过程
```sql
SELECT 
  routine_schema,
  routine_name,
  routine_type,
  data_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = $1
  AND routine_type IN ('FUNCTION', 'PROCEDURE');
```

#### 序列
```sql
SELECT 
  sequencename,
  data_type,
  start_value,
  minimum_value,
  maximum_value,
  increment,
  cycle_option,
  last_value
FROM pg_sequences
WHERE schemaname = $1;
```

#### 规则
```sql
SELECT 
  schemaname,
  tablename,
  rulename,
  definition
FROM pg_rules
WHERE schemaname = $1;
```

#### 所有者
```sql
SELECT 
  n.nspname as schema_name,
  c.relname as object_name,
  c.relkind as object_type,
  pg_get_userbyid(c.relowner) as owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = $1;
```

### 7.4 新增 Diff 函数

```rust
fn diff_functions(source: &[FunctionInfo], target: &[FunctionInfo]) -> Vec<FunctionDiff>
fn diff_sequences(source: &[SequenceInfo], target: &[SequenceInfo]) -> Vec<SequenceDiff>
fn diff_rules(source: &[RuleInfo], target: &[RuleInfo]) -> Vec<RuleDiff>
fn diff_owners(
    source: &HashMap<String, String>,
    target: &HashMap<String, String>
) -> Vec<OwnerDiff>
```

### 7.5 SQL 生成规则

#### 函数
```sql
-- Added
CREATE OR REPLACE FUNCTION name(...) ...;

-- Removed
DROP FUNCTION IF EXISTS schema.name(...);

-- Modified
CREATE OR REPLACE FUNCTION name(...) ...;  -- 直接用新定义覆盖
```

#### 序列
```sql
-- Added
CREATE SEQUENCE schema.name ...;

-- Removed
DROP SEQUENCE schema.name;  -- 或加 CASCADE 如果选项开启

-- Modified
ALTER SEQUENCE schema.name ...;
```

#### 规则
```sql
-- Added
CREATE RULE name AS ...;

-- Removed
DROP RULE IF EXISTS name ON schema.table;
```

#### 所有者
```sql
ALTER TABLE schema.table OWNER TO new_owner;
ALTER FUNCTION schema.func OWNER TO new_owner;
ALTER SEQUENCE schema.seq OWNER TO new_owner;
```

#### 级联删除
当 `cascadeDelete = true` 时，所有 `DROP` 语句都附加 `CASCADE`：
```sql
DROP FUNCTION IF EXISTS schema.name CASCADE;
DROP SEQUENCE schema.name CASCADE;
```

---

## 八、阶段划分

### 阶段一：配置管理和选项 UI（1-2 天）
**目标**：完成可配置选项 UI，把已有功能（表/视图/索引/外键/触发器）加上选项开关

**任务清单**：
- [x] 创建 `types/schemaDiff.ts` 类型定义
- [x] 创建 `lib/schemaDiffOptions.ts` 数据库选项配置
- [x] 创建 `composables/useSchemaDiffConfig.ts` 配置管理
- [x] 创建 `components/diff/SchemaDiffOptionsPanel.vue` 选项树面板
- [x] 创建 `components/diff/SchemaDiffConfigSelector.vue` 配置选择器
- [ ] 改造 `SchemaDiffDialog.vue` 集成配置管理和选项面板
- [ ] 根据 `compare_options` 控制已有 diff 逻辑：
  - `tables: false` → 不比较表
  - `views: false` → 不比较视图
  - `indexes: false` → 不比较索引
  - `foreignKeys: false` → 不比较外键
  - `triggers: false` → 不比较触发器
- [ ] 约束细分展示（前端展示层面，先不改后端）
- [ ] 新增 i18n 文案
- [ ] TypeScript 类型检查通过

**交付标准**：
- 选项 UI 正常显示和交互
- 配置保存/导出/导入功能正常
- 已有功能可通过选项开关控制

### 阶段二：新增对象类型对比（3-5 天）
**目标**：新增函数/序列/规则/所有者的对比

**任务清单**：
- [ ] Rust 后端新增 `FunctionInfo`, `SequenceInfo`, `RuleInfo` 类型
- [ ] 新增 PostgreSQL 元数据查询函数
- [ ] 扩展 API 接口传递新增对象数据
- [ ] 实现 `diff_functions`, `diff_sequences`, `diff_rules`, `diff_owners`
- [ ] 扩展 `SchemaDiffPreparation` 返回结构包含新增 diff
- [ ] 扩展 SQL 生成功能
- [ ] 前端结果展示新增函数/序列/规则/所有者标签页
- [ ] 支持级联删除选项
- [ ] 支持序列最后值比较

**交付标准**：
- PostgreSQL 函数/序列/规则/所有者可以正确对比
- 可以生成同步 SQL
- 所有新增选项可以正确开关控制

### 阶段三：测试优化（1-2 天）
**目标**：修复 bug，完善边界情况

**任务清单**：
- [ ] 测试多配置切换
- [ ] 测试导入导出
- [ ] 测试不同 PostgreSQL 版本的元数据查询
- [ ] 处理大 schema 的性能优化
- [ ] 错误提示和 loading 状态优化

---

## 九、关键技术决策

### 9.1 为什么不用现有 Checkbox 组件？
项目中没有提供 checkbox UI 组件，使用自定义 SVG 实现，保持样式统一。

### 9.2 为什么配置保存到 localStorage？
- 配置属于用户个人偏好，不需要同步到服务器
- localStorage 简单可靠，支持跨会话保存
- 导出/导入功能可以方便地迁移配置

### 9.3 为什么不做函数签名级别对比？
用户确认"函数不会重名"，因此先做存在性对比（added/removed）。如需要函数体级别对比，可以在后续版本增强。

### 9.4 级联删除如何处理？
当用户勾选"用级联删除"时，所有生成的 `DROP` SQL 语句附加 `CASCADE` 关键字。这是 PostgreSQL 的标准做法，可以自动删除依赖对象。

---

## 十、风险与挑战

### 10.1 元数据查询兼容性
不同 PostgreSQL 版本的系统表可能有差异：
- `pg_sequences` 需要 PG 10+
- `pg_get_userbyid` 一直存在
- 解决方案：对老版本做降级处理或明确不支持

### 10.2 函数依赖关系
函数的删除/创建顺序很重要：
- 函数 A 依赖函数 B → 必须先删除 A，再创建 B，最后创建 A
- 当前实现不做拓扑排序，后续可以考虑增强

### 10.3 规则与表的关系
规则依附于表，删除表时会自动删除规则。如果规则 diff 中表已经不同步，需要避免重复生成 SQL。

### 10.4 所有者变更的权限
修改所有者需要当前用户有足够的权限。生成 SQL 后执行时可能失败，需要在前端给出明确错误提示。

---

## 十一、后续扩展

### 11.1 MySQL 支持
MySQL 选项可以包括：
- 比较表
- 比较视图
- 比较索引
- 比较外键
- 比较触发器
- 比较存储过程
- 比较函数
- 比较事件（Event Scheduler）

### 11.2 SQL Server 支持
SQL Server 选项可以包括：
- 比较表
- 比较视图
- 比较索引
- 比较约束
- 比较存储过程
- 比较函数
- 比较触发器
- 比较架构（Schema）

### 11.3 更多对比粒度
- 函数体内容对比（不仅存在性）
- 存储过程内容对比
- 视图定义对比
- 表/列注释对比增强

---

## 十二、已创建文件清单

阶段一已完成文件：
1. `apps/desktop/src/types/schemaDiff.ts` — 类型定义
2. `apps/desktop/src/lib/schemaDiffOptions.ts` — 选项配置
3. `apps/desktop/src/composables/useSchemaDiffConfig.ts` — 配置管理 composable
4. `apps/desktop/src/components/diff/SchemaDiffOptionsPanel.vue` — 选项面板
5. `apps/desktop/src/components/diff/SchemaDiffConfigSelector.vue` — 配置选择器

待完成：
- `apps/desktop/src/components/diff/SchemaDiffDialog.vue` — 集成改造
- i18n 文案补充
- 后端 Rust 扩展（阶段二）

---

**文档版本**: 1.0  
**创建时间**: 2026-06-09  
**作者**: opencode / Claude
