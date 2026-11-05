import { createRouter } from '../background/router';
import { createBrightspaceConnector } from '../connectors/brightspace';
import { createGradescopeConnector } from '../connectors/gradescope';
import { collectFixtures, probe } from '../diagnostics/probe';
import { loadStore } from '../storage/store';
import { isStale, runSync } from '../sync/runSync';
import { offscreenParser } from '../sync/offscreenParser';
import { withKeepAlive } from '../sync/keepAlive';

const ALARM = 'dueboard-sync';

const connectors = () => [createBrightspaceConnector(), createGradescopeConnector({ parser: offscreenParser })];
const syncNow = () => withKeepAlive(runSync(connectors()), () => browser.runtime.getPlatformInfo());

export default defineBackground(() => {
  const ensureAlarm = async () => {
    if (!(await browser.alarms.get(ALARM))) await browser.alarms.create(ALARM, { periodInMinutes: 30 });
  };

  browser.runtime.onInstalled.addListener(() => {
    void ensureAlarm();
    void syncNow();
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
  });

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const pending = route(msg);
    if (!pending) return undefined;
    pending.then(sendResponse, (e) => sendResponse({ error: String(e) }));
    return true; // keep the channel open for the async answer
  });
});
