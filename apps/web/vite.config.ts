/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Use the shared package's TypeScript source directly, so changes show up without a rebuild.
      '@slotbook/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      // shadcn-style imports such as "@/lib/utils".
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // The browser calls /api/...; Vite forwards it to the NestJS API without the /api prefix.
    // API_PROXY_TARGET lets the E2E run point at its own API instance.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
