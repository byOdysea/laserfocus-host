import { apiKeyManager } from '@core/infrastructure/config/api-key-manager';
import { PROVIDER_MODELS } from '@core/infrastructure/config/config';
import { config } from '@core/infrastructure/config/configuration-manager';
import { AppIpcModule, AppMainProcessInstances } from '@core/platform/ipc/types';
import { ByokwidgetWindow } from '@ui/platform/Byokwidget/byokwidget.main';
import * as logger from '@utils/logger';
import { IpcMain } from 'electron';

// Use centralized API key validation

// No more API key testing - let the LLM factory handle validation when actually used

const ByokwidgetIpcHandlers: AppIpcModule = {
    moduleId: 'Byokwidget',
    
    registerMainProcessHandlers: (
        ipcMain: IpcMain,
        appInstance: ByokwidgetWindow,
        allAppInstances?: AppMainProcessInstances
    ) => {
        logger.info('[BYOK-IPC] Registering BYOK helper IPC handlers');

        // Get current provider and masked API key
        ipcMain.handle('byokwidget:get-api-key', async () => {
            try {
                const currentConfig = config.get();
                const provider = currentConfig.provider.service;
                
                const hasApiKey = await apiKeyManager.hasApiKey(provider);
                const maskedKey = hasApiKey ? await apiKeyManager.getMaskedApiKey(provider) : '';
                
                return { 
                    success: true, 
                    apiKey: maskedKey, 
                    hasApiKey 
                };
            } catch (error) {
                logger.error('[BYOK-IPC] Error getting API key:', error);
                return { success: false, error: 'Failed to retrieve API key' };
            }
        });

        // Get full API key for editing
        ipcMain.handle('byokwidget:get-full-api-key', async () => {
            try {
                const currentConfig = config.get();
                const provider = currentConfig.provider.service;
                
                const apiKey = await apiKeyManager.getApiKey(provider);
                
                return { success: true, apiKey: apiKey || '' };
            } catch (error) {
                logger.error('[BYOK-IPC] Error getting full API key:', error);
                return { success: false, error: 'Failed to retrieve API key' };
            }
        });

        // Save API key (no validation - just save it)
        ipcMain.handle('byokwidget:save-api-key', async (event, apiKey: string) => {
            try {
                const currentConfig = config.get();
                const provider = currentConfig.provider.service;
                
                await apiKeyManager.saveApiKey(provider, apiKey);
                logger.info(`[BYOK-IPC] API key saved for provider: ${provider}`);
                
                return { success: true };
            } catch (error) {
                logger.error('[BYOK-IPC] Error saving API key:', error);
                return { success: false, error: 'Failed to save API key' };
            }
        });

        // Remove API key testing - no longer needed
        // Connection status will be determined by LLM factory success/failure

        // Remove stored key testing - no longer needed

        // Get current configuration
        ipcMain.handle('byokwidget:get-config', async () => {
            try {
                // Use existing configuration instead of forcing reload
                // Configuration changes are handled automatically by ConfigurableComponent
                const currentConfig = config.get();
                const provider = currentConfig.provider.service;
                const hasApiKey = await apiKeyManager.hasApiKey(provider);
                
                logger.debug('[BYOK-IPC] Current config values:', {
                    provider: currentConfig.provider.service,
                    model: currentConfig.provider.model,
                    hasApiKey,
                    environment: process.env.NODE_ENV
                });
                
                return {
                    success: true,
                    config: {
                        provider: currentConfig.provider.service,
                        model: currentConfig.provider.model,
                        temperature: currentConfig.provider.temperature,
                        maxTokens: currentConfig.provider.maxTokens,
                        baseUrl: currentConfig.provider.baseUrl,
                        logLevel: currentConfig.system.logLevel,
                        hasApiKey
                    }
                };
            } catch (error) {
                logger.error('[BYOK-IPC] Error getting config:', error);
                return { success: false, error: 'Failed to get configuration' };
            }
        });

        // Update provider configuration
        ipcMain.handle('byokwidget:update-provider', async (event, updates: { 
            service?: string; 
            model?: string; 
            temperature?: number;
            maxTokens?: number;
            baseUrl?: string;
        }) => {
            try {
                const currentConfig = config.get();
                const providerUpdates: any = {};

                if (updates.service) providerUpdates.service = updates.service;
                if (updates.model) providerUpdates.model = updates.model;
                if (updates.temperature !== undefined) providerUpdates.temperature = updates.temperature;
                if (updates.maxTokens !== undefined) providerUpdates.maxTokens = updates.maxTokens;
                if (updates.baseUrl !== undefined) providerUpdates.baseUrl = updates.baseUrl;

                await config.update({ provider: { ...currentConfig.provider, ...providerUpdates } });
                logger.info('[BYOK-IPC] Provider configuration updated successfully');
                
                return { success: true };
            } catch (error) {
                logger.error('[BYOK-IPC] Error updating provider config:', error);
                return { success: false, error: 'Failed to update provider configuration' };
            }
        });

        // Update system configuration
        ipcMain.handle('byokwidget:update-system', async (event, updates: {
            logLevel?: string;
        }) => {
            try {
                const currentConfig = config.get();
                const systemUpdates: any = {};

                if (updates.logLevel) systemUpdates.logLevel = updates.logLevel;

                await config.update({ system: { ...currentConfig.system, ...systemUpdates } });
                logger.info('[BYOK-IPC] System configuration updated successfully');
                
                return { success: true };
            } catch (error) {
                logger.error('[BYOK-IPC] Error updating system config:', error);
                return { success: false, error: 'Failed to update system configuration' };
            }
        });

        // Get available models for a provider
        ipcMain.handle('byokwidget:get-models', async (event, provider: string) => {
            try {
                return {
                    success: true,
                    models: PROVIDER_MODELS[provider as keyof typeof PROVIDER_MODELS] || []
                };
            } catch (error) {
                logger.error('[BYOK-IPC] Error getting models:', error);
                return { success: false, error: 'Failed to get models' };
            }
        });

        // Get system status from agent (actual connection status)
        ipcMain.handle('byokwidget:get-status', async () => {
            try {
                const currentConfig = config.get();
                const provider = currentConfig.provider.service;
                const hasApiKey = await apiKeyManager.hasApiKey(provider);
                const hasValidProvider = !!provider;
                
                let connectionStatus = 'unknown';
                
                // Get connection status from agent if available
                try {
                    const { getAgentBridge } = await import('@core/platform/ipc/agent-bridge');
                    const agentBridge = getAgentBridge();
                    
                    if (agentBridge?.isReady()) {
                        const athenaAgent = (agentBridge as any).athenaAgent;
                        if (athenaAgent?.getConnectionStatus) {
                            connectionStatus = athenaAgent.getConnectionStatus();
                            logger.debug(`[BYOK-IPC] Got connection status from agent: ${connectionStatus}`);
                        }
                    }
                } catch (error) {
                    logger.debug('[BYOK-IPC] Could not get agent status, using fallback');
                    // Fallback to basic status check
                    if (provider === 'ollama') {
                        connectionStatus = 'local';
                    } else if (!hasApiKey) {
                        connectionStatus = 'no-key';
                    } else if (hasApiKey && hasValidProvider) {
                        connectionStatus = 'configured';
                    }
                    logger.debug(`[BYOK-IPC] Fallback status: ${connectionStatus}`);
                }

                return {
                    success: true,
                    status: {
                        hasApiKey,
                        hasValidProvider,
                        connectionStatus,
                        provider: currentConfig.provider.service,
                        model: currentConfig.provider.model,
                        isDevMode: process.env.NODE_ENV === 'development'
                    }
                };
            } catch (error) {
                logger.error('[BYOK-IPC] Error getting status:', error);
                return { success: false, error: 'Failed to get status' };
            }
        });

        // Focus the app window
        ipcMain.on('byokwidget:focus', () => {
            if (appInstance && appInstance.window && !appInstance.window.isDestroyed()) {
                appInstance.focus();
            }
        });

        // Open Settings app
        ipcMain.handle('byokwidget:open-settings', async () => {
            try {
                if (allAppInstances?.has('Settings')) {
                    const settingsWindow = allAppInstances.get('Settings');
                    if (settingsWindow.window && !settingsWindow.window.isDestroyed()) {
                        settingsWindow.focus();
                        return { success: true };
                    }
                }
                
                // If no settings window instance available, log for debugging
                logger.info('[BYOK-IPC] Settings window not available in app instances');
                return { success: false, error: 'Settings window not available' };
            } catch (error) {
                logger.error('[BYOK-IPC] Error opening settings:', error);
                return { success: false, error: 'Failed to open settings' };
            }
        });

        // Remove connection testing - let LLM factory handle it when actually used

        // Set up configuration change notifications
        config.onChange(async (newConfig) => {
            // Give the agent a moment to reinitialize before notifying the UI
            setTimeout(() => {
                // Notify the Byokwidget window about configuration changes
                if (appInstance && appInstance.window && !appInstance.window.isDestroyed()) {
                    appInstance.window.webContents.send('config-changed', newConfig);
                }
            }, 100); // Small delay to allow agent to process config change
        });

        logger.info('[BYOK-IPC] BYOK configuration IPC handlers registered successfully');
    }
};

export default ByokwidgetIpcHandlers;