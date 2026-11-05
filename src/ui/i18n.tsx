import { createContext, useCallback, useContext, type ReactNode } from 'react';
import type { Lang } from '../core/time';

type Vars = Record<string, string | number | Date>;
type Message = string | ((v: Vars) => string);

const MIN = 60_000;
const agoZh = (v: Vars) => fmtAgo(v, (n, u) => (u === 'now' ? '刚刚' : `${n} ${{ m: '分钟', h: '小时', d: '天' }[u]}前`));
const agoEn = (v: Vars) => fmtAgo(v, (n, u) => (u === 'now' ? 'just now' : `${n} ${{ m: 'min', h: 'h', d: u === 'd' && n === 1 ? 'day' : 'days' }[u]} ago`));
function fmtAgo(v: Vars, word: (n: number, unit: 'now' | 'm' | 'h' | 'd') => string): string {
  const diff = (v.now as Date).getTime() - Date.parse(String(v.iso));
  if (diff < MIN) return word(0, 'now');
  if (diff < 60 * MIN) return word(Math.floor(diff / MIN), 'm');
  if (diff < 24 * 60 * MIN) return word(Math.floor(diff / (60 * MIN)), 'h');
  return word(Math.floor(diff / (24 * 60 * MIN)), 'd');
}

const zh = {
  'greeting.morning': '早上好',
  'greeting.afternoon': '下午好',
  'greeting.evening': '晚上好',
  'header.pendingWeek': (v: Vars) => `${v.greet}，本周还有 ${v.n} 项待交`,
  'header.noneWeek': (v: Vars) => `${v.greet}，本周没有待交作业`,
  'sync.synced': (v: Vars) => `已同步 · ${v.ago}`,
  'sync.never': '尚未同步',
  'sync.syncing': '同步中…',
  refresh: '刷新',
  ago: agoZh,
  'banner.label': '下一个截止',
  'banner.submit': '去提交',
  'tabs.courses': '课程',
  'tabs.calendar': '日历',
  'tabs.todo': '待办',
  'tabs.label': '视图',
  'chips.within48': (v: Vars) => `48 小时内 ${v.n} 项`,
  'chips.week': (v: Vars) => `本周 ${v.n} 项`,
  'source.relogin': (v: Vars) => `${v.name} 需要重新登录`,
  'source.loginButton': '去登录',
  'source.stale': (v: Vars) => `${v.name} 同步失败 · 显示的是 ${v.ago}的数据`,
  'source.failed': (v: Vars) => `${v.name} 同步失败`,
  'source.manual': '手动添加',
  'badge.done': '已完成',
  'badge.submitted': '已提交',
  'badge.noDue': '无截止日期',
  'course.empty': '近期没有待交作业',
  'course.links': '快捷入口',
  'course.partial': '部分数据未同步',
  'course.more': (v: Vars) => `还有 ${v.n} 项`,
  'course.open': (v: Vars) => `查看 ${v.code} 详情`,
  'courses.none': '还没有课程。同步完成后，你的课程会出现在这里。',
  'detail.items': '作业',
  'detail.noItems': '这门课还没有作业',
  'detail.links': '资料与平台',
  'detail.close': '关闭',
  'cat.lms': '课程平台',
  'cat.homework': '作业平台',
  'cat.textbook': '教材',
  'cat.discussion': '讨论区',
  'cat.website': '课程网站',
  'cat.other': '其他',
  'error.fallback': '页面出错了，请刷新重试。',
} satisfies Record<string, Message>;

export type MessageKey = keyof typeof zh;

const en: Record<MessageKey, Message> = {
  'greeting.morning': 'Good morning',
  'greeting.afternoon': 'Good afternoon',
  'greeting.evening': 'Good evening',
  'header.pendingWeek': (v) => `${v.greet}, ${v.n} due this week`,
  'header.noneWeek': (v) => `${v.greet}, nothing due this week`,
  'sync.synced': (v) => `Synced · ${v.ago}`,
  'sync.never': 'Not synced yet',
  'sync.syncing': 'Syncing…',
  refresh: 'Refresh',
  ago: agoEn,
  'banner.label': 'NEXT DEADLINE',
  'banner.submit': 'Open',
  'tabs.courses': 'Courses',
  'tabs.calendar': 'Calendar',
  'tabs.todo': 'To-do',
  'tabs.label': 'View',
  'chips.within48': (v) => `${v.n} due in 48 h`,
  'chips.week': (v) => `${v.n} this week`,
  'source.relogin': (v) => `${v.name} needs you to sign in again`,
  'source.loginButton': 'Sign in',
  'source.stale': (v) => `${v.name} sync failed · showing data from ${v.ago}`,
  'source.failed': (v) => `${v.name} sync failed`,
  'source.manual': 'Added by you',
  'badge.done': 'Done',
  'badge.submitted': 'Submitted',
  'badge.noDue': 'No due date',
  'course.empty': 'Nothing due soon',
  'course.links': 'Shortcuts',
  'course.partial': 'Some data did not sync',
  'course.more': (v) => `${v.n} more`,
  'course.open': (v) => `Open ${v.code} details`,
  'courses.none': 'No courses yet. They will appear here after the first sync.',
  'detail.items': 'Assignments',
  'detail.noItems': 'No assignments in this course yet',
  'detail.links': 'Resources & platforms',
  'detail.close': 'Close',
  'cat.lms': 'Course site',
  'cat.homework': 'Homework platforms',
  'cat.textbook': 'Textbooks',
  'cat.discussion': 'Discussion',
  'cat.website': 'Course websites',
  'cat.other': 'Other',
  'error.fallback': 'Something went wrong. Please reload the page.',
};

export const messages: Record<Lang, Record<MessageKey, Message>> = { zh, en };

export function translate(lang: Lang, key: MessageKey, vars: Vars = {}): string {
  const m = messages[lang][key];
  return typeof m === 'function' ? m(vars) : m;
}

export function resolveLang(setting: 'auto' | Lang, navigatorLanguage: string): Lang {
  if (setting !== 'auto') return setting;
  return navigatorLanguage.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

const LangContext = createContext<Lang>('zh');

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

export function useT() {
  const lang = useLang();
  return useCallback((key: MessageKey, vars?: Vars) => translate(lang, key, vars), [lang]);
}
