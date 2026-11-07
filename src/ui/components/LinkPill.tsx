import { ArrowUpRight } from '@phosphor-icons/react';
import type { CourseLink } from '../../core/types';

export function LinkPill({ link }: { link: CourseLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="db-press group inline-flex items-center gap-1 rounded-lg border border-db-border bg-db-subtle px-3 py-2 caption-4 text-db-text-2 no-underline hover:border-db-faint hover:bg-db-hover"
    >
      {link.label}
      <ArrowUpRight aria-hidden="true" size={12} weight="bold" className="text-db-faint transition-transform duration-300 ease-db group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </a>
  );
}
