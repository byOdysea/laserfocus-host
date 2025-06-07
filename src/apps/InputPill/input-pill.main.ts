// src/apps/InputPill/input-pill.main.ts
import { BrowserWindow, Display, ipcMain } from 'electron';
import * as path from 'path';
import * as logger from '../../utils/logger';

const INPUT_PILL_WIDTH = 700;
const INPUT_PILL_HEIGHT = 60;
const INPUT_PILL_Y_OFFSET_FROM_BOTTOM = 60;

export class InputPill {
    public window: BrowserWindow | null = null;
    private primaryDisplay: Display;
    private viteDevServerUrl: string | undefined;
    private preloadScriptPath: string;

    constructor(
        primaryDisplay: Display,
        viteDevServerUrl: string | undefined,
        preloadScriptPath: string
    ) {
        this.primaryDisplay = primaryDisplay;
        this.viteDevServerUrl = viteDevServerUrl;
        this.preloadScriptPath = preloadScriptPath;
    }

    public init(): void {
        const workArea = this.primaryDisplay.workArea;

        const x = Math.round(workArea.x + (workArea.width - INPUT_PILL_WIDTH) / 2);
        const y = Math.round(workArea.y + workArea.height - INPUT_PILL_HEIGHT - INPUT_PILL_Y_OFFSET_FROM_BOTTOM);

        this.window = new BrowserWindow({
            width: INPUT_PILL_WIDTH,
            height: INPUT_PILL_HEIGHT,
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

        if (this.viteDevServerUrl) {
            // Assuming Vite serves InputPill UI at a specific path, e.g., /input-pill.html or /apps/InputPill/index.html
            // Adjust this URL to match your Vite setup for the InputPill UI
            const devUrl = `${this.viteDevServerUrl}src/apps/InputPill/index.html`; // Adjusted path to index.html within src
            logger.info(`[InputPill.main] Loading dev URL: ${devUrl}`);
            this.window.loadURL(devUrl).catch(err => {
                logger.error('[InputPill.main] Failed to load InputPill dev URL:', err);
            });
        } else {
            const prodPath = path.join(__dirname, '../renderer/apps/InputPill/input-pill.html');
            logger.info(`[InputPill.main] Loading production file: ${prodPath}`);
            this.window.loadFile(prodPath).catch(err => {
                logger.error('[InputPill.main] Failed to load InputPill production file:', err);
            });
        }

        this.window.once('ready-to-show', () => {
            if (this.window) {
                this.window.show(); // Decide if it should show immediately or be controlled externally
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
        if (this.window && !this.window.isVisible()) {
            logger.info('[InputPill.main] Showing window.');
            this.window.show();
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
