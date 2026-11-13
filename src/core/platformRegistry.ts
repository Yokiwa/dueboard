import type { LinkCategory } from './types';

/**
 * How DueBoard gets due dates from a platform:
 * - fetch: background requests with the student's session (Gradescope, Pearson)
 * - page: a visit with a dedicated page finder
 * - universal: a visit with the universal "Due …" finder
 * - syllabus: a visit that reads the page as a syllabus
 * - none: the platform has no deadlines (discussion boards)
 */
export type Reader = 'fetch' | 'page' | 'universal' | 'syllabus' | 'none';

export interface PlatformDef {
  id: string;
  label: string;
  category: LinkCategory;
  /** Host globs: "*.aleks.com" matches aleks.com and any subdomain; a plain host matches only itself. */
  hosts: string[];
  /** Identifies a Brightspace LTI launch whose URL doesn't show the platform. */
  title: RegExp;
  reader: Reader;
  /** Launches of this platform are never opened automatically (timed or proctored attempts). */
  neverOpen?: boolean;
}

const p = (id: string, label: string, category: LinkCategory, hosts: string[], title: RegExp, reader: Reader, neverOpen?: boolean): PlatformDef => ({
  id,
  label,
  category,
  hosts,
  title,
  reader,
  ...(neverOpen ? { neverOpen } : {}),
});

/** Every platform DueBoard knows. Ordered: the first match wins. 1.0 entries come first, unchanged. */
export const PLATFORMS: PlatformDef[] = [
  p('gradescope', 'Gradescope', 'homework', ['*.gradescope.com'], /gradescope/i, 'fetch'),
  p('webassign', 'WebAssign', 'homework', ['*.webassign.net', '*.webassign.com'], /webassign/i, 'universal'),
  p('achieve', 'Achieve', 'homework', ['*.macmillanlearning.com'], /\bachieve\b|macmillan/i, 'universal'),
  p(
    'pearson',
    'Pearson',
    'homework',
    ['mylab.pearson.com', 'socket.pearsoned.com', '*.pearson.com', '*.pearsoncmg.com', '*.pearsonmylabandmastering.com', '*.masteringphysics.com', '*.masteringchemistry.com'],
    /pearson|mylab|mastering/i,
    'fetch',
  ),
  p('connect', 'McGraw-Hill Connect', 'homework', ['*.mheducation.com'], /mcgraw|connect\b/i, 'universal'),
  p('cengage', 'Cengage', 'textbook', ['*.cengage.com'], /cengage|mindtap|\bowl\b/i, 'universal'),
  p('zybooks', 'zyBooks', 'textbook', ['*.zybooks.com'], /zybook/i, 'universal'),
  p('wileyplus', 'WileyPLUS', 'homework', ['education.wiley.com', '*.wileyplus.com', '*.wiley.com'], /wiley/i, 'page'),
  p('piazza', 'Piazza', 'discussion', ['*.piazza.com'], /piazza/i, 'none'),
  p('ed', 'Ed', 'discussion', ['*.edstem.org'], /\bed (discussion|stem)\b|edstem/i, 'none'),
  p('aleks', 'ALEKS', 'homework', ['*.aleks.com'], /\baleks\b/i, 'universal'),
  p('norton', 'Norton', 'homework', ['*.wwnorton.com'], /inquizitive|smartwork|norton/i, 'universal'),
  p('tophat', 'Top Hat', 'homework', ['*.tophat.com'], /top\s?hat/i, 'universal'),
  p('perusall', 'Perusall', 'homework', ['*.perusall.com'], /perusall/i, 'universal'),
  p('packback', 'Packback', 'homework', ['*.packback.co'], /packback/i, 'universal'),
  p('hawkes', 'Hawkes Learning', 'homework', ['*.hawkeslearning.com'], /hawkes/i, 'universal'),
  p('vhl', 'Vista Higher Learning', 'homework', ['*.vhlcentral.com'], /\bvhl\b|vista higher/i, 'universal'),
  p('sapling', 'Sapling', 'homework', ['*.saplinglearning.com'], /sapling/i, 'universal'),
  p('expertta', 'Expert TA', 'homework', ['*.theexpertta.com'], /expert\s?ta\b/i, 'universal'),
  p('knewton', 'Knewton Alta', 'homework', ['*.knewtonalta.com'], /knewton/i, 'universal'),
  p('prairielearn', 'PrairieLearn', 'homework', ['*.prairielearn.com', '*.prairielearn.org'], /prairielearn/i, 'universal'),
  p('vocareum', 'Vocareum', 'homework', ['*.vocareum.com'], /vocareum/i, 'universal'),
  p('goreact', 'GoReact', 'homework', ['*.goreact.com'], /goreact/i, 'universal'),
  p('simplesyllabus', 'Simple Syllabus', 'website', ['*.simplesyllabus.com'], /simple\s?syllabus/i, 'syllabus'),
  p('labflow', 'LabFlow', 'homework', ['*.labflow.com'], /labflow/i, 'universal'),
  p('beyondlabz', 'BeyondLabz', 'homework', ['*.beyondlabz.com'], /beyond\s*labz/i, 'universal'),
  // No known host: recognized by launch title only.
  p('circuit', 'Circuit', 'homework', [], /\bcircuit\b.*(peer|review)|peer review.*\bcircuit\b/i, 'universal'),
  p('variate', 'Variate', 'homework', [], /\bvariate\b/i, 'universal'),
  p('campuswire', 'Campuswire', 'discussion', ['*.campuswire.com'], /campuswire/i, 'none'),
  p('iclicker', 'iClicker', 'other', ['*.iclicker.com'], /i-?clicker/i, 'none'),
  p('googleforms', 'Google Forms', 'other', ['forms.gle', 'forms.google.com'], /google forms?/i, 'none'),
  p('turnitin', 'Turnitin', 'other', ['*.turnitin.com'], /turnitin/i, 'none'),
  p('examsoft', 'ExamSoft', 'other', ['*.examsoft.com'], /examsoft|examplify/i, 'none', true),
  p('respondus', 'Respondus', 'other', ['*.respondus.com'], /respondus|lockdown browser/i, 'none', true),
  p('honorlock', 'Honorlock', 'other', ['*.honorlock.com'], /honorlock/i, 'none', true),
  p('examity', 'Examity', 'other', ['*.examity.com'], /examity/i, 'none', true),
];

export function hostMatches(glob: string, hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (glob.startsWith('*.')) {
    const base = glob.slice(2).toLowerCase();
    return host === base || host.endsWith(`.${base}`);
  }
  return host === glob.toLowerCase();
}

export function platformByHost(hostname: string): PlatformDef | undefined {
  return PLATFORMS.find((x) => x.hosts.some((h) => hostMatches(h, hostname)));
}

export function platformByTitle(title: string): PlatformDef | undefined {
  return PLATFORMS.find((x) => x.title.test(title));
}

export function platformById(id: string): PlatformDef | undefined {
  return PLATFORMS.find((x) => x.id === id);
}

/** Match patterns for permissions.request / permissions.contains. */
export function originPatterns(def: PlatformDef): string[] {
  return def.hosts.map((h) => `https://${h}/*`);
}

/** The manifest's host_permissions: Brightspace, then every site of a platform DueBoard reads. Build-time safe. */
export function manifestOrigins(): string[] {
  const origins = new Set(PLATFORMS.filter((x) => x.reader !== 'none').flatMap(originPatterns));
  return ['https://purdue.brightspace.com/*', ...[...origins].sort()];
}
