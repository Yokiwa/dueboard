import type { ReactElement } from 'react';
import { render } from '@testing-library/react';

/** The UI is English-only; the first argument is kept so existing calls read the same. */
export function renderIn(_lang: 'en', ui: ReactElement) {
  return render(ui);
}
