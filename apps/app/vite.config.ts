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
const pyodidePackageFiles = [
  'numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
  'pandas-3.0.2-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
  'python_dateutil-2.9.0.post0-py2.py3-none-any.whl',
  'pytz-2026.1.post1-py2.py3-none-any.whl',
  'six-1.17.0-py2.py3-none-any.whl',
  'scipy-1.18.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
  'matplotlib-3.10.8-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
  'contourpy-1.3.3-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
  'cycler-0.12.1-py3-none-any.whl',
  'fonttools-4.62.1-py3-none-any.whl',
  'kiwisolver-1.5.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
  'packaging-26.1-py3-none-any.whl',
  'pillow-12.2.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
  'pyparsing-3.3.2-py3-none-any.whl',
].map((file) => fileURLToPath(new URL(`./vendor/pyodide/${file}`, import.meta.url)));

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
        {
          src: pyodidePackageFiles,
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
