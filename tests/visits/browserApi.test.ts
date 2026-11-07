import { describe, it, expect, afterEach } from 'vitest';
import { createBrowserVisitApi, deliverVisitMessage, setVisitTab } from '../../src/visits/browserApi';
import type { VisitMessage } from '../../src/visits/messages';

const msg: VisitMessage = { type: 'visitFound', found: null, frameUrl: 'https://www.aleks.com/x', top: true };

describe('finder message delivery', () => {
  afterEach(() => setVisitTab(null));

  it('takes messages from the visit tab and hands them to the runner', async () => {
    setVisitTab(5);
    expect(deliverVisitMessage(msg, { tab: { id: 5 } })).toBe(true);
    expect(await createBrowserVisitApi().nextMessage(5, 50)).toEqual(msg);
  });

  it('ignores messages from other tabs, and when no visit runs', async () => {
    setVisitTab(5);
    expect(deliverVisitMessage(msg, { tab: { id: 6 } })).toBe(false);
    expect(await createBrowserVisitApi().nextMessage(5, 20)).toBe('timeout');
    setVisitTab(null);
    expect(deliverVisitMessage(msg, { tab: { id: 5 } })).toBe(false);
  });

  it('resolves a waiting runner as soon as a message arrives', async () => {
    setVisitTab(5);
    const waiting = createBrowserVisitApi().nextMessage(5, 1000);
    deliverVisitMessage(msg, { tab: { id: 5 } });
    expect(await waiting).toEqual(msg);
  });
});
