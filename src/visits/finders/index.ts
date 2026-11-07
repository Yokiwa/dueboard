import { findDueUniversal } from './universal';
import { findDueWiley } from './wiley';
import type { FoundDue } from './types';

export type { FoundDue } from './types';
export { findDueUniversal } from './universal';
export { findDueWiley } from './wiley';
export { pageLines, pageTitle } from './lines';

/** Dedicated finders by registry id (platforms whose reader is 'page'). */
const DEDICATED: Record<string, (doc: Document, now: Date) => FoundDue | null> = {
  wileyplus: findDueWiley,
};

/** The platform's dedicated finder when there is one, then the universal finder. */
export function findDue(doc: Document, now: Date, platformId?: string): FoundDue | null {
  const dedicated = platformId ? DEDICATED[platformId] : undefined;
  return dedicated?.(doc, now) ?? findDueUniversal(doc, now);
}
