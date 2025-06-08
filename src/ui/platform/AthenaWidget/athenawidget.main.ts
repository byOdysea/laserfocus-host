// src/ui/athena-widget.ts
import { createAppFileLoader } from '@lib/utils/app-file-loader';
import * as logger from '@utils/logger';
import { BrowserWindow, Display } from 'electron';


export class AthenaWidgetWindow {
    public window: BrowserWindow;
    private fileLoader: ReturnType<typeof createAppFileLoader>;
    private preloadPath: string;

    constructor(primaryDisplay: Display, viteDevServerUrl: string | undefined, preloadPath: string) {
        this.fileLoader = createAppFileLoader(viteDevServerUrl);
        this.preloadPath = preloadPath;
        this.window = new BrowserWindow({
            width: 350, 
            height: 250, 
            title: 'Laserfocus',
            webPreferences: {
                preload: this.preloadPath,
                nodeIntegration: true,
                contextIsolation: true,
            },
            frame: false,
            transparent: true,
            vibrancy: 'sidebar',
            x: primaryDisplay.workArea.x + primaryDisplay.workAreaSize.width - 350 - 20, // Top-right X
            y: primaryDisplay.workArea.y + 20, // Top-right Y
            alwaysOnTop: false,
        });
    }

    async init(): Promise<void> {
        try {
            await this.fileLoader.loadAppHtml(
                this.window, 
                'platform/AthenaWidget', 
                '[AthenaWidgetWindow]'
            );
            logger.info('[AthenaWidgetWindow] Successfully loaded HTML file');
        } catch (error) {
            logger.error('[AthenaWidgetWindow] Failed to load HTML file:', error);
            throw error;
        }
        // logger.info('[AthenaWidgetWindow] Attempting to open DevTools for AthenaWidget...');
        // this.window.webContents.openDevTools({ mode: 'detach' });
        // logger.info('[AthenaWidgetWindow] Called openDevTools for AthenaWidget.');
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

    sendConversationUpdate(type: string, content: string): void {
        if (this.window && this.window.webContents && !this.window.isDestroyed()) {
            this.window.webContents.send('conversation-update', { type, content });
        }
    }
}
