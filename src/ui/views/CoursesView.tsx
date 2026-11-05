import { useState } from 'react';
import type { Dashboard } from '../../core/dashboard';
import type { Item } from '../../core/types';

const byDue = (a: Item, b: Item) =>
  (a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY) - (b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY);
import { useT } from '../i18n';
import { CourseCard } from './CourseCard';
import { CourseDetail } from './CourseDetail';

export function CoursesView({ dashboard, now }: { dashboard: Dashboard; now: Date }) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = dashboard.courses.find((c) => c.id === openId);
  const itemsOf = (id: string) => dashboard.items.filter((i) => i.courseId === id).sort(byDue);
  if (dashboard.courses.length === 0) {
    return <p className="rounded-[14px] border border-db-border bg-db-surface p-8 text-center text-db-muted">{t('courses.none')}</p>;
  }
  return (
    <>
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
        {dashboard.courses.map((c) => (
          <CourseCard
            key={c.id}
            course={c}
            items={itemsOf(c.id)}
            links={dashboard.links.filter((l) => l.courseId === c.id)}
            now={now}
            onOpen={() => setOpenId(c.id)}
          />
        ))}
      </div>
      {open && (
        <CourseDetail
          course={open}
          items={itemsOf(open.id)}
          links={dashboard.links.filter((l) => l.courseId === open.id)}
          now={now}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
