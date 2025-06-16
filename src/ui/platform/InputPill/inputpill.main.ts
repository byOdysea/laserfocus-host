// src/apps/InputPill/input-pill.main.ts
import { getWindowRegistry } from '@/core/platform/windows/window-registry';
import { createAppFileLoader } from '@lib/utils/app-file-loader';
import * as logger from '@utils/logger';
import { BrowserWindow, Display, ipcMain } from 'electron';

const INPUT_PILL_WIDTH = 700;
const INPUT_PILL_HEIGHT = 60;
const INPUT_PILL_Y_OFFSET_FROM_BOTTOM = 60;

export class InputPill {
    public window: BrowserWindow | null = null;
    private fileLoader: ReturnType<typeof createAppFileLoader>;
    private primaryDisplay: Display;
    private preloadScriptPath: string;

    constructor(
        primaryDisplay: Display,
        viteDevServerUrl: string | undefined,
        preloadScriptPath: string
    ) {
        this.primaryDisplay = primaryDisplay;
        this.fileLoader = createAppFileLoader(viteDevServerUrl);
        this.preloadScriptPath = preloadScriptPath;
    }

    public async init(): Promise<void> {
        const workArea = this.primaryDisplay.workArea;

        const x = Math.round(workArea.x + (workArea.width - INPUT_PILL_WIDTH) / 2);
        const y = Math.round(workArea.y + workArea.height - INPUT_PILL_HEIGHT - INPUT_PILL_Y_OFFSET_FROM_BOTTOM);

        this.window = new BrowserWindow({
            width: INPUT_PILL_WIDTH,
            height: INPUT_PILL_HEIGHT,
            title: 'Laserfocus Input Interface', // Unique, descriptive title
            x: x,
            y: y,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            show: false, // Initially hidden
            resizable: false,
            movable: true,
            skipTaskbar: true,
            webPreferences: {
                preload: this.preloadScriptPath,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        this.window.setAlwaysOnTop(true, 'floating');
        this.window.setVisibleOnAllWorkspaces(true);
        this.window.setFullScreenable(false);

        try {
            await this.fileLoader.loadAppHtml(
                this.window, 
                'platform/InputPill', 
                '[InputPill.main]'
            );
            logger.info('[InputPill.main] Successfully loaded HTML file');
            
            // Register with Window Registry for better modularity
            const windowRegistry = getWindowRegistry();
            windowRegistry.registerWindow({
                id: 'input-pill',
                title: 'Laserfocus Input Interface',
                type: 'platform',
                componentName: 'InputPill',
                window: this.window,
                instance: this,
                capabilities: ['user-input', 'command-interface', 'floating-ui']
            });
            
            logger.info('[InputPill.main] Registered with Window Registry');
        } catch (error) {
            logger.error('[InputPill.main] Failed to load HTML file:', error);
            throw error;
        }

        this.window.once('ready-to-show', () => {
            if (this.window) {
                this.show(); // Show and focus immediately
                logger.info('[InputPill.main] Window is ready and shown.');
            }
        });

        this.window.on('closed', () => {
            logger.info('[InputPill.main] Window closed.');
            this.window = null;
        });

        // Example: Listen for an event to show the InputPill
        ipcMain.on('show-input-pill', () => {
            this.show();
        });
    }

    public show(): void {
        if (this.window && !this.window.isDestroyed()) {
            logger.info('[InputPill.main] Showing window.');
            
            // If window is minimized, restore it
            if (this.window.isMinimized()) {
                this.window.restore();
            }
            
            // Show the window if it's hidden
            if (!this.window.isVisible()) {
                this.window.show();
            }
            
            // Focus the window and input
            this.window.focus();
            this.window.webContents.focus();
            
            // Focus the input element
            this.window.webContents.executeJavaScript(`
                (() => {
                    const input = document.getElementById('query-input');
                    if (input) {
                        input.focus();
                    }
                })();
            `);
        }
    }

    public hide(): void {
        if (this.window && this.window.isVisible()) {
            logger.info('[InputPill.main] Hiding window.');
            this.window.hide();
        }
    }

    public getBrowserWindow(): BrowserWindow | null {
        return this.window;
    }
}
