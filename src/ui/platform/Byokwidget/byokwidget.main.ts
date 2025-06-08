import { createAppFileLoader } from '@lib/utils/app-file-loader';
import * as logger from '@utils/logger';
import { BrowserWindow, Display } from 'electron';

export class ByokwidgetWindow {
    public window: BrowserWindow;
    private fileLoader: ReturnType<typeof createAppFileLoader>;
    private preloadPath: string;

    constructor(primaryDisplay: Display, viteDevServerUrl: string | undefined, preloadPath: string) {
        this.fileLoader = createAppFileLoader(viteDevServerUrl);
        this.preloadPath = preloadPath;
        
        // Position underneath the Athena widget
        // Athena is at top-right: x: width - 350 - 20, y: 20, size: 350x250
        const athenaX = primaryDisplay.workArea.x + primaryDisplay.workAreaSize.width - 350 - 20;
        const athenaY = primaryDisplay.workArea.y + 20;
        const athenaHeight = 250;
        
        this.window = new BrowserWindow({
            width: 350, // Same width as Athena widget
            height: 120, // Compact height for minimal UI
            title: 'API Key Helper',
            webPreferences: {
                preload: this.preloadPath,
                nodeIntegration: false,
                contextIsolation: true,
            },
            frame: false,
            transparent: true,
            vibrancy: 'sidebar',
            x: athenaX, // Same X position as Athena
            y: athenaY + athenaHeight + 10, // 10px gap below Athena
            alwaysOnTop: false,
            resizable: false,
            show: false, // Don't show until ready
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
                'platform/Byokwidget', 
                '[ByokwidgetWindow]'
            );
            logger.info('[ByokwidgetWindow] Successfully loaded HTML file');
        } catch (error) {
            logger.error('[ByokwidgetWindow] Failed to load HTML file:', error);
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