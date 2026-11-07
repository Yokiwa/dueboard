export interface FoundDue {
  /** The page heading. */
  title: string;
  dueAt: string;
  /** The matched text, at most 120 characters. */
  evidence: string;
}
