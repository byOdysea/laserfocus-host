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
    DesktopWindow,
    ModifyElementParams
} from '@/lib/types/canvas';
import { createLogger } from '@utils/logger';
import { BrowserWindow, screen } from 'electron';
import {
    createBrowserWindow,
    createInternalUIComponent,
    createApplicationWindow
} from './desktop-window';
import {
    startDesktopMonitoring,
    stopDesktopMonitoring,
    updateDesktopState,
    getAllDesktopWindows,
    setupWindowEventHandlers,
    updateElementPosition,
    updateElementSize,
    updateElementFocus,
    updateElementVisibility,
    handleElementClosed,
    getActiveWindowId,
    getFocusedProcessName
} from './desktop-monitor';

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
        return createBrowserWindow.call(this, params);
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
        return createInternalUIComponent.call(this, params, elementId, x, y, width, height, contentSource);
    }

    /**
     * Create application window (placeholder for future implementation)
     */
    private async createApplicationWindow(params: CreateElementParams): Promise<CanvasElement> {
        return createApplicationWindow.call(this, params);
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
        startDesktopMonitoring.call(this);
    }

    /**
     * Update complete desktop state
     */
    private async updateDesktopState(): Promise<void> {
        return updateDesktopState.call(this);
    }

    /**
     * Get all windows on desktop (platform-specific implementation needed)
     */
    private async getAllDesktopWindows(): Promise<DesktopWindow[]> {
        return getAllDesktopWindows.call(this);
    }

    /**
     * Set up window event handlers for state tracking
     */
    private setupWindowEventHandlers(window: BrowserWindow, elementId: string): void {
        setupWindowEventHandlers.call(this, window, elementId);
    }

    /**
     * Update element position when window moves
     */
    private updateElementPosition(elementId: string): void {
        updateElementPosition.call(this, elementId);
    }

    /**
     * Update element size when window resizes
     */
    private updateElementSize(elementId: string): void {
        updateElementSize.call(this, elementId);
    }

    /**
     * Update element focus state
     */
    private updateElementFocus(elementId: string, focused: boolean): void {
        updateElementFocus.call(this, elementId, focused);
    }

    /**
     * Update element visibility
     */
    private updateElementVisibility(elementId: string, visible: boolean): void {
        updateElementVisibility.call(this, elementId, visible);
    }

    /**
     * Handle element closure
     */
    private handleElementClosed(elementId: string): void {
        handleElementClosed.call(this, elementId);
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
        const match = uri.match(/^(apps|widgets|platform):(\/\/)?([a-zA-Z0-9_-]+)(\/([a-zA-Z0-9_/-]*))?(\?(.*))?$/);
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
        return getActiveWindowId.call(this);
    }

    /**
     * Get focused process name (placeholder)
     */
    private getFocusedProcessName(): string | null {
        return getFocusedProcessName.call(this);
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
        stopDesktopMonitoring.call(this);
    }
}
