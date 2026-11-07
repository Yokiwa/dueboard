import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '../../ui/tokens.css';
import { ErrorBoundary } from '../../ui/components/ErrorBoundary';
import { Settings } from './Settings';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary fallback="Something went wrong — please reopen this page.">
    <Settings />
  </ErrorBoundary>,
);
