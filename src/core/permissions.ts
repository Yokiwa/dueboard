import { platformOfLink } from './platforms';
import { hostMatches, originPatterns, PLATFORMS, platformByHost, type PlatformDef } from './platformRegistry';
import type { StoreShape } from './types';

/** Sites DueBoard needs to sync at all (the manifest's host_permissions). */
export const REQUIRED_ORIGINS = ['https://purdue.brightspace.com/*', 'https://www.gradescope.com/*', 'https://mylab.pearson.com/*'];
const SNOOZE_MS = 7 * 86_400_000;

/** A site-access request to show the student: a known platform, or a bare host DueBoard landed on. */
export interface AccessAsk {
  key: string;
  label: string;
  origins: string[];
}

/** Whether the granted origin patterns (permissions.getAll().origins) cover a host. */
export function originAllowed(granted: string[], hostname: string): boolean {
  return granted.some((pattern) => {
    if (pattern === '<all_urls>') return true;
    const m = /^(?:\*|https?):\/\/([^/]+)\//.exec(pattern);
    if (!m) return false;
    return m[1] === '*' || hostMatches(m[1]!, hostname);
  });
}

const platformAllowed = (def: PlatformDef, granted: string[]) => def.hosts.every((h) => originAllowed(granted, h.replace(/^\*\./, '')));
const asksFor = (def: PlatformDef): AccessAsk => ({ key: def.id, label: def.label, origins: originPatterns(def) });

/**
 * Platforms whose due dates DueBoard could read with one more site permission: the ones the student's Brightspace
 * courses launch, plus hosts a visit landed on without access. Skips granted ones, background-read and
 * deadline-free platforms, and anything the student postponed with "Not now".
 */
export function accessToAsk(store: StoreShape, granted: string[], now: Date): AccessAsk[] {
  const out = new Map<string, AccessAsk>();
  const add = (ask: AccessAsk) => {
    const until = store.visitState.snoozed[ask.key];
    if (until && Date.parse(until) > now.getTime()) return;
    if (!out.has(ask.key)) out.set(ask.key, ask);
  };
  for (const l of store.snapshots.brightspace?.links ?? []) {
    const def = platformOfLink(l.title, l.url);
    if (!def || def.reader === 'fetch' || def.reader === 'none' || platformAllowed(def, granted)) continue;
    add(asksFor(def));
  }
  for (const host of store.visitState.needsPermission) {
    if (originAllowed(granted, host)) continue;
    const def = platformByHost(host);
    add(def ? asksFor(def) : { key: host, label: host, origins: [`https://${host}/*`] });
  }
  return [...out.values()];
}

export function missingRequired(granted: string[]): string[] {
  return REQUIRED_ORIGINS.filter((o) => !granted.includes(o) && !originAllowed(granted, new URL(o.replace('*', 'x')).hostname));
}

export function snoozeUntil(now: Date): string {
  return new Date(now.getTime() + SNOOZE_MS).toISOString();
}

/** The optional site access the student gave, grouped by platform, for Settings. */
export function grantedPlatforms(granted: string[]): AccessAsk[] {
  const out = new Map<string, AccessAsk>();
  for (const origin of granted) {
    if (REQUIRED_ORIGINS.includes(origin)) continue;
    const m = /^https?:\/\/([^/]+)\//.exec(origin);
    if (!m) continue;
    const glob = m[1]!;
    if (glob === '*') {
      out.set('*', { key: '*', label: 'All websites', origins: [origin] });
      continue;
    }
    const def = PLATFORMS.find((p) => p.hosts.includes(glob));
    const key = def?.id ?? glob;
    const prev = out.get(key);
    if (prev) prev.origins.push(origin);
    else out.set(key, { key, label: def?.label ?? glob, origins: [origin] });
  }
  return [...out.values()];
}
