import { useEffect, useState } from 'react';
import { getVisitLog, type StoredVisitLogEntry } from '../../storage/store';

const cell: React.CSSProperties = { borderTop: '1px solid #E5E7EB', padding: '6px 8px', verticalAlign: 'top', fontSize: 13 };
const short = (url: string | undefined) => (url ? url.replace(/^https:\/\//, '') : '');

/**
 * What each platform visit saw, newest first: the site the Brightspace link goes to, the page opened and where it
 * ended up, which frames loaded, and the result. Stays on this computer; "Download" is for sending it to the developer.
 */
export function VisitLog() {
  const [log, setLog] = useState<StoredVisitLogEntry[] | null>(null);
  useEffect(() => {
    void getVisitLog().then((l) => setLog([...l].reverse()));
  }, []);

  const download = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), visits: log }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dueboard-visit-log.json';
    a.click();
  };

  if (!log) return null;
  return (
    <section>
      <h2>Platform visits</h2>
      <p>
        What DueBoard saw when it opened your homework links (latest {log.length}). Addresses are shown without the part after
        “?”. Click Refresh on the dashboard to make a new visit, then download this log to send it. Pages that showed no date
        are described with a short piece of their text, which can include your name: check the file before sending.
      </p>
      {log.length === 0 ? (
        <p>No platform visits yet. Click Refresh on the dashboard first.</p>
      ) : (
        <>
          <p>
            <button type="button" onClick={download}>
              Download visit log
            </button>
          </p>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={cell}>When</th>
                <th style={cell}>Homework</th>
                <th style={cell}>Mode</th>
                <th style={cell}>Site</th>
                <th style={cell}>Opened → ended up on</th>
                <th style={cell}>Frames that loaded</th>
                <th style={cell}>Result</th>
              </tr>
            </thead>
            <tbody>
              {log.map((e, i) => (
                <tr key={`${e.at}-${i}`}>
                  <td style={cell}>{new Date(e.at).toLocaleString()}</td>
                  <td style={cell}>{e.title}</td>
                  <td style={cell}>{e.mode === 'frame' ? 'Background' : 'Window'}</td>
                  <td style={cell}>
                    {e.site ?? ''}
                    {e.siteNote && <div style={{ color: '#6B7280' }}>{e.siteNote}</div>}
                  </td>
                  <td style={cell}>
                    {short(e.opened)}
                    {e.landed ? ` → ${short(e.landed)}` : ''}
                  </td>
                  <td style={cell}>
                    {e.frames.length} frame{e.frames.length === 1 ? '' : 's'}
                    {e.frames.length > 0 && <div style={{ color: '#6B7280' }}>{e.frames.map(short).join(', ')}</div>}
                    {e.pages?.map((pg) => (
                      <div key={pg.url} style={{ color: '#6B7280', marginTop: 4 }}>
                        <em>{short(pg.url)}</em>: “{pg.text}”{pg.buttons.length ? ` — buttons: ${pg.buttons.join(', ')}` : ''}
                      </div>
                    ))}
                  </td>
                  <td style={cell}>
                    {e.detail ? `${e.result} (${e.detail})` : e.result}
                    {e.due ? <div>{new Date(e.due).toLocaleString()}{e.evidence ? ` — “${e.evidence}”` : ''}</div> : null}
                    {e.answer ? <div>{e.answer}{!e.due && e.evidence ? ` — “${e.evidence}”` : ''}</div> : null}
                    {e.clicked?.length ? <div style={{ color: '#6B7280' }}>pressed: {e.clicked.join(', ')}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
