import { APP_NAME, IS_DEV, VITE_DEV_SERVER_URL } from '@core/config/config';
import { CanvasEngine } from '@core/engine/canvas-engine';
import * as logger from '@utils/logger';
import 'dotenv/config'; // Ensure this is at the very top
import { app, BrowserWindow, Display, screen } from 'electron';
import { initializeBridge } from './core/bridge/bridge.service';
console.log('--- [main.ts] Script execution started ---');

// Configuration, Utilities, and Services
import { UIDiscoveryService } from '@core/app-discovery/main-process-discovery';
import { initializeCanvasEngineAuto } from '@core/engine/engine.service';

// Set the application name as early as possible.
app.setName(APP_NAME);
logger.info(`[App] App name set to "${APP_NAME}" at top-level.`);

// Global references to services and the engine
let uiDiscoveryService: UIDiscoveryService | undefined;
let canvasEngineInstance: CanvasEngine | undefined;

const initializeApp = async (): Promise<void> => {
    logger.info(`[initializeApp] Current NODE_ENV: ${process.env.NODE_ENV}`);
    logger.info(`[initializeApp] IS_DEV: ${IS_DEV}`);
    logger.info(`[initializeApp] VITE_DEV_SERVER_URL: ${VITE_DEV_SERVER_URL}`);
    logger.info(`[initializeApp] DIST path: ${process.env.DIST}`);
    logger.info(`[initializeApp] __dirname: ${__dirname}`);

    const primaryDisplay: Display = screen.getPrimaryDisplay();
    
    // Initialize Core Engine first (now with graceful degradation)
    try {
        canvasEngineInstance = await initializeCanvasEngineAuto();
        logger.info(`[initializeApp] Canvas Engine initialized successfully.`);
    } catch (error) {
        logger.warn(`[initializeApp] Canvas Engine initialization completed with warnings: ${error instanceof Error ? error.message : String(error)}. Continuing with limited functionality.`);
        // Don't quit - the engine can start in limited mode
        if (!canvasEngineInstance) {
            logger.error(`[initializeApp] No engine instance available. This should not happen with graceful initialization.`);
            app.quit();
            return;
        }
    }

    // Initialize UI Discovery Service with Canvas Engine
    uiDiscoveryService = new UIDiscoveryService({
        uiDir: 'src/ui',
        primaryDisplay,
        viteDevServerUrl: VITE_DEV_SERVER_URL,
        preloadBasePath: __dirname,
        canvasEngine: canvasEngineInstance,
    });

    // Set UI Discovery Service reference in Canvas Engine for accessing available components
    canvasEngineInstance.setUIDiscoveryService(uiDiscoveryService);

    // Discover and initialize all UI components automatically
    const { appInstances, appModules } = await uiDiscoveryService.discoverAndInitializeUIComponents();

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