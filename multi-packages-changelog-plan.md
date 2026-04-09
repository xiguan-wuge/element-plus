## 多 packages 组件库：子包独立发布与 changelog 自动化方案草稿

本方案用于参考，帮助你在自己创建的 Vue3 组件库中搭建：

- 多包结构（`packages/*`）；
- 子包可以 **独立发布**；
- 为每个子包自动生成 **独立的 CHANGELOG**；
- 将各子包 changelog 同步到 `docs` 目录，并在文档中展示。

本文不修改当前 element-plus 仓库，仅作为未来项目的设计草案。

---

## 一、整体设计概览

**工具选型**

- 包管理与多包工作区：pnpm workspace
- 版本管理 & 变更日志 & 发布：Changesets
  - 支持多包 + 子包独立版本 + 每包独立 CHANGELOG。
- 文档系统：VitePress（或其他支持 Markdown 的文档系统）

**目标流程**

1. 开发阶段：
   - 使用 Conventional Commits（配合 commitlint + cz-git + Husky）。
   - 功能完成后运行 `pnpm changeset`，记录本次变更影响的包以及变更类型（major/minor/patch）。
2. 发布阶段（CI 中执行）：
   - `changeset version`：为本轮实际有变更记录的包计算新版本号，并生成/更新这些包的 `CHANGELOG.md`（其它包保持不变，除非配置了联动更新内部依赖）。
   - 自定义脚本：将各包当前的 `CHANGELOG.md` 同步到 `docs` 目录中对应位置（未变化的包内容会原样同步，不新增版本段落）。
   - `changeset publish`：将本轮版本号发生变化的包发布到 npm（未变化的包不会重新发布）。
3. 文档展示：
   - 每个子包在 docs 中有专门的 changelog 页面（例如 `docs/components/button/changelog.md`）。
   - 文档站只负责渲染这些 Markdown 文件。

---

## 二、基础工程结构示例

建议的项目结构（以 `your-lib` 为占位）：

```text
your-lib/
  package.json
  pnpm-workspace.yaml
  .changeset/
    config.json
  packages/
    button/
      package.json
      src/...
      CHANGELOG.md   # Changesets 自动生成
    input/
      package.json
      src/...
      CHANGELOG.md   # Changesets 自动生成
  docs/
    .vitepress/
      config.ts
    components/
      button/
        index.md
        changelog.md  # 由脚本从 packages/button 同步生成
      input/
        index.md
        changelog.md  # 由脚本从 packages/input 同步生成
  scripts/
    sync-changelog-to-docs.ts
```

`pnpm-workspace.yaml` 示例：

```yaml
packages:
  - 'packages/*'
  - 'docs'
```

根 `package.json` 示例（与本方案相关部分）：

```json
{
  "private": true,
  "packageManager": "pnpm@10.0.0",
  "workspaces": ["packages/*", "docs"],
  "scripts": {
    "dev": "pnpm -C docs dev",
    "build": "pnpm -C docs build",
    "release:version": "changeset version",
    "release:publish": "changeset publish",
    "release:sync-changelog": "tsx scripts/sync-changelog-to-docs.ts",
    "release": "pnpm release:version && pnpm release:sync-changelog && pnpm release:publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.0",
    "tsx": "^4.0.0"
  }
}
```

---

## 三、Changesets：多包独立版本 + 自动 CHANGELOG

### 3.1 初始化 Changesets

在未来项目根目录执行：

```bash
pnpm dlx @changesets/cli init
```

会生成：

- `.changeset/config.json`
- `.changeset/README.md`

### 3.2 `.changeset/config.json` 基本配置

示例：

```json
{
  "$schema": "https://unpkg.com/@changesets/config@2.3.1/schema.json",
  "changelog": "@changesets/changelog-github",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch"
}
```

要点：

- 不配置 `fixed`/`linked`，默认每个包独立版本。
- 使用 `@changesets/changelog-github` 自动为每个包生成 `CHANGELOG.md`。
- `access: "public"` 方便发布到公共 npm。

### 3.3 子包 `package.json` 要求

每个子包需要有自己独立的 `package.json`：

```json
{
  "name": "@your-scope/button",
  "version": "0.1.0",
  "main": "dist/index.cjs",
  "module": "dist/index.esm.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --dts"
  }
}
```

### 3.4 提交变更时新增 changeset

当某次变更影响了特定子包，例如 `button`：

```bash
pnpm changeset
```

交互内容包括：

- 选择受影响的包（可多选，如 `@your-scope/button`）。
- 为每个包选择变更等级：`patch`、`minor`、`major`。
- 输入简短的变更说明（会写入 changelog）。

执行后会生成 `.changeset/some-id.md`，内容类似：

```md
---
'@your-scope/button': minor
---

Add loading state support to Button.
```

### 3.5 版本计算和 CHANGELOG 生成

准备发布时执行：

```bash
pnpm release:version
```

其中 `changeset version` 会：

- 根据 `.changeset` 目录中记录，计算每个「本轮有 changeset 的包」的新版本。
- 只更新这些包的 `package.json` 中的 `version` 字段（以及根据配置需要联动更新的内部依赖包）。
- 为这些包生成或更新 `packages/<pkg>/CHANGELOG.md` 中的最新版本段落。

此时：

- 子包版本号彼此独立；
- 每个「有变更记录」的子包都会自动维护自己的 `CHANGELOG.md`；
- 没有被选入当前 changeset 的包，其版本和 changelog 都保持不变。

### 3.6 只发布单个包时的行为说明

当你希望只发布某一个子包（例如 `@your-scope/button`）时：

- 在执行 `pnpm changeset` 的交互中，只勾选这个包；
- 保持 `.changeset/config.json` 中：
  - `fixed`、`linked` 为默认空数组（不做统一版本锁定）；
  - 如果不希望自动联动内部依赖，可以将 `updateInternalDependencies` 设置为 `"none"`。

在这种配置下：

- `changeset version`：
  - 只会为 `@your-scope/button` 计算新版本、更新它的 `package.json` 和 `CHANGELOG.md`；
  - 其它包的版本与 changelog 不会新增新版本段落。
- `changeset publish`：
  - 只会发布版本号发生变化的包（即本轮被 changeset 涉及的包）；
  - 没有变更的包不会被重新发布。

---

## 四、同步子包 changelog 到 docs 目录

为方便在文档中直接展示各组件 changelog，可以在 Release 流程中增加一步：

> 从 `packages/<pkg>/CHANGELOG.md` 同步到 `docs/components/<pkg>/changelog.md`。

示例脚本：`scripts/sync-changelog-to-docs.ts`

```ts
import { promises as fs } from 'fs'
import path from 'path'

const root = process.cwd()
const packagesDir = path.join(root, 'packages')
const docsDir = path.join(root, 'docs', 'components')

async function main() {
  const packageNames = await fs.readdir(packagesDir)

  for (const pkgName of packageNames) {
    const pkgPath = path.join(packagesDir, pkgName)
    const stat = await fs.stat(pkgPath)
    if (!stat.isDirectory()) continue

    const changelogPath = path.join(pkgPath, 'CHANGELOG.md')
    let changelogContent: string
    try {
      changelogContent = await fs.readFile(changelogPath, 'utf-8')
    } catch {
      continue
    }

    const docsComponentDir = path.join(docsDir, pkgName)
    await fs.mkdir(docsComponentDir, { recursive: true })

    const docsChangelogPath = path.join(docsComponentDir, 'changelog.md')
    await fs.writeFile(docsChangelogPath, changelogContent, 'utf-8')
  }
}

main()
```

对应的 release 脚本顺序：

```json
{
  "scripts": {
    "release:version": "changeset version",
    "release:sync-changelog": "tsx scripts/sync-changelog-to-docs.ts",
    "release:publish": "changeset publish",
    "release": "pnpm release:version && pnpm release:sync-changelog && pnpm release:publish"
  }
}
```

这样每次发布后：

- `packages/button/CHANGELOG.md` 会覆盖/更新 `docs/components/button/changelog.md`。
- docs 中各组件的 changelog 页面保持与真实发布记录一致。

---

## 五、在文档（VitePress）中展示 changelog

假设 docs 目录结构如下：

```text
docs/
  .vitepress/
    config.ts
  components/
    button/
      index.md
      changelog.md
    input/
      index.md
      changelog.md
```

### 5.1 组件文档主页面

`docs/components/button/index.md` 示例：

```md
# Button 按钮

这里写 Button 组件的使用说明、API 等内容。

## Changelog

请参考 [Button Changelog](./changelog.md)
```

### 5.2 changelog 页面

`docs/components/button/changelog.md` 内容由同步脚本生成，不需要手写：

- VitePress 会为每个 `changelog.md` 自动创建路由；
- 页面标题、段落等均由 Changesets 生成的 Markdown 决定。

如需更进一步，可以：

- 写一个自定义组件，将 `changelog.md` 内容局部嵌入 `index.md`；
- 或者在 `config.ts` 中统一配置侧边栏，将 changelog 作为每个组件的子菜单项。

---

## 六、CI 发布流程草案（GitHub Actions）

下面是一个简化版 GitHub Actions，用于自动化发布：

```yaml
name: Release

on:
  push:
    branches:
      - main

jobs:
  release:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build packages
        run: pnpm -r build

      - name: Version and generate changelog
        run: pnpm release:version

      - name: Sync changelog to docs
        run: pnpm release:sync-changelog

      - name: Publish to npm
        run: pnpm release:publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

后续如果需要自动创建 GitHub Release，可以再接入 Changesets 官方的 `changesets/action`，这里暂不展开。

---

## 七、方案总结

- **多 packages / 子包独立版本**
  - 使用 pnpm workspace + Changesets 默认配置，每个包维护自己的 version。
  - 每次改动只给涉及的包创建 changeset，版本计算和发布都以单个包为粒度进行。
- **自动生成对应子包的 changelog**
  - `changeset version` 会为「本轮有 changeset 的包」生成或更新各自的 `packages/<pkg>/CHANGELOG.md`。
  - changelog 内容来自 changeset 文件中的描述及关联信息。
- **changelog 写入 docs 并展示**
  - 自定义同步脚本将各包当前的 `CHANGELOG.md` 拷贝到 `docs/components/<pkg>/changelog.md`。
  - 文档系统把这些文件当普通 Markdown 页面渲染。

当你新建 Vue3 组件库时，可以直接以本方案为蓝本，调整包名（`@your-scope/...`）、目录命名和 CI 细节，即可快速搭建一套支持：

- 多包独立版本；
- 自动 changelog；
- 文档内可视化 changelog 的工程化发布系统。
