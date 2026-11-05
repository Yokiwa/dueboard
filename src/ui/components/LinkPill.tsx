import type { CourseLink } from '../../core/types';

export function LinkPill({ link }: { link: CourseLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-lg border border-db-border bg-db-subtle px-[11px] py-[7px] text-[13px] font-medium text-db-text-2 no-underline hover:bg-db-track"
    >
      {link.label}
    </a>
  );
}
