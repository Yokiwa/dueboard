import { createRouter } from '../background/router';
import { handleInstalled } from '../background/install';
import { createBrightspaceConnector } from '../connectors/brightspace';
import { createGradescopeConnector } from '../connectors/gradescope';
import { collectFixtures, probe } from '../diagnostics/probe';
import { loadStore, patchStore, saveCaptured, setVisitProgress } from '../storage/store';
import { acceptCapture } from '../capture/accept';
import { isStale, runSync } from '../sync/runSync';
import { parsers } from '../sync/parsers';
import { createPearsonConnector } from '../connectors/pearson';
import { syncAndVisit, syncWithDiscovery } from '../background/syncFlow';
import type { Trigger } from '../visits/schedule';
import { closeLeftover, runVisits } from '../visits/runner';
import { createBrowserVisitApi, deliverVisitMessage } from '../visits/browserApi';
import { isVisitMessage } from '../visits/messages';
import type { Connector, SourceId } from '../core/types';
import { withKeepAlive } from '../sync/keepAlive';

const ALARM = 'dueboard-sync';

const CONNECTORS: Record<SourceId, () => Connector> = {
  brightspace: () => createBrightspaceConnector(),
  gradescope: () => createGradescopeConnector({ parser: parsers.gradescope }),
  pearson: () => createPearsonConnector({ parse: parsers.pearson }),
};
const visitApi = createBrowserVisitApi();

/** One full sync: every source, then platform visits (alarm and page loads are 'auto'; Refresh is 'manual'). */
const syncNow = (trigger: Trigger = 'auto') =>
  withKeepAlive(
    syncAndVisit(
      {
        load: loadStore,
        sync: () => syncWithDiscovery(loadStore, (ids) => ids.map((id) => CONNECTORS[id]()), (cs) => runSync(cs)),
        granted: () => visitApi.granted(),
        visit: async (targets) => {
          try {
            return await runVisits(targets, visitApi, { onProgress: (done, total) => void setVisitProgress({ done, total }) });
          } finally {
            await setVisitProgress(null);
          }
        },
        save: (patch) => patchStore(patch),
        resyncPearson: () => runSync([CONNECTORS.pearson()]),
        now: () => new Date(),
      },
      trigger,
    ),
    () => browser.runtime.getPlatformInfo(),
  );

/** A visit window a crashed run left open is closed on the next start. */
const closeOldVisitWindow = async () => closeLeftover((await loadStore()).visitState.windowId, visitApi);

export default defineBackground(() => {
  const ensureAlarm = async () => {
    if (!(await browser.alarms.get(ALARM))) await browser.alarms.create(ALARM, { periodInMinutes: 30 });
  };

  browser.runtime.onInstalled.addListener((details) => {
    void closeOldVisitWindow();
    void handleInstalled(details.reason, {
      ensureAlarm,
      sync: () => syncNow('auto'),
      openDashboard: () => browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') }),
    });
  });
  browser.runtime.onStartup.addListener(() => {
    void ensureAlarm();
    void closeOldVisitWindow();
  });
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
    probe: () => probe(),
    collectFixtures: () => collectFixtures(),
    captureDue: async (msg, sender) => {
      const c = acceptCapture(msg, sender?.url, new Date());
      if (c) await saveCaptured([c]);
      return Boolean(c);
    },
  });

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const pending = route(msg, { url: sender.url, tab: sender.tab, frameId: sender.frameId });
    if (!pending) return undefined;
    pending.then(sendResponse, (e) => sendResponse({ error: String(e) }));
    return true; // keep the channel open for the async answer
  });
});
