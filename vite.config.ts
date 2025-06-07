import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

export default defineConfig({
  plugins: [
    electron([
      {
        // Main process entry file
        entry: 'src/main.ts',
        vite: {
          build: {
            outDir: 'dist/main', // Output directory for main process
          },
        },
      },
      {
        // Preload script for InputPill
        entry: 'src/apps/InputPill/preload.ts',
        onstart(options) {
          options.reload(); // Reload Electron page on preload script change
        },
        vite: {
          build: {
            outDir: 'dist/apps/InputPill', // Output directory for InputPill preload
          },
        },
      },
      {
        // Preload script for AthenaWidget
        entry: 'src/apps/AthenaWidget/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist/apps/AthenaWidget', // Output directory for AthenaWidget preload
          },
        },
      },
    ]),
    renderer(), // The plugin will adapt Vite's output for Electron renderers
  ],
  build: {
    // This part is for the renderer code if not handled by the renderer plugin specifically
    // For multiple HTML pages, the renderer plugin handles their specific build outputs.
    rollupOptions: {
      input: {
        inputPill: path.resolve(__dirname, 'src/apps/InputPill/index.html'),
        athenaWidget: path.resolve(__dirname, 'src/apps/AthenaWidget/index.html'),
      },
    },
    outDir: 'dist/renderer', // Default output for renderer if not specified per page
  },
  // Optional: If you have assets in a public directory
  // publicDir: 'public',
});
