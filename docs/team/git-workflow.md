# 用 GitHub Desktop 干活（不用命令行）

下载：https://desktop.github.com ，用自己的 GitHub 账号登录。

## 第一次：把仓库下载到电脑

*File → Clone repository → Yokiwa/dueboard → Clone*。然后在仓库文件夹里运行一次 `npm install`（需要 Node.js 22）。

## 每次开工（最重要！）

1. 左上角 **Current branch** 选 `main`。
2. 点 **Fetch origin**，再点 **Pull origin**。→ 现在你电脑上是最新版本了。
3. **Current branch → New branch**，起名 `ui/xxx` 或 `fix/xxx`，基于 `main` 创建。
4. 用编辑器（VS Code）改 `src/` 里的文件。

## 改完

1. GitHub Desktop 左边会列出改了的文件，下面写一句说明（例：`ui: 新的 Header 样式`），点 **Commit**。
2. 点 **Publish branch**（以后叫 **Push origin**）。
3. 点 **Create Pull Request**，浏览器里打开，按模板填好，UI 改动贴截图，提交。
4. 等 CI 变绿 ✅ 和 Raymond 审核。要改就在同一个分支上继续 commit + push，PR 会自动更新。

## 做了很久，`main` 已经更新了

*Branch → Update from main*。有冲突时 GitHub Desktop 会提示用 VS Code 打开，保留需要的部分后 Commit。

## 实在只能网页上传

不要传到根目录。按 [design/README.md](../../design/README.md) 的第 3 条，传到 `design/incoming/日期-名字/`，并在网页上传页面底部选 **Create a new branch**（不要选 commit 到 main），然后开 PR。
