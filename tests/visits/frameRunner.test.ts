import { describe, it, expect, vi } from 'vitest';
import { runFrameVisits, type FrameVisitDone } from '../../src/visits/frameRunner';
import type { FrameApi } from '../../src/visits/frame/api';
import type { FrameResult, FrameVisitRequest } from '../../src/visits/frame/protocol';
import type { VisitTarget } from '../../src/visits/schedule';

const B = 'https://learn.example.com';
const target = (n: number, o: Partial<VisitTarget> = {}): VisitTarget => ({ key: `brightspace:topic:${n}`, title: `HW ${n}`, courseId: 'brightspace:1', launchUrl: `${B}/launch/${n}?x=1`, mode: 'due', ...o });
const found = { title: 'HW 1', dueAt: '2026-11-10T23:59:00.000Z', evidence: 'Due 11/10' };
const res = (o: Partial<FrameResult> = {}): FrameResult => ({ status: 'none', host: 'www.aleks.com', listed: [], frames: [], clicked: [], pages: [], ...o });
const urlN = (r: FrameVisitRequest) => Number(/launch\/(\d+)/.exec(r.url)![1]);

interface Pending {
  req: FrameVisitRequest;
  resolve(r: FrameResult): void;
  reject(e: unknown): void;
}
function fake(auto?: (req: FrameVisitRequest) => FrameResult | Promise<FrameResult>) {
  const calls: string[] = [];
  const pending: Pending[] = [];
  let inflight = 0;
  let maxInflight = 0;
  const api: FrameApi = {
    begin: async () => void calls.push('begin'),
    end: async () => void calls.push('end'),
    reset: async () => undefined,
    visit(req) {
      calls.push(`visit ${urlN(req)}`);
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      const done = <T>(v: T) => {
        inflight--;
        return v;
      };
      if (auto) return Promise.resolve(auto(req)).then(done, (e) => Promise.reject(done(e)));
      return new Promise<FrameResult>((resolve, reject) => pending.push({ req, resolve: (r) => resolve(done(r)), reject: (e) => reject(done(e)) }));
    },
  };
  return { api, calls, pending, max: () => maxInflight };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const base = (o: { signedIn?: boolean; done?: FrameVisitDone[]; keyOf?: (t: VisitTarget) => string } = {}) => ({
  keyOf: o.keyOf ?? ((t: VisitTarget) => t.platform ?? t.key),
  signedIn: async () => o.signedIn ?? true,
  onDone: (d: FrameVisitDone) => void o.done?.push(d),
});

describe('runFrameVisits', () => {
  it('returns nothing and does not call begin for no targets', async () => {
    const f = fake();
    expect(await runFrameVisits([], f.api, base())).toEqual([]);
    expect(f.calls).toEqual([]);
  });

  it('begins before the first visit and ends after the last', async () => {
    const f = fake(() => res());
    await runFrameVisits([target(1), target(2)], f.api, base());
    expect(f.calls[0]).toBe('begin');
    expect(f.calls.at(-1)).toBe('end');
  });

  it('treats a rejecting visit as blocked, and still ends', async () => {
    const f = fake(() => {
      throw new Error('gone');
    });
    const out = await runFrameVisits([target(1)], f.api, base());
    expect(out[0]!.outcome).toEqual({ key: 'brightspace:topic:1', status: 'failed', reason: 'frame' });
    expect(f.calls.at(-1)).toBe('end');
  });

  it('keeps going and warns when onDone throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = fake(() => res());
    const out = await runFrameVisits([target(1), target(2)], f.api, {
      ...base(),
      onDone: () => {
        throw new Error('storage');
      },
    });
    expect(out).toHaveLength(2);
    expect(f.calls.at(-1)).toBe('end');
    expect(warn).toHaveBeenCalledWith('DueBoard: could not record a visit result', expect.any(Error));
    warn.mockRestore();
  });

  it('reports a failed/frame outcome with fallback and frees the slot when handling a result throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = fake((r) => (urlN(r) === 1 ? ({ status: 'none', host: 'h', listed: [], frames: null } as unknown as FrameResult) : res()));
    const done: FrameVisitDone[] = [];
    const out = await runFrameVisits([1, 2].map((n) => target(n)), f.api, { ...base({ done }), concurrency: 1 });
    expect(out).toHaveLength(2);
    const d1 = out.find((d) => d.target.key === 'brightspace:topic:1')!;
    expect(d1.outcome).toEqual({ key: 'brightspace:topic:1', status: 'failed', reason: 'frame' });
    expect(d1.fallback).toBe(true);
    expect(d1.log).toMatchObject({ mode: 'frame', result: 'failed' });
    expect(done).toHaveLength(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reports a throwing target once as failed/frame even when a sibling finished while it ran', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = fake();
    const done: FrameVisitDone[] = [];
    const p = runFrameVisits([target(1, { platform: 'a' }), target(2, { platform: 'b' })], f.api, { ...base({ done }), concurrency: 3 });
    await tick();
    f.pending.find((x) => urlN(x.req) === 2)!.resolve(res());
    await tick();
    expect(done.map((d) => d.target.key)).toEqual(['brightspace:topic:2']);
    f.pending.find((x) => urlN(x.req) === 1)!.resolve({ status: 'none', host: 'h', listed: [], frames: null } as unknown as FrameResult);
    const out = await p;
    expect(out.filter((d) => d.target.key === 'brightspace:topic:1')).toHaveLength(1);
    const a = out.find((d) => d.target.key === 'brightspace:topic:1')!;
    expect(a.outcome).toEqual({ key: 'brightspace:topic:1', status: 'failed', reason: 'frame' });
    expect(a.fallback).toBe(true);
    expect(out.find((d) => d.target.key === 'brightspace:topic:2')!.outcome.status).toBe('none');
    expect(out).toHaveLength(2);
    expect(f.calls.at(-1)).toBe('end');
    warn.mockRestore();
  });

  it('runs at most 3 at once, in input order', async () => {
    const f = fake();
    const p = runFrameVisits([1, 2, 3, 4, 5].map((n) => target(n)), f.api, base());
    await tick();
    expect(f.calls.filter((c) => c.startsWith('visit'))).toEqual(['visit 1', 'visit 2', 'visit 3']);
    f.pending.shift()!.resolve(res());
    await tick();
    expect(f.calls.filter((c) => c.startsWith('visit')).at(-1)).toBe('visit 4');
    while (f.pending.length) {
      f.pending.shift()!.resolve(res());
      await tick();
    }
    await p;
    expect(f.max()).toBe(3);
    expect(f.calls.filter((c) => c.startsWith('visit'))).toEqual(['visit 1', 'visit 2', 'visit 3', 'visit 4', 'visit 5']);
  });

  it('never overlaps two targets with the same key from keyOf, and starts the next one that can go', async () => {
    const f = fake();
    const ts = [target(1, { platform: 'a' }), target(2, { platform: 'a' }), target(3, { platform: 'b' })];
    const p = runFrameVisits(ts, f.api, base());
    await tick();
    expect(f.calls.filter((c) => c.startsWith('visit'))).toEqual(['visit 1', 'visit 3']);
    f.pending.find((x) => urlN(x.req) === 1)!.resolve(res());
    await tick();
    expect(f.calls.filter((c) => c.startsWith('visit')).at(-1)).toBe('visit 2');
    f.pending.filter((x) => urlN(x.req) !== 1).forEach((x) => x.resolve(res()));
    await p;
  });

  it('gives each request a unique token and passes mode, platform and titles', async () => {
    const reqs: FrameVisitRequest[] = [];
    const f = fake((r) => (reqs.push(r), res()));
    const titles = [{ key: 'k', title: 'HW' }];
    await runFrameVisits([target(1, { platform: 'aleks', titles }), target(2, { mode: 'syllabus' }), target(3)], f.api, base());
    expect(new Set(reqs.map((r) => r.token)).size).toBe(3);
    expect(reqs[0]).toMatchObject({ url: `${B}/launch/1?x=1`, mode: 'due', platform: 'aleks', titles });
    expect(reqs[1]!.mode).toBe('syllabus');
  });

  describe('result mapping', () => {
    const run = async (r: FrameResult, o: { signedIn?: boolean } = {}) => {
      const f = fake(() => r);
      const out = await runFrameVisits([target(1)], f.api, base(o));
      return out[0]!;
    };
    const key = 'brightspace:topic:1';
    it('found', async () => {
      const d = await run(res({ status: 'found', found }));
      expect(d.outcome).toEqual({ key, status: 'found', found, host: 'www.aleks.com' });
      expect(d.fallback).toBe(false);
    });
    it('none', async () => {
      const d = await run(res({ status: 'none' }));
      expect(d.outcome).toEqual({ key, status: 'none', host: 'www.aleks.com' });
      expect(d.fallback).toBe(true);
    });
    it('text', async () => {
      const d = await run(res({ status: 'text', lines: ['a'] }));
      expect(d.outcome).toEqual({ key, status: 'text', lines: ['a'], host: 'www.aleks.com' });
      expect(d.fallback).toBe(false);
    });
    it('landed', async () => {
      const d = await run(res({ status: 'landed' }));
      expect(d.outcome).toEqual({ key, status: 'landed', host: 'www.aleks.com', via: 'frame' });
      expect(d.fallback).toBe(false);
    });
    it('blocked while signed in', async () => {
      const d = await run(res({ status: 'blocked', host: undefined }));
      expect(d.outcome).toEqual({ key, status: 'failed', reason: 'frame' });
      expect(d.fallback).toBe(true);
    });
    it('blocked while signed out', async () => {
      const d = await run(res({ status: 'blocked', host: undefined }), { signedIn: false });
      expect(d.outcome).toEqual({ key, status: 'signed_out' });
      expect(d.fallback).toBe(false);
    });
    it('signed_out while the browser says signed in is a failed frame, with fallback', async () => {
      const d = await run(res({ status: 'signed_out', host: undefined }));
      expect(d.outcome).toEqual({ key, status: 'failed', reason: 'frame' });
      expect(d.fallback).toBe(true);
    });
    it('signed_out while the browser says signed out', async () => {
      const d = await run(res({ status: 'signed_out', host: undefined }), { signedIn: false });
      expect(d.outcome).toEqual({ key, status: 'signed_out' });
      expect(d.fallback).toBe(false);
    });
    it('a hello-bearing result without a host is handled like blocked', async () => {
      const d = await run(res({ status: 'none', host: undefined }));
      expect(d.outcome).toEqual({ key, status: 'failed', reason: 'frame' });
      expect(d.fallback).toBe(true);
      const s = await run(res({ status: 'text', host: undefined }), { signedIn: false });
      expect(s.outcome).toEqual({ key, status: 'signed_out' });
      expect(s.fallback).toBe(false);
    });
    it('found without a payload is handled like blocked', async () => {
      const d = await run(res({ status: 'found' }));
      expect(d.outcome).toEqual({ key, status: 'failed', reason: 'frame' });
      expect(d.fallback).toBe(true);
      const s = await run(res({ status: 'found' }), { signedIn: false });
      expect(s.outcome).toEqual({ key, status: 'signed_out' });
      expect(s.fallback).toBe(false);
    });
  });

  it('starts no new visit after signed_out, and reports visits in flight normally', async () => {
    const f = fake();
    const done: FrameVisitDone[] = [];
    const p = runFrameVisits([1, 2, 3, 4].map((n) => target(n)), f.api, base({ done, signedIn: false }));
    await tick();
    f.pending.find((x) => urlN(x.req) === 2)!.resolve(res({ status: 'signed_out', host: undefined }));
    await tick();
    f.pending.find((x) => urlN(x.req) === 1)!.resolve(res({ status: 'found', found }));
    f.pending.find((x) => urlN(x.req) === 3)!.resolve(res());
    const out = await p;
    expect(f.calls.filter((c) => c.startsWith('visit'))).toEqual(['visit 1', 'visit 2', 'visit 3']);
    expect(out.map((d) => d.outcome.status)).toEqual(['signed_out', 'found', 'none']);
    expect(done).toHaveLength(3);
  });

  it('does not start targets whose key skipKey reports, and leaves them out of the result', async () => {
    const f = fake(() => res());
    const done: FrameVisitDone[] = [];
    const out = await runFrameVisits([1, 2, 3].map((n) => target(n, { platform: 'p' })), f.api, { ...base({ done }), skipKey: () => done.length >= 1 });
    expect(f.calls.filter((c) => c.startsWith('visit'))).toEqual(['visit 1']);
    expect(out).toHaveLength(1);
  });

  describe('listed', () => {
    const listedFound = (k: string, title = 'Other') => ({ key: k, found: { title, dueAt: '2026-11-12T23:59:00.000Z', evidence: 'Due Nov 12' } });
    it('dates waiting targets, which are then not visited and get their own onDone', async () => {
      const f = fake((r) => (urlN(r) === 1 ? res({ status: 'none', listed: [listedFound('brightspace:topic:3')] }) : res()));
      const done: FrameVisitDone[] = [];
      const out = await runFrameVisits([1, 2, 3, 4].map((n) => target(n, { platform: `p${n}` })), f.api, { ...base({ done }), concurrency: 1 });
      expect(f.calls.filter((c) => c.startsWith('visit'))).toEqual(['visit 1', 'visit 2', 'visit 4']);
      const d1 = out.find((d) => d.target.key === 'brightspace:topic:1')!;
      expect(d1.listed).toEqual([{ key: 'brightspace:topic:3', status: 'found', found: listedFound('x').found, host: 'www.aleks.com' }]);
      const d3 = out.find((d) => d.target.key === 'brightspace:topic:3')!;
      expect(d3.outcome).toMatchObject({ status: 'found', host: 'www.aleks.com' });
      expect(d3.fallback).toBe(false);
      expect(d3.log).toMatchObject({ mode: 'frame', detail: 'listed', result: 'found', due: '2026-11-12T23:59:00.000Z', evidence: 'Due Nov 12', key: 'brightspace:topic:3' });
      expect(out).toHaveLength(4);
      expect(done.map((d) => d.target.key)).toEqual(out.map((d) => d.target.key));
    });
    it("turns the visit's own none into found without fallback", async () => {
      const f = fake(() => res({ status: 'none', listed: [listedFound('brightspace:topic:1')] }));
      const out = await runFrameVisits([target(1)], f.api, base());
      expect(out[0]!.outcome).toMatchObject({ status: 'found', host: 'www.aleks.com', found: { dueAt: '2026-11-12T23:59:00.000Z' } });
      expect(out[0]!.fallback).toBe(false);
    });
    it('ignores entries for keys already started or unknown', async () => {
      const f = fake((r) => (urlN(r) === 2 ? res({ listed: [listedFound('brightspace:topic:1'), listedFound('nope')] }) : res()));
      const out = await runFrameVisits([target(1, { platform: 'a' }), target(2, { platform: 'b' })], f.api, base());
      expect(out).toHaveLength(2);
      expect(out.find((d) => d.target.key === 'brightspace:topic:1')!.outcome.status).toBe('none');
      expect(out.find((d) => d.target.key === 'brightspace:topic:2')!.listed).toEqual([]);
    });
  });

  it('stops starting visits after maxPages', async () => {
    const f = fake(() => res());
    const out = await runFrameVisits([1, 2, 3, 4, 5].map((n) => target(n)), f.api, { ...base(), maxPages: 2 });
    expect(out).toHaveLength(2);
    expect(f.calls.filter((c) => c.startsWith('visit'))).toHaveLength(2);
  });

  it('stops starting visits when the budget ends', async () => {
    let t = 0;
    const f = fake(() => ((t += 100), res()));
    const out = await runFrameVisits([1, 2, 3, 4].map((n) => target(n)), f.api, { ...base(), concurrency: 1, budgetMs: 250, now: () => t });
    expect(out).toHaveLength(3);
    expect(f.calls.at(-1)).toBe('end');
  });

  it('calls onDone in completion order with a frame log entry', async () => {
    const f = fake();
    const done: FrameVisitDone[] = [];
    const p = runFrameVisits([target(1, { platform: 'a' }), target(2, { platform: 'b' })], f.api, { ...base({ done }), now: () => Date.parse('2026-11-10T12:00:00Z') });
    await tick();
    f.pending.find((x) => urlN(x.req) === 2)!.resolve(res({ status: 'found', found, landed: 'https://www.aleks.com/hw?id=5#x', frames: [{ url: 'https://www.aleks.com/hw?id=5', top: true }], clicked: ['Open (www.aleks.com)'], pages: [{ url: 'u', text: 't', buttons: [] }] }));
    await tick();
    f.pending.find((x) => urlN(x.req) === 1)!.resolve(res({ pages: [{ url: 'u', text: 't', buttons: ['b'] }] }));
    await p;
    expect(done.map((d) => d.target.key)).toEqual(['brightspace:topic:2', 'brightspace:topic:1']);
    expect(done[0]!.log).toEqual({
      at: '2026-11-10T12:00:00.000Z',
      key: 'brightspace:topic:2',
      title: 'HW 2',
      site: 'www.aleks.com',
      opened: `${B}/launch/2`,
      landed: 'https://www.aleks.com/hw',
      frames: ['https://www.aleks.com/hw'],
      clicked: ['Open (www.aleks.com)'],
      due: found.dueAt,
      evidence: found.evidence,
      result: 'found',
      mode: 'frame',
    });
    expect(done[1]!.log.pages).toEqual([{ url: 'u', text: 't', buttons: ['b'] }]);
    expect(done[1]!.log.result).toBe('none');
  });
});
