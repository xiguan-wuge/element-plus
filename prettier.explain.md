# Prettier 格式化工具

对 [Prettier](https://prettier.io/) 相关文件的解析以及它与 ESLint 的区别如下：

### **1. 文件作用解析**

- **[.prettierrc](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/.prettierrc)**：**格式化配置文件**。
  - 它定义了代码的“长相”。例如在这个项目中：
    - `"semi": false`: 句末不加分号。
    - `"singleQuote": true`: 强制使用单引号。
    - `"trailingComma": "es5"`: 在 ES5 支持的地方保留尾随逗号。
  - 它确保了所有开发者写出的代码在视觉风格上是完全统一的。

- **[.prettierignore](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/.prettierignore)**：**格式化忽略文件**。
  - 告诉 Prettier 哪些文件**不需要**被自动格式化。
  - 通常包括：编译产物（`dist`）、第三方库（`node_modules`）、测试覆盖率报告（`coverage`）以及不希望被改动格式的特定文件（如 `CHANGELOG.en-US.md`）。

---

### **2. Prettier vs ESLint 的核心区别**

虽然它们看起来都在检查代码，但分工非常明确：

| 特性           | **Prettier (格式化)**                                          | **ESLint (代码质量/检查)**                           |
| :------------- | :------------------------------------------------------------- | :--------------------------------------------------- |
| **核心关注点** | **代码风格 (Formatting)**                                      | **代码质量 (Code Quality)**                          |
| **具体任务**   | 换行、空格、引号、分号、缩进等。                               | 未使用变量、禁用 `eval`、逻辑错误、潜在 Bug。        |
| **哲学**       | 极度武断 (Opinionated)，几乎没有配置空间，目标是停止争论风格。 | 灵活可配置，可以根据项目需求定制各种复杂的逻辑规则。 |
| **修复能力**   | 100% 自动修复（`--write`）。                                   | 部分修复（`--fix`），逻辑错误通常需要人工干预。      |

**简单记法**：

- **Prettier** 负责让代码**好看**。
- **ESLint** 负责让代码**正确**。

---

### **3. .prettierignore vs .eslintignore 的区别**

- **[.prettierignore](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/.prettierignore)**：
  - 如果一个文件在这里，Prettier 即使看到它有乱七八糟的空格或错误的引号，也**不会去动它**。
- **.eslintignore**：
  - 如果一个文件在这里，ESLint 即使看到它有明显的 Bug（比如 `a = 1/0`），也**不会报错**。

---

### **4. 为什么 Element Plus 两者都要用？**

在现代前端工程中，它们通常是**配合使用**的（这也是为什么你在 [package.json:L114](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/package.json#L114) 的 `lint-staged` 中同时看到了这两者）：

1. **解决冲突**：通过 `eslint-config-prettier` 插件，可以禁用 ESLint 中所有与 Prettier 冲突的风格规则。
2. **各司其职**：先用 ESLint 检查代码逻辑是否正确，再用 Prettier 统一代码的视觉呈现。
3. **自动化**：在 [settings.json:L5](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/.vscode/settings.json#L5) 中配置了保存时自动运行 ESLint 修复，通常也会配置 Prettier 自动格式化，从而极大提高开发效率。
