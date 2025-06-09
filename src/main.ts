import { APP_NAME, IS_DEV, VITE_DEV_SERVER_URL } from '@core/infrastructure/config/config';
import 'dotenv/config'; // Must be first to load environment variables
// Agent Bridge - Focused agent coordination service
// Configuration Manager - New configuration system
import { config } from '@core/infrastructure/config/configuration-manager';
import * as logger from '@utils/logger';
import { app, BrowserWindow, Display, ipcMain, screen } from 'electron';
logger.info('--- [main.ts] Script execution started with Canvas Engine ---');

// Configuration, Utilities, and Services
import { setUIDiscoveryService, UIDiscoveryService } from '@core/platform/discovery/main-process-discovery';
import { apiKeyManager } from './core/infrastructure/config/api-key-manager';
import { initializeAgentBridge } from './core/platform/ipc/agent-bridge';
import { getWindowRegistry } from './core/platform/windows/window-registry';

// Set the application name as early as possible.
app.setName(APP_NAME);
logger.info(`[App] App name set to "${APP_NAME}" at top-level.`);

// Global references to services and the agent bridge
let uiDiscoveryService: UIDiscoveryService | undefined;
let agentBridge: any | undefined;

const initializeApp = async (): Promise<void> => {
    logger.info(`[initializeApp] Current NODE_ENV: ${process.env.NODE_ENV}`);
    logger.info(`[initializeApp] IS_DEV: ${IS_DEV}`);
    logger.info(`[initializeApp] VITE_DEV_SERVER_URL: ${VITE_DEV_SERVER_URL}`);
    logger.info(`[initializeApp] DIST path: ${process.env.DIST}`);
    logger.info(`[initializeApp] __dirname: ${__dirname}`);

    const primaryDisplay: Display = screen.getPrimaryDisplay();
    
    // Load configuration and API keys
    try {
        await config.load();
        await apiKeyManager.initialize();
        
        // Initialize logger with configuration integration
        logger.initializeWithConfig();
        
        const providerConfig = config.getProvider();
        logger.info(`[initializeApp] Configuration loaded - Provider: ${providerConfig.service}, Model: ${providerConfig.model}`);
    } catch (error) {
        logger.warn(`[initializeApp] Configuration loading failed: ${error instanceof Error ? error.message : String(error)}. Using defaults.`);
    }
    
    // Initialize Agent Bridge (focused agent coordination)
    try {
        logger.info(`[initializeApp] Initializing Agent Bridge...`);
        agentBridge = await initializeAgentBridge();
        logger.info(`[initializeApp] Agent Bridge initialized successfully!`);
    } catch (error) {
        logger.warn(`[initializeApp] Agent initialization completed with warnings: ${error instanceof Error ? error.message : String(error)}. Continuing with limited functionality.`);
        // Don't quit - Agent can start in limited mode without API key
        if (!agentBridge) {
            logger.error(`[initializeApp] No agent bridge instance available.`);
            // Still continue - UI can prompt for API key
        }
    }

    // Initialize UI Discovery Service
    uiDiscoveryService = new UIDiscoveryService({
        uiDir: 'src/ui',
        primaryDisplay,
        viteDevServerUrl: VITE_DEV_SERVER_URL,
        preloadBasePath: __dirname,
    });
    
    // Set the singleton instance for global access
    setUIDiscoveryService(uiDiscoveryService);

    // Discover and initialize all UI components automatically
    const { appInstances, appModules } = await uiDiscoveryService.discoverAndInitializeUIComponents();

    // Register modular IPC handlers that were being ignored
    appModules.forEach(module => {
        const instance = appInstances.get(module.moduleId);
        if (instance) {
            module.registerMainProcessHandlers(ipcMain, instance, appInstances);
            logger.info(`[initializeApp] Registered IPC handlers for ${module.moduleId}`);
        }
    });

    // Agent Bridge automatically sets up IPC handlers - no need for manual bridge init
    logger.info(`[initializeApp] Agent Bridge is ready and IPC handlers are active`);
    
    // Register hot-reload handler for app registry
    ipcMain.handle('ui-discovery:reload-registry', async () => {
        try {
            if (!uiDiscoveryService) {
                return { 
                    success: false, 
                    error: 'UI Discovery Service not available'
                };
            }
            
            logger.info('[initializeApp] Hot-reloading app registry...');
            await uiDiscoveryService.reloadRegistry();
            
            const stats = uiDiscoveryService.getAllApps();
            logger.info(`[initializeApp] Registry hot-reload complete: ${stats.length} apps available`);
            
            return { 
                success: true, 
                appsCount: stats.length,
                availableApps: stats
            };
        } catch (error) {
            logger.error('[initializeApp] Registry hot-reload failed:', error);
            return { 
                success: false, 
                error: error instanceof Error ? error.message : String(error)
            };
        }
    });
    
    // Log Agent status
    if (agentBridge) {
        const status = agentBridge.isReady();
        const providerInfo = agentBridge.getProviderInfo();
        logger.info(`[initializeApp] Agent ready: ${status}, Provider: ${providerInfo.service} (${providerInfo.model})`);
        
        // Send greeting message to AthenaWidget after everything is initialized
        setTimeout(async () => {
            await agentBridge.sendGreetingMessage();
        }, 1000); // Small delay to ensure UI is fully rendered
    }
    
    // Log Window Registry status for enhanced UI system
    const windowRegistry = getWindowRegistry();
    const registryStats = windowRegistry.getStats();
    logger.info(`[initializeApp] Window Registry active - ${registryStats.totalWindows} windows registered`);
    logger.info(`[initializeApp] Window capabilities: ${JSON.stringify(registryStats.windowsByCapability)}`);
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