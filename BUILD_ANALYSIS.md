# element-plus 打包构建分析

## 核心产物目录

最终的产出在 `dist/element-plus/` 目录下:

| 目录/文件         | 说明                                                   |
| ----------------- | ------------------------------------------------------ |
| `es/`             | ESM 格式的组件模块,每个组件单独一个 `.mjs` 文件        |
| `lib/`            | CJS 格式的组件模块,每个组件单独一个 `.js` 文件         |
| `dist/`           | 全量构建产物 (`index.full.js`, `index.full.min.js` 等) |
| `theme-chalk/`    | 编译后的 CSS 样式                                      |
| `package.json` 等 | 直接从源码目录复制                                     |

## 构建系统

使用 **rolldown** 作为打包工具,构建配置集中在 `internal/build/` 目录。

### 触发方式

```bash
# 完整构建
pnpm build

# 仅构建主题样式
pnpm build:theme
```

触发链:

```
根 package.json:  "build": "pnpm run -C internal/build start"
       ↓
internal/build/package.json:  "start": "jiti buildfile.ts"
       ↓
internal/build/buildfile.ts → build() 函数,编排全部构建步骤
```

### 关键路径常量 (`internal/build-utils/src/paths.ts`)

```
projRoot    → <项目根>
buildOutput → <projRoot>/dist
epOutput    → <projRoot>/dist/element-plus    ← 最终产出
epRoot      → <projRoot>/packages/element-plus ← 源码入口(preserveModules 根)
pkgRoot     → <projRoot>/packages             ← 文件扫描根
```

### 构建步骤总览 (`internal/build/buildfile.ts`)

`build()` 函数按以下步骤并行构建:

1. `makeOutput` — 清理并创建输出目录
2. `buildHelper` — 从文档解析组件属性,生成 `tags.json`、`attributes.json`、`web-types.json` (IDE 智能提示用)
3. `generateTypesDefinitions` — 生成 `.d.ts` 类型文件
4. `buildModules` — 组件逐模块构建 (产出 `es/` 和 `lib/`)
5. `buildFullBundle` — 全量 bundle 构建 (产出 `dist/`)
6. `buildStyle` — 编译主题 CSS (产出 `theme-chalk/` 和 `dist/index.css`)
7. `copyFiles` — 复制 `package.json`、`README.md`、`LICENSE`、`global.d.ts`
8. `copyTypesDefinitions` — 将类型文件分发到 `es/` 和 `lib/`

---

## `es/` 目录深度分析

### 一、输入来源

`es/` 的源文件**不是单一 package**,而是从整个 monorepo 的 `packages/` 目录扫描而来:

```
packages/
├── element-plus/     ← 主包 (index.ts 作为聚合入口,re-export 所有内容)
├── components/       ← 每个组件的源码 (.vue, .ts)
├── hooks/            ← 公共 hooks
├── directives/       ← 指令
├── constants/        ← 常量
├── utils/            ← 工具函数
└── locale/           ← 国际化
```

`packages/element-plus/index.ts` 是整个包的入口:

```typescript
export * from '@element-plus/components' // 所有组件
export * from '@element-plus/constants' // 常量
export * from '@element-plus/directives' // 指令
export * from '@element-plus/hooks' // hooks
export * from './make-installer' // 安装器
export { default as dayjs } from 'dayjs' // dayjs 便利导出
```

### 二、构建机制

核心代码在 `internal/build/src/tasks/modules.ts` — `buildModulesComponents()`:

```typescript
// 1. 从整个 packages/ 目录扫描所有源文件
const input = await glob('**/*.{js,ts,vue}', {
  cwd: pkgRoot, // packages/
  absolute: true,
})

// 2. 用 rolldown 打包
const bundle = await rolldown({
  input, // 所有扫描到的文件作为入口
  plugins: [vue(), vueJsx()], // 处理 .vue SFC
  external: generateExternal(), // 所有 dependencies 不打包
  treeshake: { moduleSideEffects: false },
})

// 3. 写出两份产物
await writeBundles(bundle, [
  {
    format: 'esm',
    dir: 'dist/element-plus/es',
    preserveModules: true, // ← 核心!每个文件独立输出
    preserveModulesRoot: epRoot, // packages/element-plus 作为路径基准
    entryFileNames: '[name].mjs', // ESM 扩展名用 .mjs
  },
  {
    format: 'cjs',
    dir: 'dist/element-plus/lib',
    preserveModules: true,
    preserveModulesRoot: epRoot,
    entryFileNames: '[name].js', // CJS 扩展名用 .js
  },
])
```

### 三、输出结构

每个源文件 → 一个输出文件,**目录结构完全保留**:

```
源码: packages/components/button/src/button.ts
       ↓ rolldown (esm)
输出: es/components/button/src/button.mjs       ← 编译后的 JS
      es/components/button/src/button.d.ts      ← 类型声明
      es/components/button/src/button.mjs.map   ← sourcemap
```

实际产物目录结构:

```
es/
├── index.mjs                    ← 主入口,re-export 所有 (≈300行)
├── component.mjs                ← 组件列表 (用于全局注册)
├── defaults.mjs                 ← 默认安装器
├── make-installer.mjs           ← installer 工厂函数
├── plugin.mjs / version.mjs     ← 插件注册 / 版本信息
├── locales.mjs                  ← 多语言条目
│
├── components/                  ← 所有组件
│   └── button/
│       ├── index.mjs            ← 组件 re-export 入口(含 withInstall 包装)
│       ├── index.d.ts
│       └── src/
│           ├── button.mjs       ← button.ts 编译产物(逻辑/Props/Emits)
│           ├── button2.mjs      ← button.vue SFC 编译产物(模板+样式引用)
│           ├── button-group.mjs
│           ├── button-group2.mjs
│           ├── button-custom.mjs
│           ├── use-button.mjs   ← use-button.ts 编译产物
│           ├── constants.mjs
│           ├── instance.mjs
│           └── ... (每个 .ts/.vue 对应一个 .mjs)
│
├── hooks/                       ← 公共 hooks
│   ├── use-attrs/index.mjs
│   ├── use-locale/index.mjs
│   └── ...
├── constants/                   ← 常量 (aria, event, key, size 等)
├── directives/                  ← 指令 (click-outside, repeat-click 等)
├── utils/                       ← 工具函数集合
├── locale/                      ← 国际化语言包
│   └── lang/*.mjs
└── _virtual/                    ← Vue SFC 辅助代码
    └── _plugin-vue_export-helper.mjs  ← __vccOpts 处理
```

### 四、设计思路 — 为什么这样打包

#### 核心理念: Preserve Modules (保留模块结构)

`preserveModules: true` 是关键。**不是把组件打成一个 bundle**,而是把每个源文件平行翻译成 ESM/CJS 模块。

#### 原因一: 实现真正的 Tree-Shaking

每个文件是独立的模块节点:

```js
// 用户只引入 button
import { ElButton } from 'element-plus'

// 打包工具的 import 图追踪:
//   es/index.mjs
//     → es/components/button/index.mjs       ← 命中
//       → es/components/button/src/button.mjs   ← 命中
//       → es/components/button/src/button2.mjs  ← 命中 (SFC)
//       → es/components/button/src/use-button.mjs ← 命中
//     → es/components/alert/...              ← ✗ 未命中,被 tree-shake
//     → es/components/input/...              ← ✗ 未命中,被 tree-shake
```

依赖关系是显式的 import/export 图,打包工具(webpack/vite/rolldown)可以精确追踪并删除未使用代码,**不需要额外的按需引入插件**(如 babel-plugin-import 或 unplugin-vue-components)。

#### 原因二: 按需路径友好

npm 包支持直接路径导入:

```js
import ElButton from 'element-plus/es/components/button/index.mjs'
// 或
import { Button } from 'element-plus'
// tree-shaking 效果等价
```

`package.json` 的 `exports` 字段同时支持这两种方式:

```json
{ "./es/*": { "import": "./es/*.mjs" } }
```

#### 原因三: 细粒度缓存

每个 `.mjs` 文件独立:

- 浏览器/打包工具按文件级别缓存
- button 改动 → 只重新下载 button 的 chunk
- 其他组件不受影响,缓存持续命中
- 与 code splitting 天然配合

#### 原因四: 类型声明与 JS 并列

```
es/components/button/src/button.mjs    ← JS
es/components/button/src/button.d.ts   ← 类型声明 (同目录同文件名)
```

TS 编译器/编辑器从 `.mjs` 文件能直接找到 `.d.ts`,无需额外配置 `types` 映射。

#### 原因五: 第三方依赖全部 external

```typescript
// generateExternal() 返回:
//   peerDependencies + dependencies 全部 external
// 即: vue, dayjs, lodash, @floating-ui/dom, async-validator 等
// 全部不打包进产物
```

这意味着:

- 用户项目用自己的依赖版本,避免版本冲突和重复
- 单个 `.mjs` 文件通常只有几 KB
- 业务代码和 element-plus 共享同一份 vue/lodash 实例

### 五、`es/` 与 `lib/` 的关系

| <br />         | `es/`                       | `lib/`                           |
| -------------- | --------------------------- | -------------------------------- |
| 格式           | ESM (`import`/`export`)     | CJS (`require`/`module.exports`) |
| 扩展名         | `.mjs`                      | `.js`                            |
| 目标用户       | 现代打包工具(vite/webpack5) | Node.js / 旧版 webpack           |
| `package.json` | `"module": "es/index.mjs"`  | `"main": "lib/index.js"`         |

**内容完全相同**,同一次 rolldown 调用通过不同 `format` 产出两份。

### 六、`es/` 构建流程图

```
packages/ 下所有 .ts/.vue/.js 源文件 (由 tinyglobby 扫描)
        │
        ▼
  rolldown({
    input: [所有文件],
    preserveModules: true,         ← 核心: 文件一一对应
    preserveModulesRoot: epRoot,   ← 路径基准: packages/element-plus
    external: [vue, dayjs, ...],   ← 第三方不打包
    plugins: [vue(), vueJsx()],   ← 处理 .vue SFC
    treeshake: true,
  })
        │
        ├─► write({ format: 'esm', dir: 'dist/element-plus/es', ext: '.mjs' })
        │     └─► index.mjs, components/button/src/button.mjs, hooks/use-attrs/index.mjs ...
        │
        └─► write({ format: 'cjs', dir: 'dist/element-plus/lib', ext: '.js' })
              └─► index.js, components/button/src/button.js, hooks/use-attrs/index.js ...
```

### 七、打包思路一句话总结

> **不是「把组件打成一个文件」,而是「把每个源文件平行翻译成 ESM/CJS」,让使用者的打包工具能通过 import 图做精确 tree-shaking。**
>
> 这是 element-plus 按需引入不需要额外插件的根本原因。

---

## 其他构建步骤

### `generateTypesDefinitions` — 类型定义 (`internal/build/src/tasks/types-definitions.ts`)

使用 **rolldown-plugin-dts** 生成 `.d.ts` 文件,输出到 `dist/types/`,最后复制到 `es/` 和 `lib/` 各目录中。

### `buildFullBundle` — 全量构建 (`internal/build/src/tasks/full-bundle.ts`)

从 `packages/element-plus/index.ts` 入口打包完整版本:

| 产物                         | 格式         |
| ---------------------------- | ------------ |
| `dist/index.full.js`         | UMD (未压缩) |
| `dist/index.full.min.js`     | UMD (压缩)   |
| `dist/index.full.mjs`        | ESM (未压缩) |
| `dist/index.full.min.mjs`    | ESM (压缩)   |
| `dist/locale/*.js` / `*.mjs` | 多语言包     |

**full-bundle 的 external 策略不同** — 只 external `peerDependencies`(vue),dependencies 全部打包进去。

### `buildStyle` — 样式构建

调用 `packages/theme-chalk` 的 gulp 构建,输出 `dist/element-plus/theme-chalk/index.css`,并复制为 `dist/element-plus/dist/index.css`。

### `buildHelper` — 辅助文件生成 (`internal/build/src/tasks/helper.ts`)

从文档中解析组件属性,生成 `tags.json`、`attributes.json`、`web-types.json`,用于 IDE 智能提示。

### 复制任务

- `copyFiles`: 将 `package.json`、`README.md`、`LICENSE`、`global.d.ts` 复制到输出目录
- `copyTypesDefinitions`: 将 `dist/types/` 类型文件分发到 `es/` 和 `lib/`
- `copyFullStyle`: 复制 `theme-chalk/index.css` → `dist/index.css`

## package.json 产物映射

```json
{
  "main": "lib/index.js", // CJS 入口
  "module": "es/index.mjs", // ESM 入口
  "types": "es/index.d.ts", // 类型入口
  "unpkg": "dist/index.full.js" // CDN 全量包
}
```

`exports` 字段还支持按子路径导入,如 `element-plus/es/components/button` 直接指向按需的 `.mjs` 文件。
