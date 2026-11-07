/**
 * Built for Firefox? WXT replaces import.meta.env.FIREFOX with a boolean at build time (so the other browser's branch
 * is dropped from the bundle); the test runner passes the string "false", which would otherwise count as true.
 */
export const IS_FIREFOX: boolean = import.meta.env.FIREFOX === true || String(import.meta.env.FIREFOX) === 'true';
