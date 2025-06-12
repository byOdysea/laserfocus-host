/**
 * Desktop Canvas Adapter
 * Maps abstract canvas concepts to Electron BrowserWindows
 * Implements complete desktop awareness
 */

import type {
    Canvas,
    CanvasAdapter,
    CanvasElement,
    CanvasOperation,
    CreateElementParams,
    DesktopState,
    DesktopWindow,
    ModifyElementParams
} from '@/lib/types/canvas';
import { createLogger } from '@utils/logger';
import { BrowserWindow, screen } from 'electron';
import { ConfigurationManager } from '../../infrastructure/config/configuration-manager';
import { getUIDiscoveryService } from '../../platform/discovery/main-process-discovery';

function toPascalCase(str: string): string {
    if (!str) return '';
    return str
        .split(/[-_\s]+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

const logger = createLogger('[DesktopAdapter]');

export class DesktopCanvasAdapter implements CanvasAdapter {
    readonly canvasType = 'desktop';
    
    private managedElements: Map<string, BrowserWindow> = new Map();
    private canvas: Canvas;
    private workArea: Electron.Rectangle;
    private monitoringInterval: NodeJS.Timeout | null = null;
    private changeCallback: ((canvas: Canvas) => void) | null = null;
    private operationHistory: CanvasOperation[] = [];

    constructor() {
        this.workArea = screen.getPrimaryDisplay().workArea;
        this.canvas = this.createInitialCanvas();
    }

    /**
     * Create initial canvas configuration
     */
    private createInitialCanvas(): Canvas {
        return {
            id: 'desktop-main',
            type: 'desktop',
            elements: [],
            boundaries: {
                dimensions: [this.workArea.width, this.workArea.height],
                units: 'pixels',
                origin: [this.workArea.x, this.workArea.y],
                constraints: []
            },
            capabilities: {
                supportedElementTypes: ['window', 'browser', 'application'],
                supportedOperations: ['create', 'modify', 'remove', 'focus'],
                supports3D: false,
                supportsLayers: true,
                supportsRotation: false,
                supportsTransparency: true,
                supportsAnimation: false,
                coordinateSystem: '2d'
            },
            constraints: [],
            metadata: {
                platform: 'electron',
                pid: process.pid
            }
        };
    }

    /**
     * Initialize the desktop canvas
     */
    async initializeCanvas(): Promise<Canvas> {
        // Start monitoring all desktop windows at 1Hz
        this.startDesktopMonitoring();
        
        // Capture initial state
        await this.updateDesktopState();
        
        logger.info('Canvas initialized with desktop monitoring');
        return this.canvas;
    }

    /**
     * Create a new element on the desktop canvas
     */
    async createElement(params: CreateElementParams): Promise<CanvasElement> {
        this.validateElementType(params.type);
        
        // Handle different element types
        switch (params.type) {
            case 'window':
            case 'browser':
                return await this.createBrowserWindow(params);
            case 'application':
                return await this.createApplicationWindow(params);
            default:
                throw new Error(`Unsupported element type: ${params.type}`);
        }
    }

    /**
     * Create a browser window element
     */
    private async createBrowserWindow(params: CreateElementParams): Promise<CanvasElement> {
        // Generate predictable IDs that LLMs can work with
        const elementIndex = this.canvas.elements.length;
        const elementId = `element-${elementIndex}`;
        
        // Extract transform and content information - agent MUST provide all positioning
        if (!params.transform?.position?.coordinates || !params.transform?.size?.dimensions) {
            throw new Error('Agent must provide complete positioning (x, y, width, height) for all windows. No hardcoded fallbacks allowed.');
        }
        
        const x = params.transform.position.coordinates[0];
        const y = params.transform.position.coordinates[1];
        const width = params.transform.size.dimensions[0];
        const height = params.transform.size.dimensions[1];
        const contentSource = params.content?.source || '';
        
        // Check if this is an internal UI component
        if (this.isInternalUriScheme(contentSource)) {
            return await this.createInternalUIComponent(params, elementId, x, y, width, height, contentSource);
        }
        
        // Get frame setting from configuration
        const configManager = ConfigurationManager.getInstance();
        const config = configManager.get();
        const showFrame = config.ui?.browserWindowFrame ?? false;
        
        // Create regular browser window for external URLs
        const window = new BrowserWindow({
            x, y, width, height,
            show: false,
            frame: showFrame,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: true,
                sandbox: true  // Keep sandbox for security with external URLs
            },
            // Basic window options for visibility
            skipTaskbar: false,  // Show in taskbar
            minimizable: true,
            maximizable: true,
            closable: true
        });

        logger.info(`Created BrowserWindow for ${contentSource} at (${x}, ${y}) size ${width}x${height}`);

        // Load the URL
        const normalizedUrl = this.normalizeUrl(contentSource);
        logger.debug(`Loading URL: ${normalizedUrl}`);
        
        try {
            await window.loadURL(normalizedUrl);
            logger.debug(`Successfully loaded URL: ${normalizedUrl}`);
            
            // Show window once after successful load
            logger.debug(`Showing window for ${normalizedUrl}`);
            window.show();
            window.focus();
            
        } catch (error) {
            logger.error(`Failed to load URL ${normalizedUrl}:`, error);
            throw error;
        }
        
        // Single visibility check after a delay
        setTimeout(() => {
            if (!window.isDestroyed() && !window.isVisible()) {
                logger.debug(`Window still not visible, forcing show`);
                window.show();
                window.focus();
            }
        }, 500);

        // Add debugging for window state
        setTimeout(() => {
            const bounds = window.getBounds();
            logger.debug(`Window state check - Visible: ${window.isVisible()}, Bounds: ${JSON.stringify(bounds)}, Destroyed: ${window.isDestroyed()}`);
        }, 1000);

        // Track the window
        this.managedElements.set(elementId, window);
        this.setupWindowEventHandlers(window, elementId);

        // Create canvas element
        const element: CanvasElement = {
            id: elementId,
            type: params.type as 'browser',
            transform: {
                position: {
                    coordinates: [x, y],
                    reference: 'absolute',
                    units: 'pixels'
                },
                size: {
                    dimensions: [width, height],
                    units: 'pixels'
                }
            },
            state: {
                visible: true,
                interactive: true,
                focused: false,
                minimized: false,
                properties: {}
            },
            content: {
                type: 'url',
                source: normalizedUrl
            },
            metadata: {
                title: 'Loading...',
                elementType: params.type,
                createdAt: Date.now(),
                managedByEngine: true,
                ...params.metadata
            },
            canvasType: 'desktop'
        };

        // Add to canvas
        this.canvas.elements.push(element);

        // Record operation
        this.recordOperation({
            id: `op-${Date.now()}`,
            type: 'create',
            elementId,
            timestamp: Date.now(),
            parameters: params
        });

        this.notifyChange();
        return element;
    }

    /**
     * Create internal UI component using UIDiscovery
     */
    private async createInternalUIComponent(
        params: CreateElementParams, 
        elementId: string, 
        x: number, 
        y: number, 
        width: number, 
        height: number, 
        contentSource: string
    ): Promise<CanvasElement> {
        const uiDiscovery = getUIDiscoveryService();
        if (!uiDiscovery) {
            throw new Error('UI Discovery Service not available');
        }

        const parsedUri = this.parseUIComponentUri(contentSource);
        const componentName = toPascalCase(parsedUri.componentName);
        
        logger.debug(`Creating internal UI component: ${componentName}`);

        const appModule = await uiDiscovery.initializeUIWindow(componentName);
        if (!appModule || !appModule.instance || !appModule.instance.window) {
            throw new Error(`Failed to initialize UI component: ${componentName}`);
        }
        
        const componentWindow = appModule.instance.window;
        
        // Position and size the window according to canvas requirements
        componentWindow.setBounds({ x, y, width, height });
        
        // Show window when ready to prevent visual flash
        componentWindow.once('ready-to-show', () => {
            componentWindow.show();
            componentWindow.focus();
        });
        
        // Track the component window in our managed elements
        this.managedElements.set(elementId, componentWindow);
        this.setupWindowEventHandlers(componentWindow, elementId);

        // Create canvas element
        const element: CanvasElement = {
            id: elementId,
            type: params.type as 'browser',
            transform: {
                position: {
                    coordinates: [x, y],
                    reference: 'absolute',
                    units: 'pixels'
                },
                size: {
                    dimensions: [width, height],
                    units: 'pixels'
                }
            },
            state: {
                visible: componentWindow.isVisible(),
                interactive: true,
                focused: componentWindow.isFocused(),
                minimized: componentWindow.isMinimized(),
                properties: {}
            },
            content: {
                type: 'component',
                source: contentSource,
                metadata: {
                    componentName: componentName,
                    componentType: parsedUri.scheme
                }
            },
            metadata: {
                title: componentName,
                elementType: params.type,
                componentName: componentName,
                componentType: parsedUri.scheme,
                createdAt: Date.now(),
                managedByEngine: true,
                ...params.metadata
            },
            canvasType: 'desktop'
        };

        // Add to canvas
        this.canvas.elements.push(element);

        // Handle component-specific parameters if present
        if (parsedUri.params.size > 0) {
            logger.info(`Component parameters:`, Object.fromEntries(parsedUri.params));
            componentWindow.webContents.once('dom-ready', () => {
                componentWindow.webContents.send('component-params', Object.fromEntries(parsedUri.params));
            });
        }

        // Record operation
        this.recordOperation({
            id: `op-${Date.now()}`,
            type: 'create',
            elementId,
            timestamp: Date.now(),
            parameters: params
        });

        logger.info(`Created ${parsedUri.scheme} component: ${parsedUri.componentName}`);
        this.notifyChange();
        return element;
    }

    /**
     * Create application window (placeholder for future implementation)
     */
    private async createApplicationWindow(params: CreateElementParams): Promise<CanvasElement> {
        // For now, treat as browser window
        // Future: integrate with system app launching
        return await this.createBrowserWindow({
            ...params,
            type: 'application'
        });
    }

    /**
     * Modify an existing element
     */
    async modifyElement(element: CanvasElement, changes: ModifyElementParams): Promise<void> {
        const window = this.managedElements.get(element.id);
        if (!window || window.isDestroyed()) {
            throw new Error(`Window for element ${element.id} not found`);
        }
        
        // Apply transform changes
        if (changes.transform) {
            const bounds: any = {};
            if (changes.transform.position) {
                bounds.x = changes.transform.position.coordinates[0];
                bounds.y = changes.transform.position.coordinates[1];
            }
            if (changes.transform.size) {
                bounds.width = changes.transform.size.dimensions[0];
                bounds.height = changes.transform.size.dimensions[1];
            }
            if (Object.keys(bounds).length > 0) {
                window.setBounds(bounds);
            }
        }
        
        // Apply state changes
        if (changes.state) {
            if (changes.state.visible !== undefined) {
                changes.state.visible ? window.show() : window.hide();
            }
            if (changes.state.minimized !== undefined) {
                changes.state.minimized ? window.minimize() : window.restore();
            }
            if (changes.state.focused !== undefined && changes.state.focused) {
                window.focus();
            }
        }

        // Update element in canvas
        const canvasElement = this.canvas.elements.find(e => e.id === element.id);
        if (canvasElement) {
            if (changes.transform) {
                Object.assign(canvasElement.transform, changes.transform);
            }
            if (changes.state) {
                Object.assign(canvasElement.state, changes.state);
            }
            if (changes.metadata) {
                Object.assign(canvasElement.metadata, changes.metadata);
            }
        }

        // Record operation
        this.recordOperation({
            id: `op-${Date.now()}`,
            type: 'modify',
            elementId: element.id,
            timestamp: Date.now(),
            parameters: changes
        });

        this.notifyChange();
    }

    /**
     * Remove element from canvas
     */
    async removeElement(element: CanvasElement): Promise<void> {
        const window = this.managedElements.get(element.id);
        if (window && !window.isDestroyed()) {
            window.close();
        }
        this.managedElements.delete(element.id);

        // Remove from canvas
        this.canvas.elements = this.canvas.elements.filter(e => e.id !== element.id);

        // Record operation
        this.recordOperation({
            id: `op-${Date.now()}`,
            type: 'remove',
            elementId: element.id,
            timestamp: Date.now(),
            parameters: {}
        });

        this.notifyChange();
    }

    /**
     * Get current canvas state
     */
    async getCanvasState(): Promise<Canvas> {
        await this.updateDesktopState();
        return structuredClone(this.canvas);
    }

    /**
     * Monitor canvas changes
     */
    monitorChanges(callback: (canvas: Canvas) => void): void {
        this.changeCallback = callback;
    }

    /**
     * Start monitoring all desktop windows at 1Hz (reduced from 10Hz for performance)
     */
    private startDesktopMonitoring(): void {
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.updateDesktopState();
            } catch (error) {
                logger.error('Error during desktop state monitoring:', error);
                this.stopDesktopMonitoring();
            }
        }, 1000); // 1Hz - reduced from 100ms to save CPU
    }

    /**
     * Update complete desktop state
     */
    private async updateDesktopState(): Promise<void> {
        try {
            // Get all windows (would use native APIs in full implementation)
            const allWindows = await this.getAllDesktopWindows();
            
            // Update canvas metadata with desktop state
            this.canvas.metadata = {
                ...this.canvas.metadata,
                desktopState: {
                    windows: allWindows,
                    displays: screen.getAllDisplays(),
                    activeWindowId: this.getActiveWindowId(),
                    focusedProcessName: this.getFocusedProcessName(),
                    timestamp: Date.now(),
                    workArea: this.workArea
                } as DesktopState
            };

            // Update managed element positions
            for (const [id, window] of this.managedElements) {
                if (!window.isDestroyed()) {
                    const element = this.canvas.elements.find(e => e.id === id);
                    if (element) {
                        const bounds = window.getBounds();
                        element.transform.position.coordinates = [bounds.x, bounds.y];
                        element.transform.size.dimensions = [bounds.width, bounds.height];
                        element.state.visible = window.isVisible();
                        element.state.focused = window.isFocused();
                        element.state.minimized = window.isMinimized();
                    }
                }
            }
        } catch (error) {
            logger.error('[DesktopAdapter] Error updating desktop state:', error);
        }
    }

    /**
     * Get all windows on desktop (platform-specific implementation needed)
     */
    private async getAllDesktopWindows(): Promise<DesktopWindow[]> {
        // This would use native APIs:
        // macOS: CGWindowListCopyWindowInfo
        // Windows: EnumWindows
        // Linux: X11/Wayland
        
        // For now, return managed windows + mock data for other apps
        const windows: DesktopWindow[] = [];
        
        // Add our managed windows
        for (const [id, window] of this.managedElements) {
            if (!window.isDestroyed()) {
                const bounds = window.getBounds();
                windows.push({
                    id: `managed-${id}`,
                    processName: 'LaserFocus',
                    processId: process.pid,
                    title: window.getTitle(),
                    bounds,
                    isVisible: window.isVisible(),
                    isMinimized: window.isMinimized(),
                    isFocused: window.isFocused(),
                    isFullscreen: window.isFullScreen(),
                    managedByEngine: true,
                    managedId: id,
                    windowLayer: 0,
                    ownerName: 'laserfocus',
                    windowType: 'browser'
                });
            }
        }

        // Mock other desktop windows (in real implementation, these would come from OS)
        windows.push(
            {
                id: 'chrome-main',
                processName: 'Google Chrome',
                processId: 12345,
                title: 'Chrome Browser',
                bounds: { x: 100, y: 100, width: 1200, height: 800 },
                isVisible: true,
                isMinimized: false,
                isFocused: false,
                isFullscreen: false,
                managedByEngine: false,
                windowLayer: 1,
                ownerName: 'chrome',
                windowType: 'browser'
            },
            {
                id: 'vscode-main',
                processName: 'Visual Studio Code',
                processId: 12346,
                title: 'VS Code',
                bounds: { x: 1300, y: 100, width: 1000, height: 900 },
                isVisible: true,
                isMinimized: false,
                isFocused: false,
                isFullscreen: false,
                managedByEngine: false,
                windowLayer: 1,
                ownerName: 'code',
                windowType: 'editor'
            }
        );
        
        return windows;
    }

    /**
     * Set up window event handlers for state tracking
     */
    private setupWindowEventHandlers(window: BrowserWindow, elementId: string): void {
        window.on('move', () => this.updateElementPosition(elementId));
        window.on('resize', () => this.updateElementSize(elementId));
        window.on('focus', () => this.updateElementFocus(elementId, true));
        window.on('blur', () => this.updateElementFocus(elementId, false));
        window.on('show', () => this.updateElementVisibility(elementId, true));
        window.on('hide', () => this.updateElementVisibility(elementId, false));
        window.on('closed', () => this.handleElementClosed(elementId));
        logger.debug(`Event handlers set up for element ${elementId}`);
    }

    /**
     * Update element position when window moves
     */
    private updateElementPosition(elementId: string): void {
        const window = this.managedElements.get(elementId);
        const element = this.canvas.elements.find(e => e.id === elementId);
        if (window && !window.isDestroyed() && element) {
            const bounds = window.getBounds();
            element.transform.position.coordinates = [bounds.x, bounds.y];
            this.recordOperation({
                id: `op-${Date.now()}`,
                type: 'modify',
                elementId,
                timestamp: Date.now(),
                parameters: { transform: { position: { coordinates: [bounds.x, bounds.y] } } }
            });
            this.notifyChange();
            logger.debug(`Element ${elementId} moved to ${bounds.x},${bounds.y}`);
        }
    }

    /**
     * Update element size when window resizes
     */
    private updateElementSize(elementId: string): void {
        const window = this.managedElements.get(elementId);
        const element = this.canvas.elements.find(e => e.id === elementId);
        if (window && !window.isDestroyed() && element) {
            const bounds = window.getBounds();
            element.transform.position.coordinates = [bounds.x, bounds.y];
            element.transform.size.dimensions = [bounds.width, bounds.height];
            this.recordOperation({
                id: `op-${Date.now()}`,
                type: 'modify',
                elementId,
                timestamp: Date.now(),
                parameters: { transform: { size: { dimensions: [bounds.width, bounds.height] } } }
            });
            this.notifyChange();
            logger.debug(`Element ${elementId} resized to ${bounds.width}x${bounds.height}`);
        }
    }

    /**
     * Update element focus state
     */
    private updateElementFocus(elementId: string, focused: boolean): void {
        const element = this.canvas.elements.find(e => e.id === elementId);
        if (element) {
            element.state.focused = focused;
            this.recordOperation({
                id: `op-${Date.now()}`,
                type: 'modify',
                elementId,
                timestamp: Date.now(),
                parameters: { state: { focused } }
            });
            this.notifyChange();
            logger.debug(`Element ${elementId} focus state changed to ${focused}`);
        }
    }

    /**
     * Update element visibility
     */
    private updateElementVisibility(elementId: string, visible: boolean): void {
        const element = this.canvas.elements.find(e => e.id === elementId);
        if (element) {
            element.state.visible = visible;
            this.recordOperation({
                id: `op-${Date.now()}`,
                type: 'modify',
                elementId,
                timestamp: Date.now(),
                parameters: { state: { visible } }
            });
            this.notifyChange();
            logger.debug(`Element ${elementId} visibility changed to ${visible}`);
        }
    }

    /**
     * Handle element closure
     */
    private handleElementClosed(elementId: string): void {
        this.managedElements.delete(elementId);
        this.canvas.elements = this.canvas.elements.filter(e => e.id !== elementId);
        this.recordOperation({
            id: `op-${Date.now()}`,
            type: 'remove',
            elementId,
            timestamp: Date.now(),
            parameters: {}
        });
        this.notifyChange();
        logger.info(`Element ${elementId} closed and removed from canvas`);
    }

    /**
     * Check if a URL uses an internal URI scheme
     */
    private isInternalUriScheme(url: string): boolean {
        return /^(apps|widgets|platform):(\/\/)?([a-zA-Z0-9_-]+)/.test(url);
    }

    /**
     * Parse URI scheme for UI components
     */
    private parseUIComponentUri(uri: string): {
        scheme: 'apps' | 'widgets' | 'platform';
        componentName: string;
        path?: string;
        params: Map<string, string>;
    } {
        const match = uri.match(/^(apps|widgets|platform):(\/\/)?([a-zA-Z0-9_-]+)(\/([a-zA-Z0-9_.\/-]*))?(\?(.*))?$/);
        if (!match) {
            throw new Error(`Invalid UI component URI: ${uri}`);
        }
        
        const scheme = match[1] as 'apps' | 'widgets' | 'platform';
        const componentName = match[3];
        const path = match[5];
        const params = new Map<string, string>();
        
        // Parse query parameters
        for (const [key, value] of new URL(uri).searchParams.entries()) {
            params.set(key, value);
        }
        
        return { scheme, componentName, path, params };
    }

    /**
     * Get component path for file loading
     */
    private getComponentPath(parsedUri: { scheme: string; componentName: string; path?: string }): string {
        const basePath = parsedUri.scheme === 'platform' ? 'platform' : parsedUri.scheme;
        return `${basePath}/${parsedUri.componentName}`;
    }

    /**
     * Validate element type is supported
     */
    private validateElementType(type: string): void {
        if (!this.canvas.capabilities.supportedElementTypes.includes(type)) {
            throw new Error(`Element type '${type}' not supported. Supported types: ${this.canvas.capabilities.supportedElementTypes.join(', ')}`);
        }
    }

    /**
     * Normalize URL by adding protocol if missing
     */
    private normalizeUrl(url: string): string {
        if (!url) return url;
        
        // If URL already has a protocol, return as-is
        if (url.match(/^https?:\/\//i)) {
            return url;
        }
        
        // If URL starts with //, add https:
        if (url.startsWith('//')) {
            return `https:${url}`;
        }
        
        // Otherwise add https://
        return `https://${url}`;
    }

    /**
     * Record operation for history/debugging
     */
    private recordOperation(operation: CanvasOperation): void {
        this.operationHistory.push(operation);
        // Keep last 100 operations
        if (this.operationHistory.length > 100) {
            this.operationHistory.shift();
        }
    }

    /**
     * Notify change callback if registered
     */
    private notifyChange(): void {
        if (this.changeCallback) {
            this.changeCallback(structuredClone(this.canvas));
        }
    }

    /**
     * Get active window ID (placeholder)
     */
    private getActiveWindowId(): string | null {
        // Would use platform-specific APIs to get active window
        return null;
    }

    /**
     * Get focused process name (placeholder)
     */
    private getFocusedProcessName(): string | null {
        // Would use platform-specific APIs to get focused process
        return null;
    }

    /**
     * Get recent operations for debugging
     */
    getRecentOperations(limit: number = 10): CanvasOperation[] {
        return this.operationHistory.slice(-limit);
    }

    /**
     * Clean shutdown
     */
    async destroy(): Promise<void> {
        this.stopDesktopMonitoring();
        
        // Close all managed windows
        for (const [id, window] of this.managedElements.entries()) {
            if (window && !window.isDestroyed()) {
                window.close();
            }
            this.managedElements.delete(id);
        }
        
        this.canvas.elements = [];
        logger.info('All managed windows closed and canvas cleared');
    }

    private stopDesktopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            logger.info('Stopped desktop monitoring');
        }
    }
} 
