import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/latin-700.css';
import '../../ui/tokens.css';
import { ErrorBoundary } from '../../ui/components/ErrorBoundary';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary fallback="页面出错了，请刷新重试。 Something went wrong — please reload.">
    <App />
  </ErrorBoundary>,
);
