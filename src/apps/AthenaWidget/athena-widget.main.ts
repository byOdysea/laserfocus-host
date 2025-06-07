// src/ui/athena-widget.ts
import { BrowserWindow, Display, app } from 'electron';
import * as path from 'path';
import * as logger from '../../utils/logger';


export class AthenaWidgetWindow {
    public window: BrowserWindow;
    private viteDevServerUrl: string | undefined;
    private preloadPath: string;

    constructor(primaryDisplay: Display, viteDevServerUrl: string | undefined, preloadPath: string) {
        this.viteDevServerUrl = viteDevServerUrl;
        this.preloadPath = preloadPath;
        this.window = new BrowserWindow({
            width: 350, // Made smaller
            height: 250, // Made smaller
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

    init(): void {
        if (this.viteDevServerUrl) {
            this.window.loadURL(`${this.viteDevServerUrl}/src/apps/AthenaWidget/index.html`);
        } else {
            const basePath = app.getAppPath();
            const rendererPath = path.join(basePath, 'dist/apps/AthenaWidget/index.html');
            logger.info(`[AthenaWidgetWindow] Attempting to load file from: ${rendererPath}`);
            this.window.loadFile(rendererPath);
        }
        // logger.info('[AthenaWidgetWindow] Attempting to open DevTools for AthenaWidget...');
        // this.window.webContents.openDevTools({ mode: 'detach' });
        // logger.info('[AthenaWidgetWindow] Called openDevTools for AthenaWidget.');
    }

    sendConversationUpdate(type: string, content: string): void {
        if (this.window && this.window.webContents && !this.window.isDestroyed()) {
            this.window.webContents.send('conversation-update', { type, content });
        }
    }
}
