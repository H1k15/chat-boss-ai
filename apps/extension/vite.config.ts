import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync } from 'fs';

// Copy các file tĩnh mà Chrome cần nhưng vite không bundle: manifest.json,
// popup.html, sidebar.css. Thiếu manifest.json là KHÔNG load được extension.
function copyStatic() {
  return {
    name: 'copy-static',
    closeBundle() {
      const files: [string, string][] = [
        ['manifest.json', 'dist/manifest.json'],
        ['popup.html', 'dist/popup.html'],
        ['src/sidebar.css', 'dist/sidebar.css'],
      ];
      for (const [from, to] of files) {
        copyFileSync(resolve(__dirname, from), resolve(__dirname, to));
      }
    },
  };
}

// Build nhiều entry (content, background, popup) ra apps/extension/dist.
export default defineConfig({
  plugins: [copyStatic()],
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
