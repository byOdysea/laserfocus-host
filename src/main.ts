import 'dotenv/config'; // Ensure this is at the very top
console.log('--- [main.ts] Script execution started ---');
import { app, BrowserWindow, screen, Display } from 'electron';
import * as path from 'path'; // Keep for preload paths if still needed, or general path joining

// Configuration, Utilities, and Services
import * as logger from './utils/logger';
import { APP_NAME, VITE_DEV_SERVER_URL, IS_DEV } from './core/config/app-config';
import { initializeCanvasEngine } from './core/engine/engine.service';
import { AthenaWidgetWindow } from './apps/AthenaWidget/athena-widget.main';
import AthenaWidgetIpcHandlers from './apps/AthenaWidget/athena-widget.ipc';
import { InputPill } from './apps/InputPill/input-pill.main';
import InputPillIpcHandlers from './apps/InputPill/input-pill.ipc'; // Added import
import { initializeBridge } from './core/bridge/bridge.service';
import { AppIpcModule, AppMainProcessInstances } from './core/bridge/types'; // Added import

// Set the application name as early as possible.
app.setName(APP_NAME);
logger.info(`[App] App name set to "${APP_NAME}" at top-level.`);

// Global references to UI components and the engine
let athenaWidget: AthenaWidgetWindow | undefined;
let inputPill: InputPill | undefined;
let canvasEngineInstance: import('./core/engine/canvas-engine').CanvasEngine | undefined;

const initializeApp = async (): Promise<void> => {
    logger.info(`[initializeApp] Current NODE_ENV: ${process.env.NODE_ENV}`);
    logger.info(`[initializeApp] IS_DEV: ${IS_DEV}`);
    logger.info(`[initializeApp] VITE_DEV_SERVER_URL: ${VITE_DEV_SERVER_URL}`);
    logger.info(`[initializeApp] DIST path: ${process.env.DIST}`);
    logger.info(`[initializeApp] __dirname: ${__dirname}`);

    const primaryDisplay: Display = screen.getPrimaryDisplay();
    
    // Initialize UI Components
    try {
        inputPill = new InputPill(primaryDisplay, VITE_DEV_SERVER_URL, path.join(__dirname, '../apps/InputPill/preload.js'));
        inputPill.init();
        logger.info('[initializeApp] InputPill initialized.');
    } catch (error) {
        logger.error('[initializeApp] Failed to initialize InputPill:', error);
    }

    try {
        athenaWidget = new AthenaWidgetWindow(primaryDisplay, VITE_DEV_SERVER_URL, path.join(__dirname, '../apps/AthenaWidget/preload.js'));
        athenaWidget.init();
        logger.info('[initializeApp] AthenaWidgetWindow initialized.');
    } catch (error) {
        logger.error('[initializeApp] Failed to initialize AthenaWidgetWindow:', error);
    }

    // Initialize Core Engine
    try {
        // Pass the window instances to the engine initializer
        canvasEngineInstance = initializeCanvasEngine(
            inputPill?.window ?? undefined, 
            athenaWidget?.window ?? undefined
        );
    } catch (error) {
        logger.error(`[initializeApp] Critical error during CanvasEngine initialization: ${error instanceof Error ? error.message : String(error)}. Application will exit.`);
        app.quit();
        return; // Prevent further execution if engine fails
    }

    // Prepare for modular IPC handler registration
    const appInstances: AppMainProcessInstances = new Map();
    if (inputPill) {
        appInstances.set('inputPill', inputPill);
    }
    if (athenaWidget) {
        appInstances.set('athenaWidget', athenaWidget);
    }

    // This array will be populated with AppIpcModule implementations from each app
    const appModules: AppIpcModule[] = []; 
    if (inputPill) {
        appModules.push(InputPillIpcHandlers);
    }
    if (athenaWidget) {
        appModules.push(AthenaWidgetIpcHandlers);
    }

    // Register IPC Handlers (after engine and UI components are ready)
    if (canvasEngineInstance) {
        try {
            initializeBridge(canvasEngineInstance, appModules, appInstances);
        } catch (error) {
            logger.error(`[initializeApp] Critical error during IPC Bridge initialization: ${error instanceof Error ? error.message : String(error)}. Application will exit.`);
            app.quit();
            return;
        }
    } else {
        logger.error('[initializeApp] CanvasEngine not available, cannot initialize IPC bridge. This should not happen if engine init is successful.');
        app.quit();
        return;
    }
};

// Electron App Lifecycle
app.whenReady().then(() => {
    logger.info("[App] Electron is ready. Calling initializeApp.");
    initializeApp();
}).catch(e => {
    logger.error("[App] Error during app.whenReady or initializeApp:", e);
});

app.on('window-all-closed', () => {
    logger.info("[App] All windows closed.");
    // On macOS it's common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        logger.info("[App] Quitting application (not macOS).");
        app.quit();
    }
});

app.on('activate', () => {
    logger.info("[App] 'activate' event received (e.g., clicking dock icon on macOS).");
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        logger.info("[App] No windows open, calling initializeApp to re-initialize.");
        initializeApp();
    }
});

// Global Error Handling for the Main Process
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    // Currently logging; consider app.quit() for production robustness.
});