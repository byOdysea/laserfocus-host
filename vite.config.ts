import * as path from 'path';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import {
    createUIDiscoveryPlugin,
    discoverAppsFromFileSystem,
  generateViteElectronEntries,
  generateViteInputs
} from './src/core/app-discovery/vite-app-discovery';

// Discover UI components automatically
const discoveredUIComponents = discoverAppsFromFileSystem('src/ui');
const electronEntries = generateViteElectronEntries(discoveredUIComponents);
const rollupInputs = generateViteInputs(discoveredUIComponents);

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@lib': path.resolve(__dirname, 'src/lib'),
      '@types': path.resolve(__dirname, 'src/lib/types'),
      '@utils': path.resolve(__dirname, 'src/lib/utils'),
      '@ui': path.resolve(__dirname, 'src/ui'),
    },
  },
  plugins: [
    createUIDiscoveryPlugin(),
    electron([
      {
        // Main process entry file
        entry: 'src/main.ts',
        vite: {
          resolve: {
            alias: {
              '@': path.resolve(__dirname, 'src'),
              '@core': path.resolve(__dirname, 'src/core'),
              '@lib': path.resolve(__dirname, 'src/lib'),
              '@types': path.resolve(__dirname, 'src/lib/types'),
              '@utils': path.resolve(__dirname, 'src/lib/utils'),
              '@ui': path.resolve(__dirname, 'src/ui'),
            },
          },
          build: {
            outDir: 'dist/main', // Output directory for main process
          },
        },
      },
      // Dynamically discovered app entries
      ...electronEntries,
    ]),
    renderer(), // The plugin will adapt Vite's output for Electron renderers
  ],
  build: {
    // This part is for the renderer code if not handled by the renderer plugin specifically
    // For multiple HTML pages, the renderer plugin handles their specific build outputs.
    rollupOptions: {
      input: rollupInputs,
    },
    outDir: 'dist/renderer', // Default output for renderer if not specified per page
  },
  // Optional: If you have assets in a public directory
  // publicDir: 'public',
});
