// src/ui/athena-widget.ts
import { getWindowRegistry } from '@/core/platform/windows/window-registry';
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
            height: 500, 
            title: 'Athena Conversation Monitor', // Unique, descriptive title
            webPreferences: {
                preload: this.preloadPath,
                nodeIntegration: false,
                contextIsolation: true,
            },
            frame: false,
            transparent: true,
            vibrancy: 'sidebar',
            x: primaryDisplay.workArea.x + primaryDisplay.workAreaSize.width - 350 - 20, // Top-right X
            y: primaryDisplay.workArea.y + 20, // Top-right Y
            alwaysOnTop: false,
            show: false, // Initially hidden
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
            
            // Register with Window Registry for better modularity
            const windowRegistry = getWindowRegistry();
            windowRegistry.registerWindow({
                id: 'athena-widget',
                title: 'Athena Conversation Monitor',
                type: 'platform',
                componentName: 'AthenaWidget',
                window: this.window,
                instance: this,
                capabilities: ['conversation-monitor', 'chat-display', 'agent-status']
            });
            
            logger.info('[AthenaWidgetWindow] Registered with Window Registry');

            // Show window when ready
            this.window.once('ready-to-show', () => {
                this.show();
                logger.info('[AthenaWidgetWindow] Window is ready and shown');
            });

        } catch (error) {
            logger.error('[AthenaWidgetWindow] Failed to load HTML file:', error);
            throw error;
        }
    }

    show(): void {
        if (this.window && !this.window.isDestroyed()) {
            // If window is minimized, restore it
            if (this.window.isMinimized()) {
                this.window.restore();
            }
            
            // Show the window if it's hidden
            if (!this.window.isVisible()) {
                this.window.show();
            }
            
            // Focus the window
            this.window.focus();
            this.window.webContents.focus();
        }
    }

    focus(): void {
        if (this.window && !this.window.isDestroyed()) {
            // If window is minimized, restore it
            if (this.window.isMinimized()) {
                this.window.restore();
            }
            
            // Show the window if it's hidden
            if (!this.window.isVisible()) {
                this.window.show();
            }
            
            // Focus the window
            this.window.focus();
            this.window.webContents.focus();
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
