# PostgreSQL 函数语法高亮问题修复记录

## 问题描述

### 现象
- **默认打开的页面**（应用启动时自动恢复的第一个标签页）：PostgreSQL 函数代码语法高亮**正常**
- **手动打开的函数页面**：`$function$` 内部的代码**完全没有语法高亮**（所有文字显示为黑色）

### 影响范围
- 所有使用 PostgreSQL 方言的函数/存储过程编辑器
- PL/pgSQL 代码在 `$function$...$function$` 块内失去语法高亮
- 关键字（如 `declare`, `begin`, `if`, `PERFORM`）无颜色
- 类型（如 `integer`, `json`, `text`）无颜色
- 内置变量（如 `SQLERRM`, `TG_NAME`）无颜色

## 根因分析

### CodeMirror SQL 解析器行为

CodeMirror 6 的 `@codemirror/lang-sql` 包中，**PostgreSQL 方言默认开启 `doubleDollarQuotedStrings: true`**：

```javascript
// @codemirror/lang-sql/dist/index.js 第728-731行
const PostgreSQL = SQLDialect.define({
    charSetCasts: true,
    doubleDollarQuotedStrings: true,  // ← 默认开启
    operatorChars: "+-*/<>=~!@#%^&|`?",
    // ...
});
```

当此选项为 `true` 时，解析器会将 `$tag$...$tag$`（包括 `$function$...$function$`）识别为**字符串字面量**：

```javascript
// @codemirror/lang-sql/dist/index.js 第194-200行
else if (next == 36 /* Ch.Dollar */ && d.doubleDollarQuotedStrings) {
    let tag = readWord(input, "");
    if (input.next == 36 /* Ch.Dollar */) {
        input.advance();
        readDoubleDollarLiteral(input, tag);
        input.acceptToken(String$1);  // ← 标记为字符串token
    }
}
```

### 为什么默认打开的页面正常？

应用启动时的加载顺序：
1. 先恢复默认标签页（ContentArea.vue 中的查询页面）
2. 此时 `activeConnection` 可能尚未加载完成
3. `editorDialect` 回退到 `"mysql"`
4. MySQL 方言：`doubleDollarQuotedStrings: false`
5. `$function$` 被当作普通标识符，内部代码正常解析 ✅

当手动打开函数页面时：
1. ObjectBrowser.vue 加载
2. `sourceDialect` 明确返回 `"postgres"`
3. PostgreSQL 方言：`doubleDollarQuotedStrings: true`
4. `$function$` 被识别为字符串分隔符
5. 内部所有代码被标记为 `String` token，失去关键字高亮 ❌

## 修复方案

### 修改文件
`apps/desktop/src/components/editor/QueryEditor.vue`

### 修改内容
在 `SQLDialect.define()` 调用中添加 `doubleDollarQuotedStrings: false`：

```typescript
// 修改前
const dialect = SQLDialect.define({
  ...baseDialect.spec,
  keywords: [baseDialect.spec.keywords || "", extraKeywords, plpgsqlKeywords].filter(Boolean).join(" "),
  types: [baseDialect.spec.types || "", plpgsqlTypes].filter(Boolean).join(" ") || undefined,
  builtin: [baseDialect.spec.builtin || "", plpgsqlBuiltin].filter(Boolean).join(" ") || undefined,
});

// 修改后
const dialect = SQLDialect.define({
  ...baseDialect.spec,
  keywords: [baseDialect.spec.keywords || "", extraKeywords, plpgsqlKeywords].filter(Boolean).join(" "),
  types: [baseDialect.spec.types || "", plpgsqlTypes].filter(Boolean).join(" ") || undefined,
  builtin: [baseDialect.spec.builtin || "", plpgsqlBuiltin].filter(Boolean).join(" ") || undefined,
  doubleDollarQuotedStrings: false,  // ← 添加此行
});
```

### 副作用说明
- **正面**：函数体内部代码获得完整的 SQL/PL/pgSQL 语法高亮
- **负面**：函数体内的 `$$字符串$$` 或 `$tag$字符串$tag$` 会被当作 SQL 代码解析，而不是字符串字面量
- **评估**：在函数编辑器场景中，函数体应该是可执行代码而非字符串，因此此副作用可接受

## 相关修复

### Cargo.toml 配置修复
同时修复了 `src-tauri/Cargo.toml` 缺少 `custom-protocol` feature 的问题：

```toml
# 修改前
tauri = { version = "2.10.3", features = ["tray-icon"] }

# 修改后
tauri = { version = "2.10.3", features = ["tray-icon", "custom-protocol"] }
```

**说明**：Tauri 2 需要 `custom-protocol` feature 才能正确识别生产模式。缺少此 feature 会导致应用加载开发服务器地址（`http://localhost:1420`）而不是嵌入的前端资源，导致"无法访问页面"错误。

## 测试验证

### 测试环境
- 版本：v0.5.29
- 构建模式：Debug（开发测试）/ Release（生产发布）
- 数据库：PostgreSQL

### 测试步骤
1. 启动应用，连接 PostgreSQL 数据库
2. 验证默认打开的函数页面语法高亮正常
3. 手动打开其他函数页面，验证 `$function$` 内部代码高亮正常
4. 检查关键字（`declare`, `begin`, `if`, `PERFORM`）有颜色
5. 检查类型（`integer`, `json`, `text`）有颜色
6. 检查内置变量（`SQLERRM`, `TG_NAME`）有颜色

### 测试结果
✅ **所有页面语法高亮正常**，包括：
- 默认恢复的第一个函数页面
- 手动打开的其他函数页面
- `$function$` 内部的 PL/pgSQL 代码
- 关键字、类型、内置变量均有正确颜色

## 提交记录

```
commit a4eb7583
fix: disable doubleDollarQuotedStrings for PostgreSQL dialect to enable PL/pgSQL syntax highlighting in function bodies

- Add doubleDollarQuotedStrings: false to SQLDialect.define for PostgreSQL
- This allows CodeMirror to parse function body content as SQL/PL/pgSQL code
- instead of treating it as string literals inside $function$ blocks
- Also fix Cargo.toml to include custom-protocol feature for production builds
```

## 参考信息

### CodeMirror SQL 解析器源码
- 文件：`node_modules/@codemirror/lang-sql/dist/index.js`
- 相关函数：`readDoubleDollarLiteral()`（第51-71行）
- 相关配置：`doubleDollarQuotedStrings`（第165行默认值，第730行PostgreSQL配置）

### 相关概念
- **Dollar-Quoted Strings**：PostgreSQL 特有的字符串表示法，如 `$$content$$` 或 `$tag$content$tag$`
- **Lezer Parser**：CodeMirror 6 使用的增量解析器，基于 LR 算法
- **Tokenization**：将输入流转换为 token 序列的过程
- **Syntax Highlighting**：基于语法树节点类型应用颜色样式

## 备注

1. 此修复仅影响 PostgreSQL 方言的函数编辑器，不影响其他数据库类型
2. 如果未来需要同时支持标准 SQL 查询编辑和函数编辑，可能需要根据场景动态切换 `doubleDollarQuotedStrings` 值
3. 调试时可使用 WebView2 远程调试（端口9222）查看前端控制台日志
4. Debug 模式编译时间约 1-2 分钟，Release 模式约 8-15 分钟
