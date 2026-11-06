import type { Item } from '../core/types';
import type { MessageKey } from './i18n';

/** Display name of where an item comes from: Gradescope wins over Brightspace when merged. */
export function sourceLabel(item: Item, t: (k: MessageKey) => string): string {
  if (item.sources.includes('gradescope')) return 'Gradescope';
  if (item.sources.includes('pearson')) return 'Pearson';
  if (item.sources.includes('brightspace')) return 'Brightspace';
  return t('source.manual');
}
