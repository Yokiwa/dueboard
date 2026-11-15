import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { manifestOrigins } from '../../src/core/platformRegistry';

const listing = readFileSync('store/listing.md', 'utf8');
/** The short host permission text pasted into the Chrome Web Store dashboard's single field. */
const short = /### Host permission justification[^\n]*\n[\s\S]*?```\n([\s\S]*?)\n```/.exec(listing)?.[1] ?? '';

describe('Chrome Web Store host permission justification', () => {
  it('fits the dashboard field (1,000 characters)', () => {
    expect(short.length).toBeGreaterThan(0);
    expect(short.length).toBeLessThanOrEqual(1000);
  });

  it('explains every host that is not just a homework platform page reader, and each is still in the manifest', () => {
    const origins = manifestOrigins();
    for (const host of ['purdue.brightspace.com', '*.gradescope.com', 'mylab.pearson.com', 'socket.pearsoned.com', 'education.wiley.com']) {
      expect(origins, host).toContain(`https://${host}/*`);
      expect(short, host).toContain(`${host}:`);
    }
    expect(short).toContain('Optional https://*/*');
  });
});
