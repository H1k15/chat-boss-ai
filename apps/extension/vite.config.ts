import { defineConfig } from 'vite';
import { resolve } from 'path';

// Build nhiều entry (content, background, popup) ra apps/extension/dist.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/index.ts'),
        background: resolve(__dirname, 'src/background/index.ts'),
        popup: resolve(__dirname, 'src/popup/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  resolve: {
    alias: { '@cba/shared': resolve(__dirname, '../../packages/shared/src') },
  },
});
