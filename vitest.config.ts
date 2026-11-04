import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
    env: { TZ: 'America/Indiana/Indianapolis' },
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
  },
});
