/** The session rule that lets platform pages load in the frame host's iframes. */
export const FRAME_RULE_ID = 9001;

/**
 * Removes the headers that forbid embedding, for sub-frame requests that belong to no tab (tabId -1: the extension's own
 * hidden page). Pages in real tabs are untouched.
 */
export async function enableFrameHeaders(): Promise<void> {
  await browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [FRAME_RULE_ID],
    addRules: [
      {
        id: FRAME_RULE_ID,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'x-frame-options', operation: 'remove' },
            { header: 'content-security-policy', operation: 'remove' },
          ],
        },
        condition: { tabIds: [-1], resourceTypes: ['sub_frame'] },
      },
    ],
  } as Parameters<typeof browser.declarativeNetRequest.updateSessionRules>[0]);
}

export async function disableFrameHeaders(): Promise<void> {
  await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: [FRAME_RULE_ID] });
}
