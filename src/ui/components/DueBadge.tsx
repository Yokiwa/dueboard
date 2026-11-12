import { relativeDue, urgency } from '../../core/time';
import type { Item } from '../../core/types';
import { useT } from '../i18n';

type Tone = 'overdue' | 'urgent' | 'soon' | 'normal' | 'done';
const TONE_CLASS: Record<Tone, string> = {
  overdue: 'bg-db-urgent-bg text-db-urgent-fg',
  urgent: 'bg-db-urgent-bg text-db-urgent-fg',
  soon: 'bg-db-soon-bg text-db-soon-fg',
  normal: 'bg-db-normal-bg text-db-normal-fg',
  done: 'bg-db-normal-bg text-db-faint',
};

export interface DueBadgeProps {
  dueAt: string | null;
  done: boolean;
  submitted?: boolean;
  /** Shown after the label of done work ("Submitted · 18/25"). */
  score?: Item['score'];
  /** Where done work was seen, for the hint. */
  doneBy?: Item['doneBy'];
  now: Date;
}

export function DueBadge({ dueAt, done, submitted = false, score, doneBy, now }: DueBadgeProps) {
  const t = useT();
  let tone: Tone;
  let label: string;
  if (done) [tone, label] = ['done', t('badge.done')];
  else if (submitted) [tone, label] = ['done', t('badge.submitted')];
  else if (!dueAt) [tone, label] = ['normal', t('badge.noDue')];
  else {
    const d = new Date(dueAt);
    [tone, label] = [urgency(d, now), relativeDue(d, now)];
  }
  const showScore = tone === 'done' && score;
  if (showScore) label = `${label} · ${score.text}`;
  const hint = showScore ? t('badge.scoreFrom', { from: score.from }) : tone === 'done' && doneBy?.source ? t('badge.submittedOn', { source: doneBy.source }) : undefined;
  return (
    <span data-tone={tone} title={hint} className={`shrink-0 rounded-md px-2 py-1 caption-3 whitespace-nowrap tabular-nums ${TONE_CLASS[tone]}`}>
      {label}
    </span>
  );
}
