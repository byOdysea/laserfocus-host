/**
 * Window Registry Service
 * 
 * Centralized tracking and management of all UI windows with unique identifiers.
 * Enables dynamic modularity and better inter-component communication.
 */

import logger from '@utils/logger';
import { BrowserWindow } from 'electron';

export interface UIWindowInfo {
    id: string;                    // Unique identifier (e.g. "athena-widget")
    title: string;                 // Display title (e.g. "Athena Conversation Monitor")
    type: 'platform' | 'app' | 'widget';
    componentName: string;         // Component name (e.g. "AthenaWidget")
    window: BrowserWindow;         // Electron window instance
    instance: any;                 // Main class instance
    capabilities: string[];        // What this window can do (e.g. ["conversation-monitor", "canvas-display"])
    metadata: Record<string, any>; // Additional component-specific data
}

export type WindowEventType = 'window-registered' | 'window-unregistered' | 'window-focused' | 'window-closed';

export interface WindowEventData {
    type: WindowEventType;
    windowInfo: UIWindowInfo;
    timestamp: number;
}

export class WindowRegistry {
    private windows: Map<string, UIWindowInfo> = new Map();
    private eventListeners: Map<WindowEventType, Array<(data: WindowEventData) => void>> = new Map();
    
    constructor() {
        logger.info('[WindowRegistry] Initialized centralized window registry');
    }
    
    /**
     * Register a new UI window with unique identifier
     */
    registerWindow(windowInfo: Omit<UIWindowInfo, 'metadata'> & { metadata?: Record<string, any> }): void {
        const fullWindowInfo: UIWindowInfo = {
            ...windowInfo,
            metadata: windowInfo.metadata || {}
        };
        
        // Ensure unique IDs
        if (this.windows.has(windowInfo.id)) {
            logger.warn(`[WindowRegistry] Window ID "${windowInfo.id}" already exists, updating registration`);
        }
        
        this.windows.set(windowInfo.id, fullWindowInfo);
        
        // Set up window event listeners
        this.setupWindowEventListeners(fullWindowInfo);
        
        logger.info(`[WindowRegistry] Registered window: ${windowInfo.id} (${windowInfo.title})`);
        logger.info(`[WindowRegistry] Capabilities: [${windowInfo.capabilities.join(', ')}]`);
        
        // Emit registration event
        this.emitEvent('window-registered', fullWindowInfo);
    }
    
    /**
     * Unregister a window
     */
    unregisterWindow(windowId: string): void {
        const windowInfo = this.windows.get(windowId);
        if (windowInfo) {
            this.windows.delete(windowId);
            logger.info(`[WindowRegistry] Unregistered window: ${windowId}`);
            
            // Emit unregistration event
            this.emitEvent('window-unregistered', windowInfo);
        }
    }
    
    /**
     * Get window by ID
     */
    getWindow(windowId: string): UIWindowInfo | undefined {
        return this.windows.get(windowId);
    }
    
    /**
     * Get window by component name
     */
    getWindowByComponent(componentName: string): UIWindowInfo | undefined {
        for (const windowInfo of this.windows.values()) {
            if (windowInfo.componentName === componentName) {
                return windowInfo;
            }
        }
        return undefined;
    }
    
    /**
     * Get windows by capability
     */
    getWindowsByCapability(capability: string): UIWindowInfo[] {
        return Array.from(this.windows.values()).filter(
            windowInfo => windowInfo.capabilities.includes(capability)
        );
    }
    
    /**
     * Get windows by type
     */
    getWindowsByType(type: UIWindowInfo['type']): UIWindowInfo[] {
        return Array.from(this.windows.values()).filter(
            windowInfo => windowInfo.type === type
        );
    }
    
    /**
     * Get all registered windows
     */
    getAllWindows(): UIWindowInfo[] {
        return Array.from(this.windows.values());
    }
    
    /**
     * Send message to window by ID
     */
    sendToWindow(windowId: string, channel: string, ...args: any[]): boolean {
        const windowInfo = this.windows.get(windowId);
        if (windowInfo && windowInfo.window && !windowInfo.window.isDestroyed()) {
            windowInfo.window.webContents.send(channel, ...args);
            return true;
        }
        // Only log warnings for debug builds to reduce log noise
        if (process.env.NODE_ENV === 'development') {
            logger.warn(`[WindowRegistry] Failed to send message to window: ${windowId}`);
        }
        return false;
    }
    
    /**
     * Send message to all windows with capability
     */
    sendToWindowsWithCapability(capability: string, channel: string, ...args: any[]): number {
        const targetWindows = this.getWindowsByCapability(capability);
        let sentCount = 0;
        
        for (const windowInfo of targetWindows) {
            if (this.sendToWindow(windowInfo.id, channel, ...args)) {
                sentCount++;
            }
        }
        
        // Only log warnings in development to reduce log noise
        if (process.env.NODE_ENV === 'development' && sentCount === 0 && targetWindows.length > 0) {
            logger.warn(`[WindowRegistry] Failed to send message to windows with capability "${capability}"`);
        }
        
        return sentCount;
    }
    
    /**
     * Focus window by ID
     */
    focusWindow(windowId: string): boolean {
        const windowInfo = this.windows.get(windowId);
        if (windowInfo && windowInfo.window && !windowInfo.window.isDestroyed()) {
            windowInfo.window.focus();
            this.emitEvent('window-focused', windowInfo);
            return true;
        }
        return false;
    }
    
    /**
     * Update window metadata
     */
    updateWindowMetadata(windowId: string, metadata: Partial<Record<string, any>>): void {
        const windowInfo = this.windows.get(windowId);
        if (windowInfo) {
            windowInfo.metadata = { ...windowInfo.metadata, ...metadata };
            logger.info(`[WindowRegistry] Updated metadata for window: ${windowId}`);
        }
    }
    
    /**
     * Add event listener for window events
     */
    on(eventType: WindowEventType, listener: (data: WindowEventData) => void): void {
        if (!this.eventListeners.has(eventType)) {
            this.eventListeners.set(eventType, []);
        }
        this.eventListeners.get(eventType)!.push(listener);
    }
    
    /**
     * Remove event listener
     */
    off(eventType: WindowEventType, listener: (data: WindowEventData) => void): void {
        const listeners = this.eventListeners.get(eventType);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }
    
    /**
     * Get registry statistics
     */
    getStats(): {
        totalWindows: number;
        windowsByType: Record<string, number>;
        windowsByCapability: Record<string, number>;
    } {
        const windows = this.getAllWindows();
        const stats = {
            totalWindows: windows.length,
            windowsByType: {} as Record<string, number>,
            windowsByCapability: {} as Record<string, number>
        };
        
        // Count by type
        for (const window of windows) {
            stats.windowsByType[window.type] = (stats.windowsByType[window.type] || 0) + 1;
        }
        
        // Count by capability
        for (const window of windows) {
            for (const capability of window.capabilities) {
                stats.windowsByCapability[capability] = (stats.windowsByCapability[capability] || 0) + 1;
            }
        }
        
        return stats;
    }
    
    /**
     * Set up event listeners for a window
     */
    private setupWindowEventListeners(windowInfo: UIWindowInfo): void {
        windowInfo.window.on('closed', () => {
            this.unregisterWindow(windowInfo.id);
            this.emitEvent('window-closed', windowInfo);
        });
        
        windowInfo.window.on('focus', () => {
            this.emitEvent('window-focused', windowInfo);
        });
    }
    
    /**
     * Emit window event
     */
    private emitEvent(type: WindowEventType, windowInfo: UIWindowInfo): void {
        const eventData: WindowEventData = {
            type,
            windowInfo,
            timestamp: Date.now()
        };
        
        const listeners = this.eventListeners.get(type) || [];
        for (const listener of listeners) {
            try {
                listener(eventData);
            } catch (error) {
                logger.error(`[WindowRegistry] Error in event listener for ${type}:`, error);
            }
        }
    }
}

// Singleton instance
let windowRegistry: WindowRegistry | null = null;

/**
 * Get the singleton Window Registry instance
 */
export function getWindowRegistry(): WindowRegistry {
    if (!windowRegistry) {
        windowRegistry = new WindowRegistry();
    }
    return windowRegistry;
}

/**
 * Destroy Window Registry (for cleanup)
 */
export function destroyWindowRegistry(): void {
    if (windowRegistry) {
        windowRegistry = null;
        logger.info('[WindowRegistry] Destroyed window registry');
    }
} 