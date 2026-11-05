import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '../../ui/tokens.css';
import { ErrorBoundary } from '../../ui/components/ErrorBoundary';
import { Settings } from './Settings';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary fallback="出错了 / Something went wrong">
    <Settings />
  </ErrorBoundary>,
);
