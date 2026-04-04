# Fork

在 GitHub 中，**Fork**（分叉）是指在你的个人账户下创建一个他人项目的**完整副本**。它是 GitHub 社交编程的核心，主要有以下几个作用：

**1. 参与开源贡献 (Pull Request)**
这是 Fork 最主要的作用。大多数开源项目（如你正在查看的 `element-plus`）不允许外部人员直接修改代码。

- 你先 **Fork** 到自己的空间。
- 在你自己的副本中进行修改、测试。
- 修改完成后，向原仓库提交一个 **Pull Request (PR)**。
- 原作者审核通过后，你的代码就会合并进原项目中。

**2. 自由实验与学习**

- 你可以 Fork 任何项目来学习它的代码结构，或者尝试一些激进的修改，而不用担心破坏原有的项目。
- 比如你想在 `element-plus` 中加入一个自定义组件，你可以 Fork 之后自己玩，这不会影响到原仓库。

**3. 个人定制版本**

- 如果你发现某个库有个小 Bug，或者你想针对自己公司的业务做一些微调，但原作者不同意合并你的修改。
- 你可以 Fork 一个分支，并维护你自己的“私有定制版”，然后在你公司的项目里引用这个 Fork 出来的包。

**4. 归档与防止丢失**

- 虽然 GitHub 很少发生项目突然消失的情况，但 Fork 一个副本可以确保即使原作者删除了仓库，你依然拥有一份代码拷贝。

---

**Fork vs Clone 的关键区别**
| 特性 | Fork | Clone |
| :--- | :--- | :--- |
| **位置** | 在 **GitHub 云端** 复制（从 A 的空间到 B 的空间） | 从 **云端** 下载到你的 **本地电脑** |
| **权限** | 你对 Fork 后的仓库拥有最高权限（Admin） | 你对本地代码有权限，但不能直接推送到原云端仓库 |
| **关联** | 副本与原仓库保持关联，可以一键同步原仓库更新 | 只是单纯的下载，默认不具备与原仓库同步的功能（需手动配置 remote） |

---

**参与开源的典型工作流**

1. **Fork**：在 GitHub 上点击 Fork 按钮。
2. **Clone**：将你 Fork 出来的**那个**仓库 `git clone` 到本地。
3. **Branch**：创建一个新分支 `git checkout -b fix-bug`。
4. **Commit & Push**：修改代码并推送到**你自己的** GitHub 仓库。
5. **Pull Request**：在 GitHub 上点击“New Pull Request”，请求原仓库合并你的代码。
6. **Sync**：原仓库更新后，你可以通过 GitHub 上的 "Sync fork" 按钮一键同步最新代码到你的副本。

---

## 如何同步 Fork 的最新修改？

当你 Fork 了 `element-plus` 的 `dev` 分支并 Clone 到本地后，要同步原仓库（Upstream）的最新修改，通常有两种主要方式：

### 方法一：使用 GitHub 网页端的 "Sync Fork" (最简单)

1. 打开你自己的 GitHub 仓库页面（即你的 Fork 副本）。
2. 在分支选择器中选择 `dev` 分支。
3. 点击页面中间的 **"Sync fork"** 按钮。
4. 如果有新提交，点击 **"Update branch"**。
5. 然后在本地执行 `git pull origin dev`，即可将云端的更新拉取到本地。

---

### 方法二：使用命令行 (开发者推荐，更可控)

这种方法通过配置“上游远程库 (Upstream Remote)”来实现，是专业开发者的标准做法。

**1. 配置上游远程库 (仅需执行一次)**
在你的本地仓库目录下，添加 `element-plus` 官方仓库作为 `upstream`：

```bash
# origin 是你自己的库，upstream 是官方的库
git remote add upstream https://github.com/element-plus/element-plus.git
```

你可以通过 `git remote -v` 查看是否配置成功。

**2. 同步官方 dev 分支的更新**
每当你想要同步时，执行以下步骤：

```bash
# 获取官方仓库的所有更新（不会修改你的代码）
git fetch upstream

# 切换到你本地的 dev 分支
git checkout dev

# 将官方的 dev 分支合并到你本地的 dev
git merge upstream/dev

# (可选) 将更新后的本地 dev 推送到你自己的 GitHub 仓库
git push origin dev
```

---

### 方法三：如何处理你正在开发的功能分支？

假设你正在一个叫 `feat-my-button` 的分支上工作，而 `dev` 已经更新了，你应该如何同步？

**推荐使用 Rebase (变基)：**

```bash
# 1. 先按方法二同步本地 dev 分支
git checkout dev
git pull upstream dev

# 2. 切换回你的功能分支
git checkout feat-my-button

# 3. 将你的修改“嫁接”在最新的 dev 之上
git rebase dev
```

**为什么要用 Rebase 而不是 Merge？**
使用 `rebase` 可以让你的提交历史保持线性。它会将你自己的修改暂时移开，把 `dev` 的最新提交接上，再把你的修改应用回去。这样在提交 PR 时，历史记录会非常干净，方便维护者审核。

### 总结

- **Sync Fork 按钮**：适合偶尔同步，操作直观。
- **Upstream 远程库**：适合高频开发，可以配合 `git rebase` 保持提交历史整洁。
- **注意**：同步前请确保你的本地工作区是干净的（已 commit 或 `git stash` 暂存），以避免合并冲突。
