# 团队手册

- [CONTRIBUTING.md](../../CONTRIBUTING.md)：协作规则（先看这个）
- [git-workflow.md](git-workflow.md)：用 GitHub Desktop 一步步操作
- 下面：仓库里每个文件夹是干什么的

## 文件夹地图

```
dueboard/
├── src/                     ← 扩展的全部代码（只有这里的代码会被打包）
│   ├── ui/                  ← 界面（UI 改动主要在这里）
│   │   ├── tokens.css       ← 全局颜色、字体、间距
│   │   ├── components/      ← 小组件：Header、按钮条、横幅……
│   │   ├── views/           ← 页面：课程卡片、日历、待办……
│   │   ├── hooks/           ← React hooks（逻辑，改前问一下）
│   │   └── i18n.tsx         ← 界面上的所有文字（中英文）
│   ├── entrypoints/         ← 各个页面的入口：dashboard（主面板）、popup（工具栏弹窗）、options（设置）
│   ├── core/                ← 核心逻辑：时间、截止日期、合并规则
│   ├── connectors/          ← 读 Brightspace / Gradescope / Pearson 的代码
│   ├── background/ sync/ syllabus/ capture/ storage/ diagnostics/   ← 后台同步等
│   └── assets/              ← 图标
├── tests/                   ← 自动测试，结构和 src/ 对应（改了 src/ 记得补测试）
├── design/                  ← 设计图和还没合进代码的 UI 草稿（不会被打包）
├── docs/                    ← 网站页面、指南、设计决定
│   ├── team/                ← 团队手册（就是这里）
│   ├── guide/               ← 安装、发布等操作指南
│   └── superpowers/         ← 功能的设计文档和实现计划
├── store/                   ← Chrome / Firefox 商店的介绍文字和截图
├── scripts/                 ← 端到端测试脚本
├── .github/                 ← Issue/PR 模板、自动检查（CI）、代码负责人
└── CHANGELOG.md             ← 每个版本改了什么
```

根目录只放配置文件（`package.json`、`wxt.config.ts` 等）和说明文档，**不要放代码**。

## 版本

- 版本号在 `package.json` 的 `version`，改动记在 `CHANGELOG.md`。
- 只有 Raymond 改版本号和发布。别人在 PR 里写清楚改了什么，发布时汇总。
- 想看"现在最新的是哪个版本"：永远以 `main` 分支为准。

## Issue 标签（建议在 GitHub 上建好）

| 标签 | 意思 |
|---|---|
| `bug` | 出错了 |
| `ui` | 界面/设计 |
| `feature` | 新功能 |
| `needs-review` | 等 Raymond 看 |
| `blocked` | 卡住了，需要别人 |

可以在仓库的 **Projects** 里建一个看板（To do / In progress / In review / Done），把 Issue 拖来拖去，谁在干什么一眼就知道。
