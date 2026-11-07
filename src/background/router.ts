export interface Sender {
  url?: string;
  tab?: { id?: number };
  frameId?: number;
}
export type Handlers = Record<string, (msg: Record<string, unknown>, sender?: Sender) => Promise<unknown>>;

/**
 * Returns a function that maps an incoming runtime message to its handler's promise,
 * or undefined when the background should not answer (unknown type, or a message meant for the offscreen page).
 */
export function createRouter(handlers: Handlers) {
  return (msg: unknown, sender?: Sender): Promise<unknown> | undefined => {
    if (!msg || typeof msg !== 'object') return undefined;
    const m = msg as Record<string, unknown>;
    if (m.target === 'offscreen') return undefined;
    const handler = typeof m.type === 'string' ? handlers[m.type] : undefined;
    return handler ? handler(m, sender) : undefined;
  };
}
