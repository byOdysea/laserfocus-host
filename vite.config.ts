import * as fs from 'fs';
import * as path from 'path';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import {
    createUIDiscoveryPlugin,
    discoverAppsFromFileSystem,
    generateViteElectronEntries,
    generateViteInputs
} from './src/core/infrastructure/build/vite-app-discovery';

// Discover UI components automatically
const discoveredUIComponents = discoverAppsFromFileSystem('src/ui');
const electronEntries = generateViteElectronEntries(discoveredUIComponents);
const rollupInputs = generateViteInputs(discoveredUIComponents);

// Create input mapping for JavaScript/TypeScript files and HTML files
const allInputs: Record<string, string> = {};

// Add preload entries
Object.assign(allInputs, rollupInputs);

// Add HTML entries and renderer scripts
discoveredUIComponents.forEach(component => {
  const htmlPath = path.resolve(__dirname, `src/ui/${component.fullPath}/src/index.html`);
  if (fs.existsSync(htmlPath)) {
    // Use just the component path without src/ui prefix for the key
    const htmlKey = `${component.fullPath}/src/index`;
    allInputs[htmlKey] = htmlPath;
  }
  
  const rendererPath = path.resolve(__dirname, `src/ui/${component.fullPath}/src/renderer.ts`);
  if (fs.existsSync(rendererPath)) {
    const rendererKey = `${component.name}-renderer`;
    allInputs[rendererKey] = rendererPath;
  }
  
  // Also check for .tsx files
  const rendererTsxPath = path.resolve(__dirname, `src/ui/${component.fullPath}/src/renderer.tsx`);
  if (fs.existsSync(rendererTsxPath)) {
    const rendererKey = `${component.name}-renderer`;
    allInputs[rendererKey] = rendererTsxPath;
  }
});

// Custom plugin to fix HTML file output paths and asset references
function fixHTMLOutputPlugin() {
  return {
    name: 'fix-html-output',
    writeBundle(options: any, bundle: any) {
      // After files are written, move HTML files to correct locations and fix asset paths
      const fs = require('fs');
      const path = require('path');
      
      Object.keys(bundle).forEach(fileName => {
        if (fileName.endsWith('.html')) {
          let wrongPath, correctPath;
          
          if (fileName.startsWith('src/ui/')) {
            // Handle files like 'src/ui/platform/AthenaWidget/src/index.html'
            const relativePath = fileName.replace('src/ui/', '');
            wrongPath = path.join('dist/ui', fileName);
            correctPath = path.join('dist/ui', relativePath);
          } else {
            // Handle files like 'apps/notes/src/index.html'
            wrongPath = path.join('dist/ui/src/ui', fileName);
            correctPath = path.join('dist/ui', fileName);
          }
          
          if (fs.existsSync(wrongPath)) {
            // Ensure correct directory exists
            const correctDir = path.dirname(correctPath);
            if (!fs.existsSync(correctDir)) {
              fs.mkdirSync(correctDir, { recursive: true });
            }
            
            // Read and fix asset paths in HTML content
            let htmlContent = fs.readFileSync(wrongPath, 'utf-8');
            
            // Calculate correct relative path from final location to assets
            const htmlDir = path.dirname(correctPath);
            const assetsDir = path.join('dist/ui/assets');
            const relativePath = path.relative(htmlDir, assetsDir).replace(/\\/g, '/');
            
            // Fix asset paths - replace overly nested paths with correct relative path
            htmlContent = htmlContent.replace(/\.\.\/(\.\.\/)*assets\//g, `${relativePath}/`);
            
            // Write the fixed HTML content to correct location
            fs.writeFileSync(correctPath, htmlContent);
            
            // Remove the original file
            fs.unlinkSync(wrongPath);
            
            // Remove empty directories
            try {
              let currentDir = path.dirname(wrongPath);
              while (currentDir !== 'dist/ui' && currentDir !== 'dist') {
                if (fs.readdirSync(currentDir).length === 0) {
                  fs.rmdirSync(currentDir);
                  currentDir = path.dirname(currentDir);
                } else {
                  break;
                }
              }
            } catch (e) {
              // Directory not empty or other error, that's fine
            }
          }
        }
      });
    }
  };
}

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
            outDir: 'dist/main',
          },
        },
      },
      // Dynamically discovered app entries for preloads
      ...electronEntries,
    ]),
    renderer(),
    fixHTMLOutputPlugin(),
  ],
  build: {
    rollupOptions: {
      input: allInputs,
      output: {
        dir: 'dist/ui',
        entryFileNames: (chunkInfo) => {
          // For HTML files, preserve the directory structure but remove any src/ui prefix
          if (chunkInfo.name.includes('/src/index')) {
            // The chunk name is like 'platform/AthenaWidget/src/index'
            // We want output like 'platform/AthenaWidget/src/index.html'
            return `${chunkInfo.name}.html`;
          }
          // For other files (JS), put them in assets
          return `assets/[name]-[hash].js`;
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    outDir: 'dist/ui',
  },
});
