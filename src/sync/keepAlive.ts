/**
 * Calls `ping` every `intervalMs` until `work` settles. A cheap extension API call keeps an MV3 service
 * worker from being stopped for idleness during a long sync.
 */
export function withKeepAlive<T>(work: Promise<T>, ping: () => Promise<unknown>, intervalMs = 20_000): Promise<T> {
  const id = setInterval(() => void ping().catch(() => undefined), intervalMs);
  return work.finally(() => clearInterval(id));
}
