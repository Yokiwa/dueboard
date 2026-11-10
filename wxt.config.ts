import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { manifestOrigins } from './src/core/platformRegistry';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
  },
  manifest: ({ browser }) => ({
    name: 'DueBoard',
    description: 'Every deadline from Brightspace and the homework platforms your courses use, on one page.',
    permissions: ['storage', 'alarms', 'activeTab', 'scripting', 'declarativeNetRequestWithHostAccess', ...(browser === 'firefox' ? [] : ['offscreen'])],
    host_permissions: manifestOrigins(),
    // Sites of every known platform are granted at install; anything else is asked for one at a time, with a click.
    optional_host_permissions: ['https://*/*'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'dueboard@yokiwa.github.io',
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['none'] },
            },
            gecko_android: { strict_min_version: '142.0' },
          },
        }
      : {}),
  }),
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
