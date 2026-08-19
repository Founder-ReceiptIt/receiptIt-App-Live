import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  // Receipt originals and extracted purchase data must not be left in a
  // production browser console. Development diagnostics remain available.
  esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : undefined,
}));
