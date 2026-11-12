import { createRouter } from '../background/router';
import { handleInstalled, settingsAfterUpdate } from '../background/install';
import { createBrightspaceConnector } from '../connectors/brightspace';
import { createGradescopeConnector } from '../connectors/gradescope';
import { collectFixtures, probe } from '../diagnostics/probe';
import { appendVisitLog, getLoginTab, getVisitWindow, loadStore, patchStore, saveCaptured, setLoginTab, setVisitProgress } from '../storage/store';
import { acceptCapture } from '../capture/accept';
import { isStale, runSync } from '../sync/runSync';
import { parsers } from '../sync/parsers';
import { refreshSyllabi } from '../syllabus/refresh';
import { createPearsonConnector } from '../connectors/pearson';
import { onBackgroundStart } from '../background/start';
import { runVisitPass } from '../background/visitPass';
import { runFrameVisits } from '../visits/frameRunner';
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
import { beginLogin, beginLoginNewTab, onTabUpdated } from '../background/login';
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
            return await runVisitPass(
              {
                load: loadStore,
                save: (patch) => patchStore(patch),
                now: () => new Date(),
                frames: (ts, opts) => runFrameVisits(ts, frameApi, opts),
                windows: (ts, onLog) => runVisits(ts, visitApi, { onProgress: () => undefined, onLog }),
                signedIn: () => visitApi.signedIn(),
                progress: (done, total) => void setVisitProgress({ done, total }),
                log,
              },
              targets,
            );
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

export default defineBackground({
  // Firefox's event page can load modules on demand, so pdf.js stays out of it until a syllabus PDF is read.
  // Chrome's service worker stays a classic script (it has no dynamic imports to split).
  type: import.meta.env.FIREFOX ? 'module' : undefined,
  main: () => {
  // What a dead run left behind (progress line, visit window, frames, header rule) is cleared whenever the background starts.
  void onBackgroundStart({
    getVisitWindow,
    closeLeftover: (id) => closeLeftover(id, visitApi),
    setVisitProgress,
    resetFrames: () => frameApi.reset(),
  });
  const ensureAlarm = async () => {
    if (!(await browser.alarms.get(ALARM))) await browser.alarms.create(ALARM, { periodInMinutes: 30 });
  };

  browser.runtime.onInstalled.addListener(async (details) => {
    // A new version may read pages the old one couldn't: retry homeworks the old one found nothing on.
    if (details.reason === 'update') {
      const store = await loadStore();
      const settings = settingsAfterUpdate(store.settings, details.previousVersion);
      await patchStore({ captured: forgetUnfoundVisits(store.captured), ...(settings !== store.settings && { settings }) });
    }
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

  const loginDeps = {
    signedIn: () => visitApi.signedIn(),
    navigate: async (tabId: number, url: string) => void (await browser.tabs.update(tabId, { url })),
    remember: (id: number | null) => setLoginTab(id),
  };
  browser.tabs.onUpdated.addListener((tabId, info, tab) => {
    void onTabUpdated(tabId, tab.url, info.status === 'complete', {
      ...loginDeps,
      remembered: getLoginTab,
      now: () => Date.now(),
      dashboardUrl: browser.runtime.getURL('/dashboard.html') + '?start=1',
    }).catch(() => undefined);
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    void getLoginTab().then((t) => (t?.id === tabId ? setLoginTab(null) : undefined)).catch(() => undefined);
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
    // First-run login: the dashboard tab (or a new tab, from the popup) goes to Brightspace and is brought back afterwards.
    beginLogin: async (_msg, sender) => {
      if (!isOwnPageSender(sender, browser.runtime.getURL(''))) return undefined;
      const tabId = sender?.tab?.id;
      if (tabId !== undefined) return beginLogin(tabId, loginDeps);
      return beginLoginNewTab({ signedIn: loginDeps.signedIn, createTab: (url) => browser.tabs.create({ url }), remember: loginDeps.remember });
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
