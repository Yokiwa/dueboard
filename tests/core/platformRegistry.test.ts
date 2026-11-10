import { describe, it, expect } from 'vitest';
import { PLATFORMS, hostMatches, manifestOrigins, originPatterns, platformByHost, platformById, platformByTitle } from '../../src/core/platformRegistry';

describe('platform registry', () => {
  it('finds platforms by host', () => {
    expect(platformByHost('www-awu.aleks.com')?.id).toBe('aleks');
    expect(platformByHost('digital.wwnorton.com')?.id).toBe('norton');
    expect(platformByHost('education.wiley.com')?.reader).toBe('page');
    expect(platformByHost('example.com')).toBeUndefined();
  });

  it('finds platforms by launch title', () => {
    expect(platformByTitle('InQuizitive Ch. 5')?.label).toBe('Norton');
    expect(platformByTitle('Access Top Hat')?.id).toBe('tophat');
    expect(platformByTitle('Week 1 notes')).toBeUndefined();
  });

  it('builds origin patterns from host globs', () => {
    expect(originPatterns(platformById('aleks')!)).toEqual(['https://*.aleks.com/*']);
    expect(originPatterns(platformById('wileyplus')!)).toContain('https://education.wiley.com/*');
  });

  it('matches host globs on dot boundaries', () => {
    expect(hostMatches('*.aleks.com', 'aleks.com')).toBe(true);
    expect(hostMatches('*.aleks.com', 'www-awu.aleks.com')).toBe(true);
    expect(hostMatches('*.aleks.com', 'evilaleks.com')).toBe(false);
    expect(hostMatches('education.wiley.com', 'education.wiley.com')).toBe(true);
    expect(hostMatches('education.wiley.com', 'x.education.wiley.com')).toBe(false);
  });

  it('has unique ids', () => {
    const ids = PLATFORMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads Gradescope and Pearson by fetch and discussion boards not at all', () => {
    expect(platformById('gradescope')?.reader).toBe('fetch');
    expect(platformById('pearson')?.reader).toBe('fetch');
    expect(platformById('piazza')?.reader).toBe('none');
    expect(platformById('simplesyllabus')?.reader).toBe('syllabus');
  });

  const NEW: [string, string, string, string[], string, string, boolean][] = [
    ['labflow', 'LabFlow', 'homework', ['x.labflow.com'], 'LabFlow lab 3', 'universal', false],
    ['beyondlabz', 'BeyondLabz', 'homework', ['app.beyondlabz.com'], 'Beyond Labz report', 'universal', false],
    ['circuit', 'Circuit', 'homework', [], 'Circuit peer review 2', 'universal', false],
    ['variate', 'Variate', 'homework', [], 'Variate quiz prep', 'universal', false],
    ['campuswire', 'Campuswire', 'discussion', ['campuswire.com'], 'Campuswire', 'none', false],
    ['iclicker', 'iClicker', 'other', ['student.iclicker.com'], 'i-clicker', 'none', false],
    ['googleforms', 'Google Forms', 'other', ['forms.gle', 'forms.google.com'], 'Google Form', 'none', false],
    ['turnitin', 'Turnitin', 'other', ['www.turnitin.com'], 'Turnitin paper', 'none', false],
    ['examsoft', 'ExamSoft', 'other', ['x.examsoft.com'], 'Examplify', 'none', true],
    ['respondus', 'Respondus', 'other', ['x.respondus.com'], 'LockDown Browser', 'none', true],
    ['honorlock', 'Honorlock', 'other', ['app.honorlock.com'], 'Honorlock practice', 'none', true],
    ['examity', 'Examity', 'other', ['x.examity.com'], 'Examity', 'none', true],
  ];
  it.each(NEW)('knows %s', (id, label, category, hosts, title, reader, neverOpen) => {
    const def = platformById(id)!;
    expect(def).toMatchObject({ label, category, reader });
    expect(!!def.neverOpen).toBe(neverOpen);
    for (const h of hosts) expect(platformByHost(h)?.id).toBe(id);
    expect(platformByTitle(title)?.id).toBe(id);
    if (!hosts.length) expect(def.hosts).toEqual([]);
  });

  it('covers the whole domain of existing platforms', () => {
    expect(platformByHost('sso.wiley.com')?.id).toBe('wileyplus');
    expect(platformByHost('login.pearson.com')?.id).toBe('pearson');
    expect(platformByHost('iam.macmillanlearning.com')?.id).toBe('achieve');
  });

  it('claims no host twice', () => {
    for (const def of PLATFORMS) for (const h of def.hosts) expect(platformByHost(h.replace(/^\*\./, ''))?.id).toBe(def.id);
  });

  it('lists the manifest origins: Brightspace first, readers only, sorted, unique', () => {
    const o = manifestOrigins();
    expect(o[0]).toBe('https://purdue.brightspace.com/*');
    expect(o).toContain('https://*.wiley.com/*');
    expect(o).toContain('https://*.labflow.com/*');
    expect(o).toContain('https://*.gradescope.com/*');
    for (const bad of ['campuswire', 'turnitin', 'google', 'forms.gle', 'honorlock', 'examsoft', 'respondus', 'examity', 'piazza', 'edstem', 'iclicker']) {
      expect(o.some((x) => x.includes(bad))).toBe(false);
    }
    expect(new Set(o).size).toBe(o.length);
    expect(o.slice(1)).toEqual([...o.slice(1)].sort());
  });
});
