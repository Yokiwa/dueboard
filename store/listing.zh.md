# Chrome 应用商店文案（中文）

上传时把下面各栏的内容复制到对应位置。

## 名称
DueBoard

## 简短说明（不超过 132 个字符）
打开新标签页，就能看到 Brightspace 和 Gradescope 上所有课程的作业、截止日期和教材入口。

## 类别
效率 › 教育（Productivity › Education）

## 语言
中文（简体），另在英文版里提交英文文案

## 详细说明
不用再一门一门点进 Brightspace，也不用在各个平台之间来回登录。DueBoard 把你所有课程的作业和截止日期放进一个新标签页。

· 课程卡片：每门课一张卡片，显示接下来要交的作业、倒计时，以及 Brightspace、Gradescope、教材、讨论区的一键入口
· 下一个截止：最近的截止永远在最上面，实时倒计时
· 日历：周视图、月视图，看清哪天作业扎堆
· 待办清单：勾选完成，已提交的作业自动打勾
· 自动同步：借用浏览器已有的登录状态，每 30 分钟同步一次
· 手动添加：读不到的作业（比如 WebAssign 上的）可以自己添加
· 中英文界面

隐私：所有数据只保存在你的浏览器里，不上传、不收集、不分析，也不接触你的密码。

目前适用于普渡大学的 Brightspace（purdue.brightspace.com）和 Gradescope。
DueBoard 是学生开发的开源项目，不是普渡大学的官方产品。

## 截图（1280×800）
store/screenshots/zh-1-courses.png、zh-2-calendar.png、zh-3-todo.png

## 隐私权规范（Privacy practices）页面

### 单一用途说明
在新标签页中汇总显示用户在 Brightspace 和 Gradescope 上的课程作业、截止日期和课程资料链接。

### 权限理由
- storage：在本机保存同步到的作业、用户手动添加的内容和设置。
- alarms：每 30 分钟在后台同步一次作业和截止日期。
- offscreen：在后台解析 Gradescope 的网页内容（service worker 无法直接解析 HTML）。
- 主机权限 https://purdue.brightspace.com/*：读取用户自己的课程、作业、测验、日历和课程资料目录。
- 主机权限 https://www.gradescope.com/*：读取用户自己的课程、作业、截止时间和提交状态。
- 替换新标签页：在新标签页显示作业面板（用户可在设置中改为简洁空白页）。

### 远程代码
不使用远程代码。所有代码都打包在扩展里。

### 数据使用
- 勾选收集的数据类型：“网站内容”（读取用户自己的课程和作业信息，仅在本地使用）。
- 勾选声明：不出售给第三方；不用于与单一用途无关的目的；不用于评估信用。
- 隐私权政策网址：https://yokiwa.github.io/dueboard/privacy.html
