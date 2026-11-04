import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { LangProvider } from '../../src/ui/i18n';

export function renderIn(lang: 'zh' | 'en', ui: ReactElement) {
  return render(<LangProvider lang={lang}>{ui}</LangProvider>);
}
