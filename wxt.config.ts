import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
  },
  manifest: {
    name: 'DueBoard',
    description: 'All your Brightspace and Gradescope deadlines in one new tab.',
    permissions: ['storage', 'alarms', 'offscreen', 'activeTab', 'scripting'],
    host_permissions: ['https://purdue.brightspace.com/*', 'https://www.gradescope.com/*', 'https://mylab.pearson.com/*'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
