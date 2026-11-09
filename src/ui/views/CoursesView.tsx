import { useState } from 'react';
import type { Dashboard } from '../../core/dashboard';
import type { CompletedPlacement, Item } from '../../core/types';

const byDue = (a: Item, b: Item) =>
  (a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY) - (b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY);
import { Books } from '@phosphor-icons/react';
import { useT } from '../i18n';
import { CourseCard } from './CourseCard';
import { CourseDetail } from './CourseDetail';
import { DoneThisWeek } from './DoneThisWeek';
import type { SyllabusView } from '../components/SyllabusSuggestions';

export function CoursesView({
  dashboard,
  now,
  syllabus,
  completed = 'card',
}: {
  dashboard: Dashboard;
  now: Date;
  syllabus?: SyllabusView;
  /** Where finished work shows: at the bottom of each card, or in the "Done this week" section. */
  completed?: CompletedPlacement;
}) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = dashboard.courses.find((c) => c.id === openId);
  const itemsOf = (id: string) => dashboard.items.filter((i) => i.courseId === id).sort(byDue);
  if (dashboard.courses.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-db-border bg-db-surface px-6 py-16 text-center">
        <span aria-hidden="true" className="inline-flex size-12 items-center justify-center rounded-2xl bg-db-accent-soft text-db-accent">
          <Books size={24} />
        </span>
        <p className="m-0 max-w-[420px] body-3 text-db-muted">{t('courses.none')}</p>
      </div>
    );
  }
  return (
    <>
      <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
        {dashboard.courses.map((c) => (
          <CourseCard
            key={c.id}
            course={c}
            items={itemsOf(c.id)}
            links={dashboard.links.filter((l) => l.courseId === c.id)}
            now={now}
            showDone={completed === 'card'}
            onOpen={() => setOpenId(c.id)}
          />
        ))}
      </div>
      {completed === 'section' && <DoneThisWeek courses={dashboard.courses} items={dashboard.items} now={now} />}
      {open && (
        <CourseDetail
          course={open}
          items={itemsOf(open.id)}
          links={dashboard.links.filter((l) => l.courseId === open.id)}
          now={now}
          suggestions={syllabus?.suggestions.filter((s) => s.courseId === open.id)}
          syllabusUnreadable={syllabus?.unreadable.includes(open.id)}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
