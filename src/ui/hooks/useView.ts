import { useState } from 'react';
import type { View } from '../components/ViewTabs';

const KEY = 'dueboard.view';
const VIEWS: View[] = ['courses', 'calendar', 'todo', 'timer', 'music'];

/** Current dashboard view, remembered per browser (best effort: storage may be unavailable). */
export function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => {
    try {
      const saved = localStorage.getItem(KEY) as View | null;
      return saved && VIEWS.includes(saved) ? saved : 'courses';
    } catch {
      return 'courses';
    }
  });
  const update = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      // ignore: the view simply won't be remembered
    }
  };
  return [view, update];
}
