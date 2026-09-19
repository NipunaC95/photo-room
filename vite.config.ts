import { defineConfig } from 'vite';

export default defineConfig({
  base: '/photo-room/',
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
});
