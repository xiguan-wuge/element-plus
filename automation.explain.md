## Element Plus 仓库自动化管理分析

本文基于当前仓库代码与配置，梳理 Element Plus 在以下方面的自动化管理方案：

- Commit 提交规范与校验
- Changelog 的维护与展示
- 版本号生成与变更流程
- CI/CD 流水线概览
- `packages/*` 多子包的版本策略（是否支持子包独立版本）

### 1. Commit 提交与规范

**1.1 Commit 规范来源**

- 使用 [commitlint](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/commitlint.config.mjs#L45-L107) 并继承 `@commitlint/config-conventional`，即整体遵循 Conventional Commits 规范：
  - 允许的 `type`：`build`、`chore`、`ci`、`docs`、`feat`、`fix`、`perf`、`refactor`、`revert`、`release`、`style`、`test`、`improvement`。
  - `scope`：自动从 `packages/*`、`internal/*` 目录扫描生成，加上 `docs`、`play`、`ci` 等常用范围。
  - 其它规则：限制标题长度 72 字符、`type`/`scope` 小写、subject 不能为空且不能以句号结尾等。

- `package.json` 中配置了 Commitizen（交互式提交工具）：
  - 脚本：`"cz": "czg"`。
  - `config.commitizen.path` 指向 `cz-git`，通过命令 `pnpm cz`/`pnpm run cz` 进行交互式提交，统一 commit 格式。

**1.2 本地 Git 钩子**

- 使用 Husky 管理 Git 钩子（参见 `.husky` 目录）：
  - `.husky/commit-msg`：在提交时执行
    - `pnpm exec commitlint --config commitlint.config.mjs --edit "${1}"`  
    - 作用：对当前 commit message 做规范校验，不符合规则会直接阻止提交。
  - `.husky/pre-commit`：在提交前执行
    - `pnpm exec lint-staged`  
    - `lint-staged` 配置在 `package.json` 中，对变更文件执行：
      - `eslint --fix --concurrency=auto`
      - `prettier --write --experimental-cli`
    - 作用：保证提交代码通过 ESLint & Prettier，并只对改动文件进行格式化。
  - `package.json` 中 `"prepare": "husky"`：安装依赖后自动安装 Husky 钩子。

**1.3 CI 层面的提交信息校验**

- 工作流：[.github/workflows/lint-commit-message.yml](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/.github/workflows/lint-commit-message.yml)
  - 触发时机：`pull_request` 的 opened/edited/reopened。
  - 校验对象：PR 标题（通常会在 squash-merge 时作为最终 commit message）。
  - 核心步骤：
    - 安装依赖后，执行 `echo "${{ github.event.pull_request.title }}" | pnpm run lint:commit`。
    - 若校验失败，记录 `failed=true` 并上传结果文件。

- 工作流：[.github/workflows/lint-commit-message-post.yml](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/.github/workflows/lint-commit-message-post.yml)
  - 触发时机：`Lint Commit Message` workflow 结束后（`workflow_run`）。
  - 根据前一工作流上传的结果：
    - 校验通过：移除 `CommitMessage::Unqualified` 标签。
    - 校验失败：为 PR 添加 `CommitMessage::Unqualified` 标签，并自动评论提醒中英文说明和参考链接。

> 总结：  
> - 本地层面：通过 Husky + commitlint + lint-staged + cz-git，约束 commit 规范并统一格式。  
> - CI 层面：对 PR 标题进行同样的规范校验，确保最终合并记录也符合规范。

### 2. Changelog 管理与展示

**2.1 Changelog 文件**

- 根目录存在 `CHANGELOG.en-US.md`，记录版本变更历史：  
  - 示例见 [CHANGELOG.en-US.md](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/CHANGELOG.en-US.md#L4-L36)，包含：
    - 版本号（如 `2.13.6`）
    - 日期
    - 分类：`Features`、`Bug fixes`、`Refactors` 等
    - 每条变更关联具体 PR 号和作者。

在当前仓库中，**未发现** 自动更新该 Markdown 文件的脚本或配置（例如 conventional-changelog/changesets 等），因此可以认为：

- Changelog 文件是在发布流程中由维护者根据实际变更手动/外部工具生成然后提交到仓库的。
- 仓库内部脚本主要围绕“版本号同步、发布与文档构建”，而不是直接生成 changelog。

**2.2 文档站中的 Changelog 展示**

- 文档入口：[docs/en-US/guide/changelog.md](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/docs/en-US/guide/changelog.md)
  - 页面说明只展示最近 30 条变更记录，链接指向 GitHub 上的 `[CHANGELOG](https://github.com/element-plus/element-plus/blob/dev/CHANGELOG.en-US.md)`。
  - 页面通过 `<VpChangelog />` 组件渲染 changelog 内容。

结合上述信息可以推断：

- Changelog 的**生成/维护**是通过维护者在 GitHub 主仓库中更新 `CHANGELOG.en-US.md` 完成的（可能使用内部工具，但并未在本仓库脚本中暴露）。
- 文档站只负责**读取并展示**最新 changelog（并加上一些筛选/截断逻辑），不负责生成。

### 3. 版本号生成与变更

版本相关逻辑主要集中在脚本目录 `scripts/` 以及构建工具 `internal/*` 中。

**3.1 运行时版本导出（`gen-version.ts`）**

- 脚本：[scripts/gen-version.ts](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/scripts/gen-version.ts)
  - 逻辑：
    - 首选读取环境变量 `TAG_VERSION`，若存在则去掉前缀 `v` 后作为版本号。
    - 否则从 `packages/element-plus/package.json` 中读取 `version` 字段。
    - 将最终版本写入 `epRoot/version.ts`，内容形如：`export const version = '2.13.6'`。
  - 触发方式：
    - `package.json` 中定义脚本：`"gen:version": "tsx scripts/gen-version.ts"`。
    - `postinstall` 中包含：`pnpm gen:version`，即安装依赖后自动生成 `version.ts`。
  - 作用：
    - 在构建包与文档时使用统一的版本源，保证运行时展示版本号与发布版本一致。

**3.2 发布前同步 NPM 包版本与 gitHead（`update-version.ts`）**

- 脚本：[scripts/update-version.ts](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/scripts/update-version.ts)
  - 依赖 `@element-plus/build-utils` 中的 `getWorkspacePackages`，遍历 pnpm workspace 包。
  - 从环境变量中读取：
    - `TAG_VERSION`：发布版本，例如 `v2.13.6` 或 `2.13.6`。
    - `GIT_HEAD`：当前构建对应的 Git 提交 SHA。
  - 目标包：
    - 主包 `element-plus`（或 nightly 场景下的 `@element-plus/nightly`）。
    - `@element-plus/eslint-config`
    - `@element-plus/metadata`
  - 对上述包执行：
    - `version: TAG_VERSION`
    - `gitHead: GIT_HEAD`
  - 若缺少环境变量或写入失败，通过 `errorAndExit` 中止流程。

**3.3 发布脚本与 NPM 发布流程**

- 脚本：[scripts/publish.sh](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/scripts/publish.sh)
  - 步骤：
    1. `pnpm i --frozen-lockfile` 安装依赖。
    2. `pnpm update:version`（即执行 `tsx scripts/update-version.ts`），同步版本号与 `gitHead`。
    3. `pnpm build`，基于 `internal/build` 构建产物到 `dist/element-plus` 等目录。
    4. 发布 NPM 包：
       - `cd dist/element-plus && pnpm publish --access public --no-git-checks`
       - `cd internal/eslint-config && pnpm publish --access public --no-git-checks`
       - `cd internal/metadata && pnpm build && pnpm publish --access public --no-git-checks`
  - 作用：
    - 为 Release 版本提供统一的自动化发布步骤，保证包版本与当前 Git 提交一致。

- 夜ly 发布脚本：[scripts/nightly.sh](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/scripts/nightly.sh)
  - 将 `packages/element-plus/package.json` 中的 `"name": "element-plus"` 替换为 `"@element-plus/nightly"`。
  - 修改 `internal/build-constants/src/pkg.ts` 中的包名为 `@element-plus/nightly`。
  - 删除 `scripts/publish.sh` 中发布 eslint-config 和 metadata 的相关行（夜ly不发布这些包）。
  - 配合 CI 中的 `TAG_VERSION=0.0.${date}`，形成 nightly 版的自动发布流程。

**3.4 CI 中的发布工作流**

- 正式发布：[.github/workflows/publish-npm.yml](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/.github/workflows/publish-npm.yml)
  - 触发条件：GitHub `release` 创建（`types: [created]`）。
  - Job `test`：
    - 检出代码、安装依赖。
    - 执行 `pnpm lint`、`pnpm test` 确保质量。
  - Job `publish`（依赖 `test`）：
    - 从 `GITHUB_REF` 提取 tag，写入环境变量 `TAG_VERSION`。
    - 从 `GITHUB_SHA` 写入 `GIT_HEAD`。
    - 更新 npm 版本（`npm install npm@11.6.1 -g`）。
    - 执行 `sh ./scripts/publish.sh`，完成构建与发布。

- Nightly 发布：[.github/workflows/publish-npm-nightly.yml](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/.github/workflows/publish-npm-nightly.yml)
  - 触发条件：定时（每天一次） + `workflow_dispatch` 手动触发。
  - `test` Job：同正式发布，执行 `lint` 和 `test`。
  - `publish` Job：
    - 通过 `date +'%Y%m%d'` 构建 nightly 版本号（`TAG_VERSION=0.0.YYYYMMDD`）。
    - 设置 `GIT_HEAD` 为当前 SHA。
    - 执行 `scripts/nightly.sh` 调整包名和发布脚本。
    - 执行 `scripts/publish.sh`，发布 nightly 版本。

> 结论：  
> - 正式版发布通过“GitHub Release → CI → `publish.sh`”完成版本同步与发包。  
> - Nightly 版通过定时任务自动构建并发布，版本号采用日期编码。  
> - 关键版本信息由 CI 注入的 `TAG_VERSION` / `GIT_HEAD` 统一驱动。

### 4. CI/CD 流水线概览

仓库的 CI/CD 主要聚焦在以下方面：代码质量、测试、构建产物验证、文档部署和发布流程自动化。

**4.1 代码质量与测试**

- Lint & Typecheck：[.github/workflows/lint-typecheck.yml](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/.github/workflows/lint-typecheck.yml)
  - 触发：`pull_request` / `workflow_dispatch`。
  - 步骤：
    - 安装依赖。
    - `pnpm lint`：运行 ESLint。
    - `pnpm typecheck`：运行一组 `vue-tsc`/`tsc` 类型检查任务。

- 单元测试：[.github/workflows/test-unit.yml](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/.github/workflows/test-unit.yml)
  - 使用 Vitest 运行单元测试：`pnpm test`。
  - Node 多版本矩阵：`20.19.0`、`22`、`24`。

- SSR 测试：[.github/workflows/test-ssr.yml](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/.github/workflows/test-ssr.yml)
  - 构建组件库：`pnpm build`。
  - 安装 Puppeteer Chrome。
  - 执行 `pnpm test:ssr`，验证组件在 SSR 场景的渲染行为。

- 覆盖率报告：[.github/workflows/test-coverage.yml](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/.github/workflows/test-coverage.yml)
  - 执行 `pnpm run test:coverage`。
  - 使用 `vitest-coverage-report-action` 上传并展示覆盖率，模式为 `file-coverage-mode: changes`。

**4.2 构建产物校验**

- 工作流：[.github/workflows/publish-build-product.yml](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/.github/workflows/publish-build-product.yml)
  - 触发：针对 `master` 分支的 PR。
  - 步骤：
    - `pnpm build` 进行本地构建。
    - `scripts/file-check.sh` 校验构建产物是否符合预期（防止遗漏/额外文件）。
    - `pnpm diff:table` 生成构建体积对比（写入 `tmp/diff.md`），并通过 `actions-cool/maintain-one-comment` 作为 PR 评论展示。
  - 作用：
    - 确保合并到主分支的改动不会异常增大构建产物或破坏输出结构。

**4.3 文档构建与部署**

- 正式环境的文档部署：[.github/workflows/publish-docs-deploy.yml](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/.github/workflows/publish-docs-deploy.yml)
  - 触发：当 `Publish to NPM registry` 工作流成功完成且事件为 `release`。
  - 核心步骤：
    - 安装依赖、初始化 Crowdin token。
    - 使用 Crowdin 下载 i18n 翻译。
    - `pnpm docs:gen-locale` 生成通用多语言资源。
    - 在 docs 中安装最新发布的 `element-plus@latest`。
    - 构建文档站：`pnpm docs:build`。
    - 使用 `github-pages-deploy-action` 部署到：
      - 本仓库 `gh-pages` 分支（官网静态站）。
      - Vercel 的两个发布仓库。
  - 作用：
    - 保证每次正式发布后，官网文档与最新版本同步。

- 此外还存在若干 PR 相关的 docs 构建/预览工作流（如 `pr-docs-build`、`pr-docs-deploy`、`staging-docs` 等），提供文档变更的预览与验证能力。

### 5. `packages/*` 多子包的版本策略

这里重点回答：**`packages` 目录下多子包是否支持子包间版本不同步（版本独立）？**

**5.1 工作区结构**

- `pnpm-workspace.yaml` 中的配置：
  - `packages/*`
  - `docs`
  - `play`
  - `internal/*`
  - 表明仓库采用 pnpm workspace 管理多包。

- 根 `package.json` 中对内部包的依赖：
  - 如 `@element-plus/components`、`@element-plus/constants`、`@element-plus/hooks` 等均使用：
    - `"workspace:*"` 或 `"workspace:^"`。
  - 这意味着：
    - 在开发与构建期间通过 workspace 链接本地包，而不是固定具体版本号。

**5.2 各子包版本字段现状**

示例（仅列出部分）：

- [packages/element-plus/package.json](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/packages/element-plus/package.json#L1-L4)
  - `"name": "element-plus"`
  - `"version": "0.0.0-dev.1"`（实际发布时由 `TAG_VERSION` 驱动）。

- [packages/locale/package.json](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/packages/locale/package.json#L1-L4)
  - `"name": "@element-plus/locale"`
  - `"version": "0.0.5"`

- [packages/hooks/package.json](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/packages/hooks/package.json#L1-L4)
  - `"name": "@element-plus/hooks"`
  - `"version": "0.0.5"`

- [packages/directives/package.json](file:///Users/xiguanwuge/codespace/sourceCode/element-plus/packages/directives/package.json#L1-L4)
  - `"name": "@element-plus/directives"`
  - `"version": "0.0.5"`

可以看到：

- 各子包都有**各自的 `version` 字段**，且与主包 `element-plus` 的版本解耦。
- 主发布脚本 `scripts/update-version.ts` 只主动更新：
  - `element-plus` 或 `@element-plus/nightly`
  - `@element-plus/eslint-config`
  - `@element-plus/metadata`
  - 其它子包的版本不会在发布流程中被自动同步。

**5.3 是否存在“统一版本”的强制机制？**

- 未发现类似 Lerna/Changesets 中“fixed/locked versioning”的配置：
  - 没有 `lerna.json` 或 `.changeset/config.json` 这类文件。
  - `pnpm-workspace.yaml` 只声明 workspace 关系，并没有统一版本设置。
- 发布脚本中：
  - 仅对主包和少数内部包做版本更新与发布。
  - `packages` 下的多子包更多是作为构建过程中的代码组织单元，而不是独立的发布单元。

> 结论：  
> - 从**工具与配置**角度来看，`packages/*` 子包是“版本独立”的：  
>   - 每个子包都有独立 `version` 字段；  
>   - 没有脚本强制所有包共享同一版本号；  
>   - 主发布流程只更新/发布少数关键包。  
> - 从**发布策略**角度看，当前 CI 发布流程主要围绕主包 `element-plus` 及少数内部工具包，其他 workspace 包更偏向内部实现，不作为频繁独立发布单元。

### 6. 小结

综合来看，Element Plus 当前的自动化管理体系具有以下特点：

- **提交规范**：通过 commitlint + cz-git + Husky + CI 校验，保证从本地提交到 PR 标题再到最终合并的全链路一致规范。
- **Changelog**：以 `CHANGELOG.en-US.md` 为中心，维护者在发布节奏下整理版本变更；文档站通过组件自动拉取并展示，但生成过程自身不在本仓库脚本中体现。
- **版本管理与发布**：使用 `TAG_VERSION` / `GIT_HEAD` 作为关键输入，统一驱动版本号写入、运行时版本导出、正式与 nightly 发版。
- **CI/CD**：覆盖 lint、typecheck、单元测试、SSR 测试、覆盖率、构建产物校验、文档部署等多个环节，确保质量与文档同步更新。
- **多包版本策略**：基于 pnpm workspace 的多包结构，子包具备独立版本字段，且没有统一版本锁定机制；发布流程主要集中在主包和少数内部包上，整体上**支持子包版本独立**的模式。

