import { createLogger } from '@/lib/utils/logger';
import { AppIpcModule } from '../ipc/types';
import { AppModuleConstructor, UIComponentRegistry } from './types';

const logger = createLogger('[ComponentRegistry]');

export async function loadUIRegistry(): Promise<UIComponentRegistry | null> {
    try {
        const registryModule = await import('./ui-component-registry');
        return registryModule.createUIComponentRegistry();
    } catch (error) {
        logger.warn('Could not load UI component registry, will fall back to dynamic discovery:', error);
        return null;
    }
}

export async function classifyAppType(appName: string): Promise<'platform' | 'app' | 'widget'> {
    try {
        const registryModule = await import('./ui-component-registry');
        return registryModule.getUIComponentType(appName);
    } catch (error) {
        logger.error(`Failed to classify app type for ${appName}:`, error);
        throw new Error('UI component registry is required but failed to load. This indicates a build-time issue.');
    }
}

export async function getAppPath(appName: string): Promise<string> {
    try {
        const registryModule = await import('./ui-component-registry');
        return registryModule.getUIComponentPath(appName);
    } catch (error) {
        logger.error(`Failed to get app path for ${appName}:`, error);
        throw new Error('UI component registry is required but failed to load. This indicates a build-time issue.');
    }
}

export function isValidIpcModule(obj: any): obj is AppIpcModule {
    return obj &&
        typeof obj === 'object' &&
        typeof obj.moduleId === 'string' &&
        typeof obj.registerMainProcessHandlers === 'function';
}
