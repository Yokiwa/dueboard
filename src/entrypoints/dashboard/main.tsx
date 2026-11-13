import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '../../ui/tokens.css';
import './dashboard.css';
import { ErrorBoundary } from '../../ui/components/ErrorBoundary';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary fallback="Something went wrong — please reload the page.">
    <App />
  </ErrorBoundary>,
);
