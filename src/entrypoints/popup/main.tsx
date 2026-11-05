import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/latin-700.css';
import '../../ui/tokens.css';
import { ErrorBoundary } from '../../ui/components/ErrorBoundary';
import { PopupApp } from './App';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary fallback="出错了 / Something went wrong">
    <PopupApp />
  </ErrorBoundary>,
);
