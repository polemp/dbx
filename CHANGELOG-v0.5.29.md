# DBX 项目修改说明文档

## 版本信息
- **基准版本**: `f42dfdbb` (feat: add PL/pgSQL syntax highlighting support for PostgreSQL functions)
- **当前版本**: `7a2ddb3b` (save/custom-theme-current 分支)
- **修改时间**: 2026-06-05
- **修改范围**: PostgreSQL 函数高亮 + 自定义主题系统 + UI 优化

---

## 一、PostgreSQL 函数语法高亮修复

### 1.1 问题描述
**现象**: 
- 应用启动后默认打开的函数页面语法高亮正常
- 手动打开的其他函数页面中，`$function$` 内部代码完全无高亮（全黑）

**根因**: 
CodeMirror 6 的 `@codemirror/lang-sql` 包中，PostgreSQL 方言默认开启 `doubleDollarQuotedStrings: true`，将 `$tag$...$tag$` 识别为字符串字面量，导致函数体内部代码失去语法解析。

**影响文件**:
- `apps/desktop/src/components/editor/QueryEditor.vue`

### 1.2 修改内容

#### QueryEditor.vue 第 1422-1427 行
```typescript
// 修改前
const dialect = SQLDialect.define({
  ...baseDialect.spec,
  keywords: [...],
  types: [...],
  builtin: [...],
});

// 修改后
const dialect = SQLDialect.define({
  ...baseDialect.spec,
  keywords: [...],
  types: [...],
  builtin: [...],
  doubleDollarQuotedStrings: false,  // ← 关键修复：禁用字符串识别
});
```

**效果**: 
- `$function$` 内部代码被识别为 SQL/PL/pgSQL 代码而非字符串
- `declare`, `begin`, `if`, `PERFORM` 等关键字正常高亮
- `integer`, `json`, `text` 等类型正常高亮
- `SQLERRM`, `TG_NAME` 等内置变量正常高亮

### 1.3 技术细节

**CodeMirror 解析器行为**:
```javascript
// @codemirror/lang-sql/dist/index.js 第194-200行
else if (next == 36 /* Ch.Dollar */ && d.doubleDollarQuotedStrings) {
    let tag = readWord(input, "");
    if (input.next == 36 /* Ch.Dollar */) {
        input.advance();
        readDoubleDollarLiteral(input, tag);
        input.acceptToken(String$1);  // 标记为字符串token
    }
}
```

设置 `doubleDollarQuotedStrings: false` 后，解析器不再将 `$tag$...$tag$` 视为字符串分隔符，函数体内容被正常解析为代码。

---

## 二、自定义主题系统

### 2.1 功能概述
新增完整的自定义编辑器主题系统，支持：
- 多主题管理（创建、重命名、复制、删除）
- 可视化颜色编辑器（12 种语法元素颜色）
- JSON 配置导入/导出
- 实时预览
- 主题跟随系统暗色/亮色模式

### 2.2 新增文件

#### ThemeCustomizerDialog.vue (新增, 387 行)
**路径**: `apps/desktop/src/components/editor/ThemeCustomizerDialog.vue`

**功能**:
- 主题列表侧边栏（显示所有自定义主题）
- 主题 CRUD 操作：
  - 创建新主题
  - 重命名主题
  - 复制主题
  - 删除主题（保留至少一个）
- 12 色颜色配置器：
  ① 关键字 ② 字段/变量 ③ 函数 ④ 字符串 ⑤ 数字 ⑥ 注释 ⑦ 表名 ⑧ 运算符 ⑨ 类型 ⑩ 内置变量 ⑪ 背景色 ⑫ 前景色
- Windows 风格调色板（16 色基础色板）
- JSON 编辑标签页（支持导入/导出）
- 实时预览（带圈号映射的 SQL 代码示例）

**界面布局**:
```
+------------------------------------------+
| 主题列表        | 颜色配置              |
| - 默认          | ① 关键字    [颜色块]  |
| - 主题 2        | ② 字段/变量 [颜色块]  |
| - 主题 3        | ...                   |
| + 新建主题      |                       |
+------------------------------------------+
| JSON 编辑器标签                          |
| { "keyword": "#cba6f7", ... }            |
+------------------------------------------+
| [取消]                    [保存]         |
+------------------------------------------+
```

### 2.3 修改文件

#### settingsStore.ts (+92 行)
**路径**: `apps/desktop/src/stores/settingsStore.ts`

**新增接口**:
```typescript
// 自定义主题颜色配置
export interface CustomThemeColors {
  keyword: string;
  field: string;
  function: string;
  string: string;
  number: string;
  comment: string;
  table: string;
  operator: string;
  type: string;
  builtin: string;
  background?: string;   // ← 新增
  foreground?: string;   // ← 新增
}

// 主题对象
export interface CustomTheme {
  id: string;
  name: string;
  colors: CustomThemeColors;
}

// 编辑器设置扩展
export interface EditorSettings {
  // ... 原有字段 ...
  customThemeColors: CustomThemeColors;
  customThemes: CustomTheme[];           // ← 新增：多主题数组
  activeCustomThemeId: string;           // ← 新增：当前激活主题ID
}
```

**新增常量**:
```typescript
export const DEFAULT_CUSTOM_THEME_COLORS: CustomThemeColors = {
  keyword: "#cba6f7",
  field: "#f9e2af",
  function: "#89dceb",
  string: "#a6e3a1",
  number: "#fab387",
  comment: "#6c7086",
  table: "#a6e3a1",
  operator: "#89b4fa",
  type: "#89b4fa",
  builtin: "#f38ba8",
};

export const DEFAULT_CUSTOM_THEMES: CustomTheme[] = [
  { id: "default", name: "默认", colors: { ...DEFAULT_CUSTOM_THEME_COLORS } },
];
```

**新增方法**:
- `normalizeEditorSettings()`: 处理配置迁移（旧版 single color → 新版 multi-theme）
- `updateEditorSettings()`: 同步 `customThemeColors` 和 `customThemes`

#### editorThemes.ts (+172 行)
**路径**: `apps/desktop/src/lib/editorThemes.ts`

**新增功能**:
1. **自定义主题创建**:
```typescript
function createCustomTheme(
  EditorView: typeof import("@codemirror/view").EditorView,
  colors?: CustomThemeColors,
  isDark: boolean = true,
): Extension {
  // 根据系统主题设置默认背景色和前景色
  const defaultColors = isDark
    ? { background: "#1e1e2e", foreground: "#cdd6f4" }
    : { background: "#fafafa", foreground: "#242424" };
  
  const c = { ...defaultColors, ...customThemeColors, ...(colors || {}) };
  // ... 创建主题扩展
}
```

2. **属性名映射**:
```typescript
// 映射用户自定义属性名到 CodeMirror 内部属性名
if (colors) {
  if (colors.field) {
    c.variable = colors.field;  // 字段名 → 变量名
    c.property = colors.field;  // 字段名 → 属性名
  }
  if (colors.table) {
    c.property = colors.table;  // 表名 → 属性名
  }
}
```

3. **SVG 图标编码**:
```typescript
function encodeSvgIcon(iconNode: LucideIconNode): string {
  // 将 Lucide 图标编码为 data URI
}

function lucideCompletionIconMask(iconNode: LucideIconNode) {
  // 生成 CSS mask 用于自动补全图标
}
```

4. **主题加载**:
```typescript
export async function loadEditorTheme(
  theme: EditorTheme,
  appAppearance: AppThemeAppearance = "dark",
  customColors?: CustomThemeColors,
): Promise<Extension> {
  // 支持 custom 主题类型
  case "custom":
    return createCustomTheme(
      (await import("@codemirror/view")).EditorView, 
      customColors, 
      appAppearance === "dark"
    );
}
```

#### EditorSettingsDialog.vue (+82 行)
**路径**: `apps/desktop/src/components/editor/EditorSettingsDialog.vue`

**修改内容**:
1. **主题下拉框合并**:
   - 将预设主题和自定义主题合并为单一选择器
   - 移除冗余的第二个下拉框

2. **UI 布局调整**:
```
修改前:
[ 字体下拉 (100%) ]  [ 主题下拉 (220px) ]
                      [ 自定义主题配置按钮 ]

修改后:
[ 字体下拉 (80%) ] [ 主题下拉 (200px) ] [ 自定义主题配置按钮 ]
```

3. **新增属性**:
   - `showThemeCustomizer`: 控制主题编辑器对话框显示
   - `themeSelectValue`: 统一的主题选择值（支持 `custom:${id}` 格式）
   - `themeSelectOptions`: 合并预设和自定义主题的选项列表

4. **新增方法**:
   - `handleThemeSave()`: 处理主题编辑器保存事件
   - `onThemeChange()`: 处理主题切换（解析 `custom:${id}` 格式）

#### QueryEditor.vue (+72 行)
**路径**: `apps/desktop/src/components/editor/QueryEditor.vue`

**新增功能**:
1. **localStorage 直接读取**:
```typescript
function getEditorSettingsFromStorage(): EditorSettings {
  const raw = localStorage.getItem("dbx-editor-settings");
  if (raw) {
    const parsed = JSON.parse(raw);
    return {
      ...settingsStore.editorSettings,
      ...parsed,
      customThemeColors: parsed.customThemeColors ?? settingsStore.editorSettings.customThemeColors,
      customThemes: parsed.customThemes ?? settingsStore.editorSettings.customThemes,
      activeCustomThemeId: parsed.activeCustomThemeId ?? settingsStore.editorSettings.activeCustomThemeId,
    };
  }
  return settingsStore.editorSettings;
}
```

2. **主题颜色获取**:
```typescript
function getCurrentCustomThemeColors() {
  const settings = getEditorSettingsFromStorage();
  if (settings.theme !== "custom") return settings.customThemeColors;
  const activeTheme = settings.customThemes?.find(
    (t) => t.id === settings.activeCustomThemeId
  ) || settings.customThemes?.[0];
  return activeTheme?.colors ?? settings.customThemeColors;
}
```

3. **主题应用优化**:
   - `onMounted` 中通过 `nextTick` 确保主题正确应用
   - `watch` 监听 `settingsStore.editorSettings` 和 `isDark` 变化，动态重配置主题

---

## 三、Tauri 配置修复

### 3.1 问题描述
`cargo build --release` 编译的应用启动后显示"无法访问页面"，因为 Tauri 误认为处于开发模式，加载了 `http://localhost:1420`（开发服务器地址）。

### 3.2 根因
Tauri 2 需要 `custom-protocol` feature 来区分开发模式和生产模式。缺少此 feature 时，`tauri-build` 会设置 `cargo:rustc-cfg=dev`，导致前端资源未正确嵌入。

### 3.3 修改内容

#### Cargo.toml
```toml
# 修改前
[dependencies]
tauri = { version = "2.10.3", features = ["tray-icon"] }

# 修改后
[dependencies]
tauri = { version = "2.10.3", features = ["tray-icon", "custom-protocol"] }
```

#### build.rs (已有)
```rust
fn main() {
    tauri_build::build()  // 构建时嵌入前端资源
}
```

**效果**: 
- 生产构建正确嵌入 `dist/` 目录下的前端资源
- 应用启动时加载 `tauri://localhost` 而非开发服务器
- 支持离线运行

---

## 四、代码质量修复

### 4.1 ThemeCustomizerDialog.vue 改进

#### 替换 alert 为 Toast
```typescript
// 修改前
alert("至少保留一个主题");
alert("JSON格式错误，请检查");

// 修改后
import { useToast } from "@/composables/useToast";
const { toast } = useToast();

toast("至少保留一个主题", 3000);
toast("JSON格式错误，请检查", 3000);
```

**效果**: 
- 避免阻塞主线程的原生弹窗
- 统一的 Toast 提示风格
- 支持国际化（后续可接入 `t()`）

#### 新增背景色/前景色选项
```typescript
const colorItems = [
  // ... 原有 10 个颜色项 ...
  { key: "background" as const, label: "背景色", example: "编辑器背景", num: "⑪" },
  { key: "foreground" as const, label: "前景色", example: "默认文字颜色", num: "⑫" },
];
```

### 4.2 临时文件清理

**删除的文件**:
- `test.pdb` - 调试符号文件（1.2MB）
- `portable/` 目录 - 构建输出（46MB+）
- `DBX_0.5.29_x64-portable.zip` - 旧版本压缩包（19.7MB）

**更新 .gitignore**:
```
test.pdb
portable/
DBX_*_x64-portable.zip
```

---

## 五、依赖变更

### package.json
```json
{
  "dependencies": {
    "@codemirror/lang-sql": "^6.10.0"  // 已有，支持 PL/pgSQL
  }
}
```

### Cargo.toml
```toml
[dependencies]
tauri = { version = "2.10.3", features = ["tray-icon", "custom-protocol"] }
```

---

## 六、文件变更清单

### 新增文件
| 文件 | 行数 | 说明 |
|------|------|------|
| `apps/desktop/src/components/editor/ThemeCustomizerDialog.vue` | 387 | 主题编辑器对话框 |
| `docs/fix-pgsql-highlighting.md` | 161 | 问题修复文档 |

### 修改文件
| 文件 | 变更 | 说明 |
|------|------|------|
| `apps/desktop/src/components/editor/QueryEditor.vue` | +72 | PL/pgSQL 高亮修复 + 主题支持 |
| `apps/desktop/src/components/editor/EditorSettingsDialog.vue` | +82 | 主题选择器 + UI 布局调整 |
| `apps/desktop/src/lib/editorThemes.ts` | +172 | 自定义主题创建 + 图标编码 |
| `apps/desktop/src/stores/settingsStore.ts` | +92 | 多主题数据结构 + 配置迁移 |
| `src-tauri/Cargo.toml` | +1 | 添加 custom-protocol feature |
| `src-tauri/build.rs` | +1 | 资源嵌入构建脚本 |
| `.gitignore` | +4 | 忽略临时文件 |

### 删除文件
| 文件 | 说明 |
|------|------|
| `.cargo/config.toml` | 移除 lld-link 配置（导致构建失败） |
| `test.pdb` | 调试符号文件 |
| `portable/` 目录 | 构建输出目录 |
| `DBX_0.5.29_x64-portable.zip` | 旧版本压缩包 |

---

## 七、功能验证

### 7.1 PostgreSQL 函数高亮
- ✅ 默认打开的函数页面：`PERFORM`, `SQLERRM`, `declare` 等关键字高亮正常
- ✅ 手动打开的函数页面：同样正常高亮
- ✅ `$function$` 内部代码被解析为 SQL/PL/pgSQL 而非字符串

### 7.2 自定义主题系统
- ✅ 主题 CRUD：创建、重命名、复制、删除正常
- ✅ 颜色配置：12 色可视化编辑器正常工作
- ✅ 调色板：Windows 风格 16 色基础色板点击正常
- ✅ JSON 导入/导出：格式验证和解析正常
- ✅ 实时预览：圈号映射和颜色实时更新
- ✅ 主题跟随系统：暗色/亮色模式自动切换

### 7.3 UI 布局
- ✅ 字体下拉菜单缩短 20%
- ✅ 主题下拉菜单左移
- ✅ 自定义主题按钮 reposition 到主题下拉后面
- ✅ 对话框宽度 860px（与设置对话框一致）

### 7.4 构建
- ✅ Debug 模式编译：~1-2 分钟
- ✅ Release 模式编译：~10 分钟
- ✅ 应用启动正常（无"无法访问页面"错误）

---

## 八、已知限制

1. **模块级变量共享**: `QueryEditor.vue` 使用文件级 `let` 变量存储 CodeMirror 模块引用，多实例可能存在状态污染风险（当前通过 localStorage 直接读取规避）

2. **缓存未清理**: `semanticDiagnostics` 和 `cachedColumnsByTable` 等模块级缓存在组件卸载时未清理

3. **SVG 编码安全**: `encodeSvgIcon` 函数未对属性值中的双引号进行转义

4. **主题 ID 生成**: 使用 `Date.now()` 生成主题 ID，快速创建可能重复（概率极低）

---

## 九、后续建议

1. **重构 QueryEditor**: 将模块级变量改为组件级 ref，消除实例间状态共享
2. **国际化完善**: 将 ThemeCustomizerDialog 中的硬编码中文替换为 `t()` 调用
3. **性能优化**: `hasChanges()` 中的 `JSON.stringify` 比较改为深比较或 computed 缓存
4. **类型安全**: 逐步替换 `any` 类型为精确类型
5. **测试覆盖**: 为主题 CRUD 操作和颜色配置添加单元测试

---

## 十、提交记录

```
7a2ddb3b feat: add background/foreground colors and UI improvements
4a8d9471 fix: apply pg highlighting fix to custom theme branch
cd041de9 fix: map user custom theme property names to CodeMirror internal names
94a0112b fix: read settings directly from localStorage to avoid reactivity timing issues
8dbbaefa fix: simplify custom theme color retrieval and handle empty customThemes array
dddb9f05 fix: sync customThemeColors when saving custom themes to ensure fallback works
9b91561f fix: ensure custom theme colors are applied to newly opened editors
8fa336e5 fix: color palette click and JSON tab height
19528c64 feat: add basic color palette and auto-fit button width
7a1618c9 fix: dialog width and dropdown variable shadowing
87b3d22d feat: merge custom themes into single dropdown, widen config dialog
c6db5dfb feat: support multiple custom themes with CRUD operations
98745bb9 feat: add fully customizable theme with visual editor and JSON config
879cbb8f feat: add CustomThemeColors support to settings store and editor themes
4af96bfd chore: trigger rebuild to re-embed frontend assets
4d22cbbf revert: disable doubleDollarQuotedStrings change to fix app startup
40647295 chore: add @lezer/highlight dependency for custom theme
d9ec4100 feat: add fully customizable editor theme
61c6a3a4 fix: disable doubleDollarQuotedStrings for PostgreSQL to enable PL/pgSQL syntax highlighting inside function bodies
f42dfdbb feat: add PL/pgSQL syntax highlighting support for PostgreSQL functions
```

---

**文档生成时间**: 2026-06-05
**生成者**: opencode
**分支**: save/custom-theme-current
