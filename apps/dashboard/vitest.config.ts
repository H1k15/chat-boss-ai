import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Không dùng @vitejs/plugin-react (ESM-only, xung đột nạp config Vite 5).
// esbuild jsx: 'automatic' đủ để transform TSX cho test component.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
