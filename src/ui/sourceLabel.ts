import type { Item } from '../core/types';
import type { MessageKey } from './i18n';

/** Display name of where an item comes from: the platform page a date was read on, else Gradescope over Brightspace. */
export function sourceLabel(item: Item, t: (k: MessageKey) => string): string {
  if (item.dueFrom === 'platform' && item.duePlatform) return item.duePlatform;
  if (item.sources.includes('gradescope')) return 'Gradescope';
  if (item.sources.includes('pearson')) return 'Pearson';
  if (item.sources.includes('brightspace')) return 'Brightspace';
  return t('source.manual');
}
