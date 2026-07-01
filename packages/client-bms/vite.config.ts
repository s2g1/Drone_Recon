import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/bms/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5174,
  },
  test: {
    globals: true,
  },
});
