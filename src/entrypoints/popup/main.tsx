import { createRoot } from 'react-dom/client';

// Temporary entry until Task 14 builds the real popup.
function Popup() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, width: 220 }}>
      <p style={{ margin: '0 0 8px', fontWeight: 600 }}>DueBoard 测试版</p>
      <a href={browser.runtime.getURL('/diagnostics.html')} target="_blank" rel="noopener">
        打开诊断工具
      </a>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Popup />);
