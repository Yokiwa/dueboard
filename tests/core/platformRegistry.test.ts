import { describe, it, expect } from 'vitest';
import { PLATFORMS, hostMatches, originPatterns, platformByHost, platformById, platformByTitle } from '../../src/core/platformRegistry';

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
});
