import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  resolve: {
    // The extension ships pdf.js's modern build; Node (the test runner) needs its legacy build, same API.
    alias: { 'pdfjs-dist/build/pdf.min.mjs': 'pdfjs-dist/legacy/build/pdf.mjs' },
  },
  test: {
    environment: 'happy-dom',
    env: { TZ: 'America/Indiana/Indianapolis' },
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
  },
});
