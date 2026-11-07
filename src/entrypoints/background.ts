import { createRouter } from '../background/router';
import { handleInstalled } from '../background/install';
import { createBrightspaceConnector } from '../connectors/brightspace';
import { createGradescopeConnector } from '../connectors/gradescope';
import { collectFixtures, probe } from '../diagnostics/probe';
import { loadStore, saveCapturedDue } from '../storage/store';
import { acceptCapture } from '../capture/accept';
import { isStale, runSync } from '../sync/runSync';
import { offscreenParser, offscreenParsePearson } from '../sync/offscreenParser';
import { createPearsonConnector } from '../connectors/pearson';
import { activeSourceIds } from '../background/sources';
import type { Connector, SourceId } from '../core/types';
import { withKeepAlive } from '../sync/keepAlive';

const ALARM = 'dueboard-sync';

const CONNECTORS: Record<SourceId, () => Connector> = {
  brightspace: () => createBrightspaceConnector(),
  gradescope: () => createGradescopeConnector({ parser: offscreenParser }),
  pearson: () => createPearsonConnector({ parse: offscreenParsePearson }),
};
const syncNow = async () => {
  const ids = activeSourceIds(await loadStore());
  return withKeepAlive(runSync(ids.map((id) => CONNECTORS[id]())), () => browser.runtime.getPlatformInfo());
};

export default defineBackground(() => {
  const ensureAlarm = async () => {
    if (!(await browser.alarms.get(ALARM))) await browser.alarms.create(ALARM, { periodInMinutes: 30 });
  };

  browser.runtime.onInstalled.addListener((details) => {
    void handleInstalled(details.reason, {
      ensureAlarm,
      sync: syncNow,
      openDashboard: () => browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') }),
    });
  });
  browser.runtime.onStartup.addListener(() => void ensureAlarm());
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void syncNow();
  });

  const route = createRouter({
    sync: () => syncNow(),
    syncIfStale: async () => {
      const { syncMeta } = await loadStore();
      return isStale(syncMeta, new Date()) ? syncNow() : null;
    },
    probe: () => probe(),
    collectFixtures: () => collectFixtures(),
    captureDue: async (msg, sender) => {
      const c = acceptCapture(msg, sender?.url, new Date());
      if (c) await saveCapturedDue(c);
      return Boolean(c);
    },
  });

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const pending = route(msg, { url: sender.url });
    if (!pending) return undefined;
    pending.then(sendResponse, (e) => sendResponse({ error: String(e) }));
    return true; // keep the channel open for the async answer
  });
});
