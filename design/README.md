# design/ — 设计稿区

这里放**设计相关、但不会被打包进扩展**的东西。代码不放这里。

```
design/
  mockups/     设计图、截图、Figma 导出的 PNG/SVG（文件名带日期：2026-11-20-header-v2.png）
  incoming/    还没搬进 src/ 的代码草稿（每次一个文件夹：日期-名字/，里面写 README 说明对应哪个文件）
```

## 规则

1. **真正要上线的 UI 改动，直接改 `src/ui/` 里的文件，走 Pull Request。** 不要把 `.tsx` / `.css` 传到仓库根目录。
2. 只是想先给大家看看的设计 → 放 `mockups/`，在 Issue 里贴图讨论。
3. 不会用 Git、只能网页上传代码 → 放 `incoming/日期-名字/`，并写一个 README 表格说明每个文件对应 `src/` 里哪个文件，开 Issue（选 "UI / 设计"）提醒负责合并的人。

颜色、字体、间距这些全局样式在 `src/ui/tokens.css`，组件在 `src/ui/components/`，页面在 `src/ui/views/`。
