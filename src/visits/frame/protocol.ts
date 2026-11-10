import type { FoundDue } from '../finders/types';
import type { VisitMessage } from '../messages';
import type { PageSample } from '../runner';

/** A title the frame host listed on a page, with the key it is known by. */
export interface ListedTitle {
  key: string;
  title: string;
}

/** What the frame host is asked to read in one iframe. */
export interface FrameVisitRequest {
  token: string;
  url: string;
  mode: 'due' | 'session' | 'syllabus';
  platform?: string;
  titles?: ListedTitle[];
  helloMs?: number;
  readMs?: number;
}

/** What a frame reader is told to do once the frame host has answered its hello. */
export interface FrameConfig {
  mode: FrameVisitRequest['mode'];
  platform?: string;
  allowOpen: boolean;
  titles: ListedTitle[];
}

export interface Listed {
  key: string;
  found: FoundDue;
}

export interface FrameResult {
  status: 'found' | 'none' | 'text' | 'landed' | 'blocked' | 'signed_out';
  host?: string;
  landed?: string;
  found?: FoundDue;
  lines?: string[];
  listed: Listed[];
  frames: { url: string; top: boolean }[];
  clicked: string[];
  pages: PageSample[];
}

/** The only thing that travels by postMessage: the nonce. Everything else goes by runtime messaging. */
export type HelloPost = { dueboard: 'hello'; nonce: string };

export type ReaderMessage =
  /** Answered with FrameConfig | null. */
  | { type: 'frameConfig'; nonce: string }
  | { type: 'frameMessage'; nonce: string; message: VisitMessage | { type: 'visitListed'; listed: Listed[] } };

const NONCE = /^[0-9a-f]{32}$/;

export const isHelloPost = (v: unknown): v is HelloPost => {
  const o = v as { dueboard?: unknown; nonce?: unknown } | null;
  return !!o && typeof o === 'object' && o.dueboard === 'hello' && typeof o.nonce === 'string' && NONCE.test(o.nonce);
};

export const isReaderMessage = (v: unknown): v is ReaderMessage => {
  const o = v as { type?: unknown; nonce?: unknown; message?: unknown } | null;
  if (!o || typeof o !== 'object' || typeof o.nonce !== 'string' || !NONCE.test(o.nonce)) return false;
  if (o.type === 'frameConfig') return true;
  return o.type === 'frameMessage' && !!o.message && typeof o.message === 'object' && typeof (o.message as { type?: unknown }).type === 'string';
};
