import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const pyodideDirectory = dirname(fileURLToPath(import.meta.resolve('pyodide')));
const pyodideRuntimeFiles = [
  'pyodide-lock.json',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
].map((file) => join(pyodideDirectory, file).replace(/\\/g, '/'));

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: pyodideRuntimeFiles,
          dest: 'assets/pyodide',
          rename: { stripBase: true },
        },
      ],
    }),
  ],
  optimizeDeps: { exclude: ['pyodide'] },
  worker: { format: 'es' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // В разработке ходим в API через тот же origin — cookie с refresh-токеном
      // ведут себя так же, как в проде.
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
  },
});
