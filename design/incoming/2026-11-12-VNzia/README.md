# VNzia 的 UI 改动（2026-11-12 上传，尚未合进代码）

这些文件原来是用网页 "Add files via upload" 传到了仓库**根目录**。
扩展只从 `src/` 构建（`wxt.config.ts` 里 `srcDir: 'src'`），测试只跑 `tests/`，
所以放在根目录的文件**从来没有生效过**，而且它们是基于旧版本改的。

现在先放在这里保存，等有人按下表把改动搬进 `src/` 里对应的文件（在最新的 `main` 上做）。

| 这里的文件 | 应该改进的真实文件 | 状态 |
|---|---|---|
| `App.tsx` | `src/entrypoints/dashboard/App.tsx` | 待合并 |
| `main.tsx` | `src/entrypoints/dashboard/main.tsx` | 待合并 |
| `index.html` | `src/entrypoints/dashboard/index.html` | 待合并 |
| `dashboard.css` | 新文件 → `src/entrypoints/dashboard/dashboard.css` | 待合并 |
| `AppShell.tsx` | `src/ui/components/AppShell.tsx` | 待合并 |
| `Header.tsx` | `src/ui/components/Header.tsx` | 待合并 |
| `NextDueBanner.tsx` | `src/ui/components/NextDueBanner.tsx` | 待合并 |
| `Onboarding.tsx` | `src/ui/components/Onboarding.tsx` | 待合并 |
| `ViewTabs.tsx` | `src/ui/components/ViewTabs.tsx` | 待合并 |
| `CourseCard.tsx` | `src/ui/views/CourseCard.tsx` | 待合并 |
| `i18n.tsx` | `src/ui/i18n.tsx` | 待合并 |
| `PomodoroTimer.tsx` | 新文件 → `src/ui/components/PomodoroTimer.tsx` | 待合并（PR #3 的番茄钟也还没真正接进去） |
| `pomodoro.test.tsx` | 新文件 → `tests/ui/pomodoro.test.tsx` | 待合并 |

合并完一行，就把状态改成"已合并"；全部合并完后删除这个文件夹。
