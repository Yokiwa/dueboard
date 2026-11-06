# DueBoard 设计文档

- 日期：2026-11-04
- 状态：待审阅
- 界面效果图：https://claude.ai/artifact/XWfaHHvt7Ps131t3qctoyZ（“定稿：A + 下一个截止横条”）

---

## 1. 背景与目标

普渡大学（Purdue）的学生要看作业，得先登录 Brightspace，再一门一门点进课程；很多作业和教材还分散在 Gradescope、WebAssign、Pearson、McGraw-Hill、Piazza/Ed、课程自己的网站等平台上，每个都要单独登录、单独查看。

**DueBoard 是一个 Chrome 浏览器插件**：打开新标签页，就能在一个页面里看到所有课程的作业、截止日期、教材和各平台入口。

### 成功标准（第一版）

1. 作者本人连续使用一周，Brightspace 和 Gradescope 上的作业没有遗漏，截止时间全部正确。
2. 5–10 位内测同学中，至少一半在两周后仍然在用。
3. 打开新标签页后 1 秒内显示数据（先显示本地缓存，再在后台同步）。
4. 任何一个平台同步失败，都不会导致整个页面无法使用。

### 目标用户

- 第一阶段：作者本人和身边同学（普渡大学，西拉法叶校区）。
- 第二阶段：全校学生（2027 年 1 月春季学期开学时推广）。
- 主要在电脑上使用（Chrome / Edge）。

---

## 2. 功能范围

### 2.1 第一版要做的

| 功能 | 说明 |
|---|---|
| 新标签页面板 | 默认替换 Chrome 新标签页。可在设置里改成“简洁空白页”（Chrome 不允许插件在运行时恢复原生新标签页，所以“关闭”的效果是新标签页只显示一个空白页和一个“打开 DueBoard”按钮）；完整面板始终可以从工具栏弹窗打开 |
| 工具栏弹窗 | 精简版：“下一个截止” + 最近 5 项待办 + “打开完整面板” |
| “下一个截止”横条 | 面板顶部显示最近一个未完成作业，带实时倒计时和“去提交”按钮 |
| 课程卡片视图（首页） | 每门课一张卡片：课程代码、名称、颜色点、接下来 2–3 项作业（带倒计时标签），底部是各平台快捷按钮。点开卡片看这门课的全部作业和全部资料链接 |
| 日历视图 | 周视图 / 月视图，所有截止日期按课程颜色显示 |
| 待办清单视图 | 所有作业按截止时间排序，可手动勾选“已完成”；检测到已提交的自动打勾 |
| 自动读取 Brightspace | 课程列表、作业（Assignments）、测验（Quizzes）、日历事件、课程内容里的教材和平台链接 |
| 自动读取 Gradescope | 课程列表、作业、截止时间、提交状态 |
| 手动添加 | 读不到的作业（如 WebAssign 上的），以及课程网站、Piazza/Ed 等链接，用户自己添加，永久保存在本地 |
| 设置 | 显示/隐藏课程、修改课程颜色、界面语言（跟随浏览器 / 中文 / English）、新标签页模式（面板 / 简洁空白页）、手动合并课程 |
| 同步状态 | 显示“已同步 · 5 分钟前”；每个平台单独显示状态；手动“刷新”按钮 |
| 反馈入口 | 设置页里的“反馈”链接，指向一个 Google 表单（内测前由作者创建） |

### 2.2 第一版不做的

- 截止前提醒（计划放在第二版）
- 手机版 / 网站版
- 成绩查看
- 自动读取 WebAssign / Pearson / McGraw-Hill 的作业（如果老师把截止日期放进了 Brightspace 日历，会自动显示；其余靠手动添加）
- 多所学校支持（只支持 `purdue.brightspace.com`）
- 云同步 / 账号系统

---

## 3. 界面设计

以效果图“定稿：A + 下一个截止横条”为准。

- **风格**：清爽极简。浅灰背景（#F7F8FA）、白色卡片、1px 浅色边框、14px 圆角。
- **字体**：Inter + Noto Sans SC；倒计时数字用 JetBrains Mono（等宽字体）。
- **颜色**：
  - 每门课自动分配一种颜色（可在设置里改），只用在课程色点、日历色块等小面积位置。
  - 截止状态标签：48 小时内用红色（#FEE2E2 底 / #B91C1C 字）；7 天内用琥珀色（#FEF3C7 / #92400E）；更远的用灰色。
  - “下一个截止”横条：浅琥珀色底（#FFF8EB）、琥珀色边框，倒计时字色 #B45309。
- **页面结构**（从上到下）：日期 + 问候语 + 同步状态 → “下一个截止”横条 → 视图切换（课程 / 日历 / 待办）+ 统计标签 → 主内容区。
- **课程卡片排序**：按“最近一项未完成作业的截止时间”从近到远；没有待交作业的课程排在最后，显示“近期没有待交作业”。
- **自适应**：卡片网格按窗口宽度自动排成 1–4 列。
- **可访问性**：文字对比度至少 4.5:1；所有可点击的东西都是真正的按钮或链接，可以用键盘操作。
- **深色模式**：第一版不做，代码里所有颜色都用变量（design tokens）定义，方便以后加。

---

## 4. 技术架构

### 4.1 技术选型

| 用途 | 选择 | 原因 |
|---|---|---|
| 语言 | TypeScript | 带类型检查，能少出错 |
| 插件框架 | WXT | 自动处理 Chrome 插件（Manifest V3）的繁琐配置，支持热更新开发 |
| 界面 | React + Tailwind CSS | 资料多，搭界面快 |
| 日期处理 | date-fns | 处理时区、倒计时、“3 天后”这类文字 |
| 测试 | Vitest | 和 WXT 配合好，运行快 |
| 多语言 | 自己写的小型词典（`src/ui/i18n.ts`） | 中文 / 英文；支持在设置里即时切换（Chrome 自带的 i18n 只能跟随浏览器语言，不能即时切换） |

### 4.2 模块划分

```
src/
├─ connectors/          ① 数据采集：每个平台一个模块，互不影响
│  ├─ brightspace/
│  └─ gradescope/
├─ core/                ② 整理合并：统一数据格式、课程匹配、去重、排序
├─ storage/             ③ 本地存储：读写 chrome.storage.local
├─ sync/                同步调度：什么时候同步、记录每个平台的同步状态
├─ entrypoints/         ④ 界面入口（WXT 约定）
│  ├─ newtab/           新标签页面板
│  ├─ popup/            工具栏弹窗
│  ├─ options/          设置页
│  ├─ background.ts     后台：定时同步
│  └─ offscreen/        后台解析网页用（见 4.5）
└─ ui/                  共用界面组件（课程卡片、倒计时、日历……）
```

每个 connector 对外只暴露一个函数：

```ts
interface Connector {
  id: 'brightspace' | 'gradescope';
  fetchAll(): Promise<ConnectorResult>;
}

type ConnectorResult =
  | { ok: true; courses: RawCourse[]; items: RawItem[]; links: RawLink[] }
  | { ok: false; reason: 'not_logged_in' | 'network' | 'parse_error'; detail?: string };
```

界面和合并逻辑不关心数据是从哪个平台、用什么方式读来的。

### 4.3 统一数据格式

```ts
interface Course {
  id: string;            // DueBoard 内部 ID
  code: string;          // 例如 "CS 18000"，从课程名中提取
  name: string;          // 课程名称
  term?: string;         // 学期，例如 "Fall 2026"
  sources: { brightspace?: string; gradescope?: string }; // 各平台上的课程 ID
  color: string;         // 显示颜色
  hidden: boolean;
}

interface Item {
  id: string;
  courseId: string;
  title: string;
  type: 'assignment' | 'quiz' | 'exam' | 'event' | 'manual';
  dueAt: string | null;  // ISO 8601（UTC）；界面按本地时区显示
  url: string;           // 点击后打开的页面（“去提交”）
  sources: ('brightspace' | 'gradescope' | 'manual')[];
  submitted: boolean;    // 平台检测到的提交状态
  doneByUser: boolean;   // 用户手动勾选
}

interface CourseLink {
  courseId: string;
  label: string;         // 例如 "Pearson Mastering"
  url: string;
  category: 'textbook' | 'homework' | 'discussion' | 'website' | 'lms' | 'other';
  source: 'brightspace' | 'manual';
}
```

### 4.4 Brightspace 数据采集

- **方式**：插件申请 `https://purdue.brightspace.com/*` 访问权限，在用户已登录的状态下，带上浏览器自己的登录信息调用 Brightspace（D2L）的 REST 接口。只发 GET 请求，只读不写。
- **接口版本**：先调用 `/d2l/api/versions/` 查询学校服务器支持的版本，再选用最新的 `lp` 和 `le` 版本。
- **读取内容**：
  1. 课程列表：`/d2l/api/lp/{ver}/enrollments/myenrollments/?orgUnitTypeId=3`（处理分页），只保留当前学期且未结束的课程。
  2. 作业：`/d2l/api/le/{ver}/{orgUnitId}/dropbox/folders/`，取截止时间；只对截止时间在“过去 7 天到未来 30 天”之间的作业，查询本人提交记录来判断是否已提交。
  3. 测验：`/d2l/api/le/{ver}/{orgUnitId}/quizzes/`。
  4. 日历：`/d2l/api/le/{ver}/calendar/events/myEvents/`（时间范围：过去 7 天到未来 60 天），用来拿到老师手动加进日历的其他平台作业的截止日期。
  5. 课程资料链接：`/d2l/api/le/{ver}/{orgUnitId}/content/toc`。按网址域名和标题关键词识别平台链接（见附录 A），分类为教材、作业平台、讨论区等。
- **判断是否登录**：接口返回 401/403，或被重定向到登录页 → 结果为 `not_logged_in`。
- **请求频率**：并发不超过 4 个；单次同步总请求数约等于“课程数 × 4 + 3”。
- **课程代码提取**：用正则 `([A-Z]{2,5})\s?(\d{3,5})` 从课程名中提取，例如 `CS 18000`。

### 4.5 Gradescope 数据采集

- **方式**：申请 `https://www.gradescope.com/*` 访问权限，在用户已登录的状态下请求以下 HTML 页面并解析：
  1. 首页 `https://www.gradescope.com/`：课程列表（首页按学期分组，只取最新的一个学期）。
  2. 课程页 `/courses/{id}`：作业表格，包括标题、截止时间（页面里的时间属性）、提交状态。
- **解析位置**：所有同步都在后台 service worker 里进行（面板只是发消息请后台同步）。service worker 不能解析 HTML，所以借助 Chrome 的 offscreen document（用途声明为 `DOM_PARSER`）解析。
- **判断是否登录**：被重定向到登录页，或页面里找不到课程列表 → `not_logged_in`。
- **防改版**：解析逻辑集中在一个文件里；用保存下来的示例页面做测试（见第 7 节）。

### 4.6 整理合并（core）

1. **课程匹配**：Gradescope 课程和 Brightspace 课程的课程代码相同，就视为同一门课。匹配不上的 Gradescope 课程单独显示一张卡片，用户可以在设置里手动合并。
2. **作业去重**：满足以下全部条件，视为同一项作业并合并成一条：
   - 属于同一门课；
   - 标题规范化后（转小写，去掉标点和空格）相同，或者一个包含另一个；
   - 截止时间相差不超过 1 小时。

   合并后：`sources` 取并集；`submitted` 只要任一来源为已提交就是 true；`url` 优先用 Gradescope 的（因为大多数情况下要去那里交）。
3. **显示范围**：截止时间在过去 7 天之后的所有作业（没有截止时间的也显示）；已过期但未完成的标为“已逾期”；已完成的默认收起。
4. **排序**：未完成的按截止时间从近到远；没有截止时间的排在最后。

### 4.7 本地存储

全部存放在 `chrome.storage.local`，不上传到任何服务器：

| 键 | 内容 |
|---|---|
| `snapshots` | 每个平台最近一次**成功**同步的原始结果（`{ brightspace?, gradescope? }`，各含课程、作业、链接和同步时间）。某个平台同步失败时保留它上一次的快照，所以界面能继续显示旧数据 |
| `manualItems` | 用户手动添加的 Item[]（同步时不会被覆盖） |
| `manualLinks` | 用户手动添加的 CourseLink[] |
| `userState` | 每项作业的“已完成”勾选（按来源作业 ID 记录，合并后只要任一来源被勾选就算完成）、课程颜色、隐藏的课程、手动合并规则 |
| `settings` | 语言、是否替换新标签页 |
| `syncMeta` | 每个平台的上次成功时间、上次错误 |

界面显示的课程、作业、链接，是每次读取时由 `snapshots` + 手动数据 + `userState` 现场合并算出来的（见 4.6），不单独存一份。

存储结构带版本号（`schemaVersion`），以后升级插件时可以自动迁移旧数据。

### 4.8 同步调度

- **打开面板时**：先立即显示缓存的数据；如果距上次同步超过 5 分钟，在后台同步，完成后自动刷新界面。
- **后台**：用 `chrome.alarms` 每 30 分钟同步一次。
- **手动**：点“刷新”按钮。
- 两个平台同时同步，互不等待；同一时间只允许一次同步在运行。

### 4.9 插件权限

| 权限 | 用途 |
|---|---|
| `storage` | 保存数据 |
| `alarms` | 定时同步 |
| `offscreen` | 后台解析 Gradescope 页面 |
| 访问 `https://purdue.brightspace.com/*` | 读取 Brightspace 数据 |
| 访问 `https://www.gradescope.com/*` | 读取 Gradescope 数据 |
| 替换新标签页 | 显示面板 |

不申请“读取所有网站”权限，也不申请 `tabs`、`cookies` 权限。

---

## 5. 出错处理

| 情况 | 界面表现 |
|---|---|
| 某个平台登录过期 | 横幅提示“Gradescope 需要重新登录”，带一个按钮，点击后在新标签页打开登录页；其他平台的数据照常显示 |
| 网络失败 / 平台改版导致解析失败 | 继续显示上次成功同步的数据，标注“Gradescope 同步失败 · 显示的是 2 小时前的数据”；记录错误详情，方便反馈时附上 |
| 第一次安装、还没有任何数据 | 欢迎页：分三步引导用户确认已登录 Brightspace 和 Gradescope，然后点“开始同步” |
| 某门课的接口报错 | 跳过这门课，其他课程照常显示；这门课的卡片上标注“部分数据未同步” |
| 本地存储读写失败 | 显示错误提示，不让整个页面崩溃（界面最外层有错误兜底组件） |

---

## 6. 隐私与合规

- 所有数据只保存在用户本地浏览器里，不上传、不收集、没有统计分析。
- 不接触、不保存用户密码，只复用浏览器已有的登录状态。
- 只发送 GET（只读）请求，同步频率低（30 分钟一次）。
- 名字和 Logo 里不使用 “Purdue” 字样、学校校徽或学校代表色；介绍里可以写“为普渡学生设计”，并注明“非官方产品”。
- 正式推广前，查阅普渡 IT 的使用规定；必要时给 IT 部门发邮件说明。
- 提供隐私政策页面（托管在 GitHub Pages）。

---

## 7. 测试

1. **自动测试（Vitest）**
   - connectors：用保存下来的、去掉个人信息的 Brightspace 接口返回数据和 Gradescope 页面作为测试数据，检查解析结果。
   - core：课程匹配、作业去重、排序、显示范围、“3 天后”这类文字生成。
   - storage：数据结构迁移。
2. **手动测试**：作者本人用真实账号连续使用一周，对照各平台网页逐项核对。
3. **内测**：5–10 位同学，尽量覆盖不同专业和课程。

测试数据由作者在自己的浏览器里导出（我会提供导出步骤和去除个人信息的方法），存放在 `tests/fixtures/`。

---

## 8. 发布

1. 代码托管在 GitHub，公开仓库，MIT 开源协议。
2. 用 GitHub Pages 做项目介绍网站，同时放隐私政策。
3. 注册 Chrome Web Store 开发者账号（一次性 5 美元）。
4. 先以“不公开”方式上架，只有拿到链接的人能安装，用于内测；内测稳定后改为公开上架。
5. 版本号规则：`主版本.次版本.修订号`（例如 1.0.0）。每次发版都记录更新说明。
6. （可选）同时上架 Microsoft Edge 加载项商店。

---

## 9. 推广计划

| 时间 | 阶段 | 内容 |
|---|---|---|
| 2026 年 11 月 | 开发 | 完成第一版，作者自用 |
| 12 月初（期末前） | 内测 | 5–10 位同学使用；通过反馈表单收集问题 |
| 12 月（寒假） | 准备上线 | 修复问题，开发反馈里呼声最高的功能（预计是截止前提醒）；制作 30 秒演示视频或动图、商店截图、介绍网站 |
| 2027 年 1 月开学第一周 | 正式上线 | 在中国学生微信群、CSSA、大课的 Discord / GroupMe 群、Reddit r/Purdue 发布 |
| 之后 | 持续运营 | 每周查看 Chrome 开发者后台的使用人数；根据反馈持续改进 |

---

## 10. 风险与应对

| 风险 | 应对 |
|---|---|
| 插件后台带登录信息请求 Brightspace / Gradescope 被浏览器的 Cookie 规则拦截 | 开发第一步先专门验证这一点；如果被拦截，改为在已打开的平台页面里，由页面脚本代为请求；Brightspace 还可以退回到日历订阅链接（iCal）方案 |
| 普渡 Brightspace 关闭了部分接口，或接口版本不同 | 启动时查询支持的版本；某个接口不可用时跳过，只用其他接口的数据 |
| Gradescope 改版导致解析失败 | 解析逻辑集中在一处、有测试覆盖；界面显示缓存数据并提示；修复后发新版本，商店会自动更新给用户 |
| 学校或平台不允许这类插件 | 推广前先查政策；本插件只读、频率低、不上传数据，风险较小 |
| 作者零基础，后期难以维护 | 代码分模块、写清楚注释、自动测试覆盖核心逻辑；每一步都配说明文档 |

---

## 附录 A：平台链接识别规则

| 分类 | 显示名称 | 域名关键词 |
|---|---|---|
| homework | Gradescope | `gradescope.com` |
| homework | WebAssign | `webassign.net` |
| homework | Pearson | `pearson.com`、`mylab`、`mastering` |
| homework | McGraw-Hill Connect | `mheducation.com`、`connect.mheducation` |
| textbook | Cengage | `cengage.com` |
| textbook | zyBooks | `zybooks.com` |
| discussion | Piazza | `piazza.com` |
| discussion | Ed | `edstem.org` |
| website | 课程网站 | 其他外部链接，由用户手动确认 |

如果是 Brightspace 里的外部工具（LTI）链接，网址里看不出平台，就按标题关键词（Pearson、Connect、WebAssign……）识别。

---

## 变更记录

### 1.1.0（2026-11，根据作者试用反馈）
- **不再替换新标签页**：面板是一个独立的扩展页面（`dashboard.html`），从工具栏弹窗的“打开完整面板”进入；首次安装时自动打开一次，显示欢迎引导。设置里的“新标签页模式”取消，manifest 不再声明 `chrome_url_overrides`。
- **完成状态**：卡片和待办清单里，勾选后的作业原地打勾、加删除线，不再消失；已完成且截止时间已过的才移出卡片或收进“已完成”。横条上的“✓ 完成”按钮保留撤销提示。
- **卡片只放有截止日期的作业**；没有截止日期的（如旧测验）只在课程详情和待办清单的“无截止日期”分组里显示。
- **非课程条目默认隐藏**：没有课程代码的 Brightspace 条目（迎新、培训、辅导项目等）默认不显示，可在设置中勾选显示（`userState.shown`）。Gradescope 课程始终视为课程。
- **课程标题**去掉纯数字的班级编号。
- **平台入口**：识别 WileyPLUS；Brightspace 内的 quickLink（`type=lti`）和课程内容页链接，只要标题点名已知平台，也生成入口按钮；没有 Url 的内容条目使用其内容页地址。

### 1.1.1（2026-11）
- 工具栏弹窗新增折叠的“开发者工具”：**导出当前页面**（需要 `activeTab` + `scripting`，只在用户点击时读取当前标签页，脱敏后下载到本地）和**导出课程链接**（插件保存的 Brightspace 课程内容链接）。用于收集 Pearson、Wiley 等平台的真实页面结构，为后续直接读取这些平台的作业做准备。

### 1.2.0（2026-11）
- **Pearson MyLab connector**：读取 `https://mylab.pearson.com/Student/DoAssignments.aspx?view=all`（新增 host 权限），解析作业表格（截止日期 `MM/DD/YY` + `h:mmam/pm`，按浏览器本地时间）。已截止且不能再做的作业视为完成。只有当某门课的内容里有 Pearson 入口（或之前同步过 Pearson）时才同步。会话过期时提示“从 Brightspace 重新打开一次”，按钮使用该课程的 Pearson 启动链接；作业的“去提交”也走这个启动链接。Pearson 课程挂到含 Pearson 入口的那门课上，没有则单独一张卡片。
- **同一课程代码的多个 Brightspace 课程（LEC + REC）合并成一张卡片**，优先以 LEC 为主。
- **课程内容里的作业入口变成作业**：标题含 “HW + 数字 / Homework + 数字” 的外部工具（LTI）条目，排除 “Copy of / study purposes / practice / solutions”。日期取条目自带的截止日期，否则与日历里同名事件合并取日期。
- 识别 Macmillan Achieve 入口。
