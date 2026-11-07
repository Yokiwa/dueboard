import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ProbeReport, ProbeResult, FixtureBundle } from '../../diagnostics/probe';
import { loadStore } from '../../storage/store';

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
      <strong>{name}</strong>: {r.ok ? '✅ readable' : '❌ not readable'} (HTTP {r.status}
      {r.redirectedTo ? `, redirected to ${r.redirectedTo}` : ''})
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

  const [syncNote, setSyncNote] = useState('');
  const runSyncNow = async () => {
    setBusy(true);
    setSyncNote('Syncing…');
    const report = (await browser.runtime.sendMessage({ type: 'sync' })) as Record<string, string>;
    const s = await loadStore();
    const lines = (['brightspace', 'gradescope'] as const).map((src) => {
      const snap = s.snapshots[src];
      const status = report[src] === 'ok' ? '✅' : `❌ ${report[src] ?? 'not run'}`;
      return `${src}: ${status}, ${snap?.courses.length ?? 0} courses, ${snap?.items.length ?? 0} items, ${snap?.links.length ?? 0} links${snap?.partial.length ? `, ${snap.partial.length} courses partly failed` : ''}`;
    });
    setSyncNote(lines.join('\n'));
    setBusy(false);
  };

  const runExport = async () => {
    setBusy(true);
    setExportNote('Collecting… about 10 seconds.');
    const bundle = (await browser.runtime.sendMessage({ type: 'collectFixtures' })) as FixtureBundle;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dueboard-fixtures.json';
    a.click();
    setExportNote(
      bundle.errors.length
        ? `Downloaded, but ${bundle.errors.length} requests failed:\n${bundle.errors.join('\n')}`
        : 'Downloaded dueboard-fixtures.json. Open it and check that your name, student ID and email are not in it before sending.',
    );
    setBusy(false);
  };

  return (
    <main style={box}>
      <h1>DueBoard diagnostics</h1>
      <p>Sign in to Brightspace in this browser first, then use the buttons below.</p>
      <p>
        <button type="button" onClick={runProbe} disabled={busy}>
          1. Check access
        </button>{' '}
        <button type="button" onClick={runExport} disabled={busy}>
          2. Export sample data
        </button>{' '}
        <button type="button" onClick={runSyncNow} disabled={busy}>
          3. Sync now
        </button>
      </p>
      {report && (
        <ul>
          <Row name="Brightspace" r={report.brightspace} />
          <Row name="Gradescope" r={report.gradescope} />
        </ul>
      )}
      {exportNote && <pre style={{ whiteSpace: 'pre-wrap' }}>{exportNote}</pre>}
      {syncNote && <pre style={{ whiteSpace: 'pre-wrap' }}>{syncNote}</pre>}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
