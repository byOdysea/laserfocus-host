import { BrowserWindow, Display } from 'electron';
import { createAppFileLoader } from '@lib/utils/app-file-loader';
import * as logger from '@utils/logger';

export class RemindersWindow {
    public window: BrowserWindow;
    private fileLoader: ReturnType<typeof createAppFileLoader>;
    private preloadPath: string;

    constructor(primaryDisplay: Display, viteDevServerUrl: string | undefined, preloadPath: string) {
        this.fileLoader = createAppFileLoader(viteDevServerUrl);
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

    async init(): Promise<void> {
        try {
            await this.fileLoader.loadAppHtml(
                this.window, 
                'apps/reminders', 
                '[RemindersWindow]'
            );
            logger.info('[RemindersWindow] Successfully loaded HTML file');
        } catch (error) {
            logger.error('[RemindersWindow] Failed to load HTML file:', error);
            throw error;
        }
        
        // Open DevTools in development
        if (this.fileLoader.isDevelopment()) {
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