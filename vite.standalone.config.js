import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));

// Standalone offline build:
//  - swaps the Supabase dataStore for the local IndexedDB one
//  - emits a single JS + single CSS (inlined into one HTML by scripts/inline-standalone.js)
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // App.jsx imports './dataStore.js', ImageSlot.jsx imports './dataStore' — both
      // point here in the standalone build (whole specifier matched, so it's fully replaced).
      { find: /^\.\/dataStore(\.js)?$/, replacement: path.resolve(dir, 'src/dataStore.local.js') },
    ],
  },
  build: {
    outDir: 'dist-standalone',
    assetsInlineLimit: 100000000, // inline every asset
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100000,
    rollupOptions: {
      input: path.resolve(dir, 'standalone.html'),
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
});
