import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ProbeReport, ProbeResult, FixtureBundle } from '../../diagnostics/probe';

const box: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  maxWidth: 720,
  margin: '40px auto',
  padding: '0 16px',
  color: '#111827',
  lineHeight: 1.6,
};

function Row({ name, r }: { name: string; r: ProbeResult }) {
  return (
    <li>
      <strong>{name}</strong>：{r.ok ? '✅ 可以读取' : '❌ 读取失败'}（HTTP {r.status}
      {r.redirectedTo ? `，被跳转到 ${r.redirectedTo}` : ''}）
      {!r.ok && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#F3F4F6', padding: 8 }}>{r.note}</pre>}
    </li>
  );
}

function App() {
  const [report, setReport] = useState<ProbeReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportNote, setExportNote] = useState('');

  const runProbe = async () => {
    setBusy(true);
    setReport((await browser.runtime.sendMessage({ type: 'probe' })) as ProbeReport);
    setBusy(false);
  };

  const runExport = async () => {
    setBusy(true);
    setExportNote('正在收集，大约需要 10 秒……');
    const bundle = (await browser.runtime.sendMessage({ type: 'collectFixtures' })) as FixtureBundle;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dueboard-fixtures.json';
    a.click();
    setExportNote(
      bundle.errors.length
        ? `已下载，但有 ${bundle.errors.length} 个接口失败：\n${bundle.errors.join('\n')}`
        : '已下载 dueboard-fixtures.json。发送前请先打开检查一遍，确认里面没有你的名字、学号或邮箱。',
    );
    setBusy(false);
  };

  return (
    <main style={box}>
      <h1>DueBoard 诊断工具</h1>
      <p>请先在这个浏览器里登录 Brightspace 和 Gradescope，然后点下面的按钮。</p>
      <p>
        <button type="button" onClick={runProbe} disabled={busy}>
          1. 检查能否读取
        </button>{' '}
        <button type="button" onClick={runExport} disabled={busy}>
          2. 导出示例数据
        </button>
      </p>
      {report && (
        <ul>
          <Row name="Brightspace" r={report.brightspace} />
          <Row name="Gradescope" r={report.gradescope} />
        </ul>
      )}
      {exportNote && <pre style={{ whiteSpace: 'pre-wrap' }}>{exportNote}</pre>}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
