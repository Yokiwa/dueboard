import { runFinder, type FinderWindow } from '../visits/finders/run';

// Injected by the visit runner into every frame of a platform page it opened through Brightspace.
// Reads the page's text for a due date (or syllabus rows) and reports back. Never clicks or changes anything.
export default defineUnlistedScript(() => {
  runFinder(window as unknown as FinderWindow, (m) => void browser.runtime.sendMessage(m).catch(() => undefined));
});
