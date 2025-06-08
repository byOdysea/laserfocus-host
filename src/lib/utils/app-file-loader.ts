import * as logger from '@utils/logger';
import { app, BrowserWindow } from 'electron';
import * as path from 'path';

/**
 * Centralized utility for loading HTML files in Electron apps
 * Handles both development (Vite dev server) and production (packaged) environments
 */
export class AppFileLoader {
    private viteDevServerUrl: string | undefined;
    private appPath: string;

    constructor(viteDevServerUrl?: string) {
        this.viteDevServerUrl = viteDevServerUrl;
        this.appPath = this.determineAppPath();
    }

    private determineAppPath(): string {
        const isDev = process.env.NODE_ENV === 'development';
        return isDev ? process.cwd() : app.getAppPath();
    }

    /**
     * Load an HTML file for an app component
     * @param window - BrowserWindow instance
     * @param componentPath - Path like 'platform/byokwidget' or 'apps/notes'
     * @param loggerPrefix - Prefix for log messages
     */
    async loadAppHtml(
        window: BrowserWindow, 
        componentPath: string, 
        loggerPrefix: string = '[AppFileLoader]'
    ): Promise<void> {
        if (this.viteDevServerUrl) {
            // Development: Load from Vite dev server
            const devUrl = `${this.viteDevServerUrl}/src/ui/${componentPath}/src/index.html`;
            logger.info(`${loggerPrefix} Loading from Vite dev server: ${devUrl}`);
            
            try {
                await window.loadURL(devUrl);
            } catch (error) {
                logger.error(`${loggerPrefix} Failed to load dev URL: ${devUrl}`, error);
                throw error;
            }
        } else {
            // Production: Load from built files with fallbacks
            await this.loadProductionFile(window, componentPath, loggerPrefix);
        }
    }

    private async loadProductionFile(
        window: BrowserWindow, 
        componentPath: string, 
        loggerPrefix: string
    ): Promise<void> {
        const possiblePaths = this.getProductionPaths(componentPath);
        
        for (let i = 0; i < possiblePaths.length; i++) {
            const currentPath = possiblePaths[i];
            logger.info(`${loggerPrefix} Attempting to load file: ${currentPath}`);
            
            try {
                await window.loadFile(currentPath);
                logger.info(`${loggerPrefix} Successfully loaded file: ${currentPath}`);
                return;
            } catch (error) {
                logger.warn(`${loggerPrefix} Failed to load file: ${currentPath}`, error);
                
                // If this is the last attempt, throw the error
                if (i === possiblePaths.length - 1) {
                    logger.error(`${loggerPrefix} All file loading attempts failed for component: ${componentPath}`);
                    throw new Error(`Failed to load HTML file for component ${componentPath}. Tried paths: ${possiblePaths.join(', ')}`);
                }
            }
        }
    }

    private getProductionPaths(componentPath: string): string[] {
        // Try multiple possible path structures to handle different packaging scenarios
        return [
            // Standard expected path
            path.join(this.appPath, `dist/ui/${componentPath}/src/index.html`),
            
            // Alternative path structure
            path.join(this.appPath, 'dist', 'ui', ...componentPath.split('/'), 'src', 'index.html'),
            
            // Flattened structure (if build process changes)
            path.join(this.appPath, 'dist', 'ui', 'src', 'ui', componentPath, 'src', 'index.html'),
            
            // Direct dist path
            path.join(this.appPath, 'dist', componentPath, 'src', 'index.html'),
        ];
    }

    /**
     * Get the current environment type
     */
    isDevelopment(): boolean {
        return !!this.viteDevServerUrl;
    }

    /**
     * Get the app base path
     */
    getAppPath(): string {
        return this.appPath;
    }
}

/**
 * Factory function to create an AppFileLoader instance
 */
export function createAppFileLoader(viteDevServerUrl?: string): AppFileLoader {
    return new AppFileLoader(viteDevServerUrl);
} 