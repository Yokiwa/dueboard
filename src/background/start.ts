export interface StartDeps {
  getVisitWindow(): Promise<number | undefined>;
  closeLeftover(id: number): Promise<void>;
  setVisitProgress(p: null): Promise<void>;
  /** Clears frames, holds and the header rule a dead run left behind. */
  resetFrames(): Promise<void>;
}

/**
 * Cleans up after a run that died (worker restart, update) whenever the background starts: the visit progress line is
 * always cleared, a leftover visit window is closed, and the frame host and header rule are reset. Each step is
 * independent; a failing one does not stop the others.
 */
export async function onBackgroundStart(deps: StartDeps): Promise<void> {
  const quietly = (p: () => Promise<unknown>) => p().catch(() => undefined);
  await Promise.all([
    quietly(() => deps.setVisitProgress(null)),
    quietly(async () => {
      const id = await deps.getVisitWindow();
      if (id !== undefined) await deps.closeLeftover(id);
    }),
    quietly(() => deps.resetFrames()),
  ]);
}
