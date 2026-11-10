import { createRouter } from '../background/router';
import { handleInstalled } from '../background/install';
import { createBrightspaceConnector } from '../connectors/brightspace';
import { createGradescopeConnector } from '../connectors/gradescope';
import { collectFixtures, probe } from '../diagnostics/probe';
import { appendVisitLog, getVisitWindow, loadStore, patchStore, saveCaptured, setVisitProgress } from '../storage/store';
import { acceptCapture } from '../capture/accept';
import { isStale, runSync } from '../sync/runSync';
import { parsers } from '../sync/parsers';
import { refreshSyllabi } from '../syllabus/refresh';
import { createPearsonConnector } from '../connectors/pearson';
import { startSync, syncWithDiscovery } from '../background/syncFlow';
import type { Trigger } from '../visits/schedule';
import { closeLeftover, runVisits, type VisitLogEntry } from '../visits/runner';
import { forgetUnfoundVisits } from '../visits/apply';
import { createBrowserVisitApi, deliverVisitMessage, isVisitTab } from '../visits/browserApi';
import { isVisitMessage } from '../visits/messages';
import type { Connector, SourceId } from '../core/types';
import { withKeepAlive } from '../sync/keepAlive';
import { IS_FIREFOX } from '../core/env';
import { createFrameApi, getBackgroundFrameHost } from '../visits/frame/api';
import { isOwnPageSender } from '../visits/frame/probe';
import type { FrameVisitRequest } from '../visits/frame/protocol';

const ALARM = 'dueboard-sync';

const CONNECTORS: Record<SourceId, () => Connector> = {
  brightspace: () => createBrightspaceConnector(),
  gradescope: () => createGradescopeConnector({ parser: parsers.gradescope }),
  pearson: () => createPearsonConnector({ parse: parsers.pearson }),
};
const visitApi = createBrowserVisitApi();
const frameApi = createFrameApi();

/**
 * One full sync: every source, then platform visits (alarm and page loads are 'auto'; Refresh is 'manual').
 * Resolves with the sync report as soon as the sources are read; the visits continue, kept alive, and their
 * progress shows in the dashboard.
 */
const syncNow = (trigger: Trigger = 'auto') => {
  const run = startSync(
      {
        load: loadStore,
        sync: () => syncWithDiscovery(loadStore, (ids) => ids.map((id) => CONNECTORS[id]()), (cs) => runSync(cs)),
        granted: () => visitApi.granted(),
        visit: async (targets) => {
          // Each page's entry is saved as soon as it is read (one write after another), so the log shows how far a run
          // got even if it never ends.
          let logged = Promise.resolve();
          const log = (entry: VisitLogEntry) => (logged = logged.then(() => appendVisitLog([entry])).catch(() => undefined));
          try {
            return await runVisits(targets, visitApi, {
              onProgress: (done, total) => void setVisitProgress({ done, total }),
              onLog: log,
            });
          } finally {
            await logged;
            await setVisitProgress(null);
          }
        },
        save: (patch) => patchStore(patch),
        resync: (src) => runSync([CONNECTORS[src]()]),
        syllabus: (store) => refreshSyllabi(store, new Date(), fetch.bind(globalThis), parsers.syllabus),
        now: () => new Date(),
      },
      trigger,
    );
  void withKeepAlive(run.done, () => browser.runtime.getPlatformInfo()).catch(() => undefined);
  return run.report;
};

/** A visit window a dead run left open (worker restart, update) is closed whenever the background starts. */
const closeOldVisitWindow = async () => {
  const id = await getVisitWindow();
  if (id === undefined) return;
  await closeLeftover(id, visitApi);
  await setVisitProgress(null);
};

export default defineBackground({
  // Firefox's event page can load modules on demand, so pdf.js stays out of it until a syllabus PDF is read.
  // Chrome's service worker stays a classic script (it has no dynamic imports to split).
  type: import.meta.env.FIREFOX ? 'module' : undefined,
  main: () => {
  void closeOldVisitWindow();
  // Frames a dead run left in the frame host, and the header rule it left on, are cleared whenever the background starts.
  void frameApi.reset().then(() => frameApi.end()).catch(() => undefined);
  const ensureAlarm = async () => {
    if (!(await browser.alarms.get(ALARM))) await browser.alarms.create(ALARM, { periodInMinutes: 30 });
  };

  browser.runtime.onInstalled.addListener(async (details) => {
    // A new version may read pages the old one couldn't: retry homeworks the old one found nothing on.
    if (details.reason === 'update') await patchStore({ captured: forgetUnfoundVisits((await loadStore()).captured) });
    void handleInstalled(details.reason, {
      ensureAlarm,
      sync: () => syncNow('auto'),
      openDashboard: () => browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') }),
    });
  });
  browser.runtime.onStartup.addListener(() => void ensureAlarm());
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void syncNow('auto');
  });

  const route = createRouter({
    sync: (msg) => syncNow(msg.trigger === 'manual' ? 'manual' : 'auto'),
    syncIfStale: async () => {
      const { syncMeta } = await loadStore();
      return isStale(syncMeta, new Date()) ? syncNow('auto') : null;
    },
    visitFound: async (msg, sender) => isVisitMessage(msg) && deliverVisitMessage(msg, sender),
    visitText: async (msg, sender) => isVisitMessage(msg) && deliverVisitMessage(msg, sender),
    visitFrame: async (msg, sender) => isVisitMessage(msg) && deliverVisitMessage(msg, sender),
    visitClick: async (msg, sender) => isVisitMessage(msg) && deliverVisitMessage(msg, sender),
    visitSample: async (msg, sender) => isVisitMessage(msg) && deliverVisitMessage(msg, sender),
    // Diagnostic entry for the extension's own pages: reads one page in a hidden frame.
    frameProbe: async (msg, sender) => {
      if (!isOwnPageSender(sender, browser.runtime.getURL(''))) return undefined;
      const req = msg.req as FrameVisitRequest;
      if (msg.headers !== false) await frameApi.begin();
      try {
        return await frameApi.visit(req);
      } finally {
        if (msg.headers !== false) await frameApi.end();
      }
    },
    probe: () => probe(),
    collectFixtures: () => collectFixtures(),
    captureDue: async (msg, sender) => {
      const c = acceptCapture(msg, sender?.url, new Date(), { fromVisit: isVisitTab(sender?.tab?.id) });
      if (c) await saveCaptured([c]);
      return Boolean(c);
    },
  });

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (IS_FIREFOX) {
      // On Firefox this page hosts the frames, so it answers the readers in them.
      const answer = getBackgroundFrameHost().onMessage(msg);
      if (answer !== undefined) {
        sendResponse(answer);
        return undefined;
      }
    }
    const pending = route(msg, { url: sender.url, origin: (sender as { origin?: string }).origin, tab: sender.tab, frameId: sender.frameId });
    if (!pending) return undefined;
    pending.then(sendResponse, (e) => sendResponse({ error: String(e) }));
    return true; // keep the channel open for the async answer
  });
},
});
