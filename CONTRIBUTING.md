# 团队协作规则（必读）

我们出过的问题：一个人在新版本上修 bug，另一个人在旧版本上做 UI，最后两边对不上。
下面的规则就是为了避免这个。**核心只有一句：所有人都从最新的 `main` 开始，改完用 Pull Request 合回 `main`。**

## 1. 谁负责什么

| 人 | GitHub | 负责 | 主要改的文件夹 |
|---|---|---|---|
| Raymond（项目负责人） | @Yokiwa | 决定做什么、审核并合并 PR、发版本 | 全部 |
| Kaiyi | @ricecooker669 | 修 bug | `src/`（逻辑）、`tests/` |
| VNzia | @VNzia | UI 设计 | `src/ui/`、`design/` |

详细的文件夹说明见 [docs/team/README.md](docs/team/README.md)。

## 2. 每次干活的流程

1. **先有 Issue**：要修的 bug、要做的 UI，都先在 GitHub 的 Issues 里开一个（有模板），指派给自己。
2. **从最新 `main` 开新分支**：
   - 修 bug：`fix/简短描述`，例：`fix/pearson-login`
   - UI：`ui/简短描述`，例：`ui/header-redesign`
   - 新功能：`feat/简短描述`
3. **在分支上改、提交**。只改和这个 Issue 有关的东西。
4. **开 Pull Request 到 `main`**，在描述里写 `Closes #Issue号`。UI 改动必须贴改前/改后截图。
5. **自动检查（CI）通过 + Raymond 审核通过** 才能合并。
6. 合并后删掉分支。下次干活回到第 2 步，**重新从最新 `main` 开分支**。

不会用命令行？看 [docs/team/git-workflow.md](docs/team/git-workflow.md)，用 GitHub Desktop 点几下就行。

## 3. 禁止事项

- ❌ 不要直接往 `main` 推代码或网页上传文件到 `main`。
- ❌ 不要把 `.tsx` / `.ts` / `.css` 文件传到仓库**根目录**——构建只看 `src/`，放根目录等于没改（CI 会直接报错）。
- ❌ 不要在一个很久以前的分支上继续做新东西。开工前先同步 `main`。
- ❌ 不要在一个 PR 里同时修 bug 又改 UI，分开两个 PR。

## 4. 两个人改到同一个文件怎么办

- UI 和 bug 最常撞在 `src/ui/` 里。开工前在 Issue 里说一声你要改哪个文件。
- 如果 PR 显示 "This branch has conflicts"：先把最新 `main` 合进你的分支（GitHub Desktop：*Branch → Update from main*），解决冲突后再推。不确定就在 PR 里 @ 对方一起看。

## 5. 提交之前自己检查

```bash
npm install
```

```bash
npm run compile && npm test
```

UI 改动再跑 `npm run dev` 在浏览器里亲眼看一下。
