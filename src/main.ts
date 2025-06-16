import { APP_NAME, IS_DEV, VITE_DEV_SERVER_URL } from '@core/infrastructure/config/config';
import 'dotenv/config'; // Must be first to load environment variables

// Agent Bridge - Focused agent coordination service
// Configuration Manager - New configuration system
import { createLogger, initializeWithConfig } from '@/lib/utils/logger';
import { config } from '@core/infrastructure/config/configuration-manager';
import { app, BrowserWindow, Display, ipcMain, screen } from 'electron';

// Configure EventTarget listener limits for LangChain operations
// LangGraph tool binding creates multiple AbortSignal listeners
import { setMaxListeners } from 'events';
try {
    setMaxListeners(50); // Handle complex multi-tool operations
    createLogger('[Main]').info('[App] Set EventTarget max listeners to 50 for LangChain operations');
} catch (error) {
    // Fallback - set on process if setMaxListeners doesn't work globally
    process.setMaxListeners?.(50);
}

const logger = createLogger('[Main]');

logger.info('--- [main.ts] Script execution started with Canvas Engine ---');

// Configuration, Utilities, and Services
import { setUIDiscoveryService, UIDiscoveryService } from '@core/platform/discovery/main-process-discovery';
import { apiKeyManager } from './core/infrastructure/config/api-key-manager';
import { AgentBridge, initializeAgentBridge } from './core/platform/ipc/agent-bridge';
import { getWindowRegistry } from './core/platform/windows/window-registry';

// Set the application name as early as possible.
app.setName(APP_NAME);
logger.info(`[App] App name set to "${APP_NAME}" at top-level.`);

// Global references to services and the agent bridge
let uiDiscoveryService: UIDiscoveryService | undefined;
let agentBridge: AgentBridge | undefined;

const initializeApp = async (): Promise<void> => {
    logger.info(`Current NODE_ENV: ${process.env.NODE_ENV}`);
    logger.info(`IS_DEV: ${IS_DEV}`);
    logger.info(`VITE_DEV_SERVER_URL: ${VITE_DEV_SERVER_URL}`);
    logger.info(`DIST path: ${process.env.DIST}`);
    logger.info(`__dirname: ${__dirname}`);

    const primaryDisplay: Display = screen.getPrimaryDisplay();
    
    // Load configuration and API keys
    try {
        await config.load();
        await apiKeyManager.initialize();
        
        // Initialize logger with configuration integration
        initializeWithConfig();
        
        const providerConfig = config.getProvider();
        logger.info(`Configuration loaded - Provider: ${providerConfig.service}, Model: ${providerConfig.model}`);
    } catch (error) {
        logger.warn(`Configuration loading failed: ${error instanceof Error ? error.message : String(error)}. Using defaults.`);
    }
    
    // Initialize Agent Bridge (focused agent coordination)
    try {
        logger.info(`Initializing Agent Bridge...`);
        agentBridge = await initializeAgentBridge();
        logger.info(`Agent Bridge initialized successfully!`);
    } catch (error) {
        logger.warn(`Agent initialization completed with warnings: ${error instanceof Error ? error.message : String(error)}. Continuing with limited functionality.`);
        // Don't quit - Agent can start in limited mode without API key
        if (!agentBridge) {
            logger.error(`No agent bridge instance available.`);
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
    await uiDiscoveryService.discoverAndInitializeUIComponents();

    // Log which platform components were initialized on startup
    const platformComponents = uiDiscoveryService.getPlatformComponents();
    logger.info(`[initializeApp] Platform components initialized for startup: ${platformComponents.join(', ')}`);
    
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
            
            const stats = uiDiscoveryService.getAllUIComponents();
            logger.info(`[initializeApp] Registry hot-reload complete: ${stats.length} UI components available`);
            
            return { 
                success: true, 
                uiComponentsCount: stats.length,
                availableUIComponents: stats
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
        
        // Send greeting message
        // No need to await if sendGreetingMessage is not critical path for app init
        // and we don't want to block initializeApp further.
        // If it MUST be sent before other things, then await it.
        agentBridge.sendGreetingMessage(); 
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
        logger.info("[App] No windows open, re-creating platform components.");
        if (uiDiscoveryService) {
            const platformComponents = uiDiscoveryService.getPlatformComponents();
            (async () => {
                for (const name of platformComponents) {
                    await uiDiscoveryService.initializeUIWindow(name);
                }
            })();
        } else {
            logger.error("[App] UI Discovery Service not available on 'activate'. Re-initializing app.");
            initializeApp();
        }
    } else {
        // If windows exist, focus them.
        logger.info("[App] Windows exist, bringing them to front.");
        const windowRegistry = getWindowRegistry();
        const allWindows = windowRegistry.getAllWindows();
        allWindows.forEach(windowInfo => {
            if (windowInfo.window && !windowInfo.window.isDestroyed()) {
                if (windowInfo.window.isMinimized()) {
                    windowInfo.window.restore();
                }
                windowInfo.window.focus();
            }
        });
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