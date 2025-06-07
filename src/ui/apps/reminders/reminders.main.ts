import { BrowserWindow, Display, app } from 'electron';
import * as path from 'path';
import * as logger from '@utils/logger';

export class RemindersWindow {
    public window: BrowserWindow;
    private viteDevServerUrl: string | undefined;
    private preloadPath: string;

    constructor(primaryDisplay: Display, viteDevServerUrl: string | undefined, preloadPath: string) {
        this.viteDevServerUrl = viteDevServerUrl;
        this.preloadPath = preloadPath;
        this.window = new BrowserWindow({
            width: 800,
            height: 600,
            title: 'reminders',
            webPreferences: {
                preload: this.preloadPath,
                nodeIntegration: false,
                contextIsolation: true,
            },
            frame: false,
            backgroundColor: '#ffffff',
            show: false, // Don't show until ready
            minWidth: 400,
            minHeight: 300,
        });

        // Show window when ready to prevent visual flash
        this.window.once('ready-to-show', () => {
            this.window.show();
        });
    }

    init(): void {
        if (this.viteDevServerUrl) {
            // Development: Load from Vite dev server
            const devPath = 'apps/reminders';
            this.window.loadURL(`${this.viteDevServerUrl}/src/ui/${devPath}/src/index.html`);
            logger.info('[RemindersWindow] Loading from Vite dev server');
        } else {
            // Production: Load from built files
            const basePath = app.getAppPath();
            const prodPath = 'apps/reminders';
            const rendererPath = path.join(basePath, `dist/ui/${prodPath}/src/index.html`);
            logger.info(`[RemindersWindow] Loading from built file: ${rendererPath}`);
            this.window.loadFile(rendererPath);
        }
        
        // Open DevTools in development
        if (this.viteDevServerUrl) {
            // this.window.webContents.openDevTools({ mode: 'detach' });
        }
    }

    focus(): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.focus();
        }
    }

    close(): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.close();
        }
    }
}