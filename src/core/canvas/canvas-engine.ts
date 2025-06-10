/**
 * Canvas Engine
 * 
 * Pure tool provider - no agent, no LLM, just canvas operations
 * Uses CanvasAdapter pattern for different canvas types (desktop, VisionOS, etc.)
 */

import type {
    Canvas,
    CanvasAdapter,
    CanvasElement,
    CreateElementParams,
    DesktopWindow,
    ModifyElementParams
} from '@/lib/types/canvas';
import { DynamicStructuredTool } from "@langchain/core/tools";
import logger from '@utils/logger';
import { z } from 'zod';
import { normalizeUrl } from '../agent/prompts/layout-calculations';
import { DesktopCanvasAdapter } from './adapters/desktop-canvas-adapter';

export class CanvasEngine {
    private adapter: CanvasAdapter;
    private canvas: Canvas | null = null;
    
    // Canvas state memoization for performance
    private canvasStateCache: { canvas: Canvas; timestamp: number } | null = null;
    private readonly CACHE_TTL_MS = 100; // 100ms cache to prevent redundant queries
    
    constructor(canvasType: string = 'desktop') {
        // In v5, this would be dynamic based on canvas type
        switch (canvasType) {
            case 'desktop':
                this.adapter = new DesktopCanvasAdapter();
                break;
            // Future canvas types:
            // case 'visionos':
            //     this.adapter = new VisionOSCanvasAdapter();
            //     break;
            // case 'web':
            //     this.adapter = new WebCanvasAdapter();
            //     break;
            default:
                throw new Error(`Unsupported canvas type: ${canvasType}`);
        }
        
        logger.info(`[CanvasEngine] Initialized with ${canvasType} canvas`);
    }
    
    /**
     * Initialize the canvas
     */
    async initialize(): Promise<void> {
        this.canvas = await this.adapter.initializeCanvas();
        logger.info(`[CanvasEngine] Canvas initialized: ${this.canvas.id}`);
    }
    
    /**
     * Get current canvas state with memoization
     */
    async getCanvas(): Promise<Canvas> {
        if (!this.canvas) {
            throw new Error('Canvas not initialized. Call initialize() first.');
        }
        
        // Check cache first
        const now = Date.now();
        if (this.canvasStateCache && (now - this.canvasStateCache.timestamp) < this.CACHE_TTL_MS) {
            logger.debug('[CanvasEngine] Returning cached canvas state');
            return this.canvasStateCache.canvas;
        }
        
        // Get fresh state and cache it
        const canvas = await this.adapter.getCanvasState();
        this.canvasStateCache = { canvas, timestamp: now };
        return canvas;
    }
    
    /**
     * Create a new element on the canvas
     */
    async createElement(params: CreateElementParams): Promise<CanvasElement> {
        if (!this.canvas) {
            throw new Error('Canvas not initialized. Call initialize() first.');
        }
        
        logger.debug(`[CanvasEngine] Creating element: ${params.type}`);
        const element = await this.adapter.createElement(params);
        logger.debug(`[CanvasEngine] Element created: ${element.id}`);
        
        // Invalidate cache when modifications occur
        this.invalidateCache();
        
        return element;
    }
    
    /**
     * Modify an existing element
     */
    async modifyElement(elementId: string, changes: ModifyElementParams): Promise<void> {
        if (!this.canvas) {
            throw new Error('Canvas not initialized. Call initialize() first.');
        }
        
        const currentCanvas = await this.adapter.getCanvasState();
        const element = currentCanvas.elements.find(e => e.id === elementId);
        
        if (!element) {
            throw new Error(`Element ${elementId} not found`);
        }
        
        logger.debug(`[CanvasEngine] Modifying element: ${elementId}`);
        await this.adapter.modifyElement(element, changes);
        logger.debug(`[CanvasEngine] Element modified: ${elementId}`);
        
        // Invalidate cache when modifications occur
        this.invalidateCache();
    }
    
    /**
     * Remove element from canvas
     */
    async removeElement(elementId: string): Promise<void> {
        if (!this.canvas) {
            throw new Error('Canvas not initialized. Call initialize() first.');
        }
        
        const currentCanvas = await this.adapter.getCanvasState();
        const element = currentCanvas.elements.find(e => e.id === elementId);
        
        if (!element) {
            throw new Error(`Element ${elementId} not found`);
        }
        
        logger.debug(`[CanvasEngine] Removing element: ${elementId}`);
        await this.adapter.removeElement(element);
        logger.debug(`[CanvasEngine] Element removed: ${elementId}`);
        
        // Invalidate cache when modifications occur
        this.invalidateCache();
    }
    
    /**
     * Monitor canvas changes
     */
    monitorChanges(callback: (canvas: Canvas) => void): void {
        this.adapter.monitorChanges(callback);
    }
    
    /**
     * Get tools for agents to use - simple, direct definitions
     */
    getTools(): DynamicStructuredTool[] {
        return [
            new DynamicStructuredTool({
                name: "get_canvas_state",
                description: "Get the current state of the canvas and all elements. This includes all windows, their positions, sizes, and the complete desktop state with other applications.",
                schema: z.object({}),
                func: async () => {
                    const canvas = await this.getCanvas();
                    return JSON.stringify(canvas, null, 2);
                }
            }),
            
            new DynamicStructuredTool({
                name: "create_element",
                description: "Create a new element on the canvas (window, application, etc). Specify type, content, position, and size.",
                schema: z.object({
                    type: z.string().describe("Type of element to create (window, browser, application)"),
                    contentType: z.string().optional().describe("Type of content (url, component, native)"),
                    contentSource: z.string().optional().describe("Content source (URL, component name, etc)"),
                    x: z.number().optional().describe("X position in pixels"),
                    y: z.number().optional().describe("Y position in pixels"),
                    width: z.number().optional().describe("Width in pixels"),
                    height: z.number().optional().describe("Height in pixels"),
                    title: z.string().optional().describe("Window title"),
                    metadata: z.record(z.any()).optional().describe("Additional metadata")
                }),
                func: async (params) => {
                    // Normalize URL if it's a web content type
                    let contentSource = params.contentSource || '';
                    if (params.contentType === 'url' && contentSource) {
                        contentSource = normalizeUrl(contentSource);
                    }
                    
                    const elementParams: CreateElementParams = {
                        type: params.type,
                        content: (params.contentType || contentSource) ? {
                            type: params.contentType as any || 'component',
                            source: contentSource,
                            parameters: {},
                            metadata: {}
                        } : undefined,
                        transform: {
                            position: {
                                coordinates: [params.x || 0, params.y || 0],
                                reference: 'absolute',
                                units: 'pixels'
                            },
                            size: {
                                dimensions: [params.width || 800, params.height || 600],
                                units: 'pixels'
                            }
                        },
                        metadata: {
                            ...params.metadata,
                            title: params.title
                        }
                    };
                    
                    const element = await this.createElement(elementParams);
                    return JSON.stringify({
                        success: true,
                        elementId: element.id,
                        position: element.transform.position.coordinates,
                        size: element.transform.size.dimensions,
                        type: element.type
                    });
                }
            }),
            
            new DynamicStructuredTool({
                name: "modify_element",
                description: "Modify an existing element on the canvas. Use elementId (element-0, element-1, etc.) or index (0=newest, 1=second newest, etc.)",
                schema: z.object({
                    elementId: z.string().optional().describe("ID of element to modify (element-0, element-1, etc.)"),
                    index: z.number().optional().describe("Index of element (0=newest, 1=second newest, etc.)"),
                    x: z.number().optional().describe("New X position in pixels"),
                    y: z.number().optional().describe("New Y position in pixels"),
                    width: z.number().optional().describe("New width in pixels"),
                    height: z.number().optional().describe("New height in pixels"),
                    visible: z.boolean().optional().describe("Visibility state"),
                    focused: z.boolean().optional().describe("Focus state"),
                    minimized: z.boolean().optional().describe("Minimized state"),
                    metadata: z.record(z.any()).optional().describe("Metadata updates")
                }),
                func: async (params) => {
                    // Resolve element ID from index if needed
                    let targetElementId = params.elementId;
                    if (!targetElementId && params.index !== undefined) {
                        targetElementId = await this.resolveElementByIndex(params.index);
                        if (!targetElementId) {
                            const canvas = await this.getCanvas();
                            const managedCount = canvas.elements.filter(e => e.metadata?.managedByEngine !== false).length;
                            throw new Error(`Element index ${params.index} out of range. Available: 0-${managedCount - 1}`);
                        }
                    }
                    
                    if (!targetElementId) {
                        throw new Error("Must provide either elementId or index");
                    }
                    
                    const changes: ModifyElementParams = {};
                    
                    // Handle transform changes
                    if (params.x !== undefined || params.y !== undefined || 
                        params.width !== undefined || params.height !== undefined) {
                        changes.transform = {};
                        
                        if (params.x !== undefined || params.y !== undefined) {
                            changes.transform.position = {
                                coordinates: [params.x || 0, params.y || 0],
                                reference: 'absolute',
                                units: 'pixels'
                            };
                        }
                        
                        if (params.width !== undefined || params.height !== undefined) {
                            changes.transform.size = {
                                dimensions: [params.width || 800, params.height || 600],
                                units: 'pixels'
                            };
                        }
                    }
                    
                    // Handle state changes
                    if (params.visible !== undefined || params.focused !== undefined || 
                        params.minimized !== undefined) {
                        changes.state = {};
                        
                        if (params.visible !== undefined) {
                            changes.state.visible = params.visible;
                        }
                        if (params.focused !== undefined) {
                            changes.state.focused = params.focused;
                        }
                        if (params.minimized !== undefined) {
                            changes.state.minimized = params.minimized;
                        }
                        
                        changes.state.interactive = true; // Always interactive
                        changes.state.properties = {};
                    }
                    
                    // Handle metadata changes
                    if (params.metadata) {
                        changes.metadata = params.metadata;
                    }
                    
                    await this.modifyElement(targetElementId, changes);
                    
                    return JSON.stringify({
                        success: true,
                        elementId: targetElementId,
                        changesApplied: Object.keys(changes)
                    });
                }
            }),
            
            new DynamicStructuredTool({
                name: "remove_element",
                description: "Remove an element from the canvas (close window). Use elementId or index.",
                schema: z.object({
                    elementId: z.string().optional().describe("ID of element to remove (element-0, element-1, etc.)"),
                    index: z.number().optional().describe("Index of element (0=newest, 1=second newest, etc.)")
                }),
                func: async (params) => {
                    // Resolve element ID from index if needed
                    let targetElementId = params.elementId;
                    if (!targetElementId && params.index !== undefined) {
                        targetElementId = await this.resolveElementByIndex(params.index);
                        if (!targetElementId) {
                            const canvas = await this.getCanvas();
                            const managedCount = canvas.elements.filter(e => e.metadata?.managedByEngine !== false).length;
                            throw new Error(`Element index ${params.index} out of range. Available: 0-${managedCount - 1}`);
                        }
                    }
                    
                    if (!targetElementId) {
                        throw new Error("Must provide either elementId or index");
                    }
                    
                    await this.removeElement(targetElementId);
                    
                    return JSON.stringify({
                        success: true,
                        elementId: targetElementId,
                        action: 'removed'
                    });
                }
            }),
            
            new DynamicStructuredTool({
                name: "get_desktop_windows",
                description: "Get information about ALL windows on the desktop, including those not managed by the canvas engine (Chrome, VS Code, etc.)",
                schema: z.object({}),
                func: async () => {
                    const canvas = await this.getCanvas();
                    const desktopState = canvas.metadata?.desktopState;
                    
                    if (!desktopState) {
                        return JSON.stringify({ error: "Desktop state not available" });
                    }
                    
                    return JSON.stringify({
                        totalWindows: desktopState.windows.length,
                        managedWindows: desktopState.windows.filter((w: DesktopWindow) => w.managedByEngine).length,
                        otherWindows: desktopState.windows.filter((w: DesktopWindow) => !w.managedByEngine).length,
                        windows: desktopState.windows.map((w: DesktopWindow) => ({
                            id: w.id,
                            processName: w.processName,
                            title: w.title,
                            bounds: w.bounds,
                            isVisible: w.isVisible,
                            isFocused: w.isFocused,
                            managedByEngine: w.managedByEngine,
                            windowType: w.windowType
                        })),
                        workArea: desktopState.workArea,
                        timestamp: desktopState.timestamp
                    }, null, 2);
                }
            }),
            
            new DynamicStructuredTool({
                name: "get_recent_operations",
                description: "Get history of recent canvas operations for debugging and context",
                schema: z.object({
                    limit: z.number().optional().default(10).describe("Number of operations to retrieve")
                }),
                func: async (params) => {
                    // Get recent operations from adapter if available
                    if ('getRecentOperations' in this.adapter) {
                        const ops = (this.adapter as any).getRecentOperations(params.limit);
                        return JSON.stringify(ops, null, 2);
                    }
                    
                    return JSON.stringify({ error: "Operation history not available" });
                }
            })
        ];
    }
    
    /**
     * Get canvas capabilities
     */
    getCapabilities(): any {
        return this.canvas?.capabilities || null;
    }
    
    /**
     * Get canvas type
     */
    getCanvasType(): string {
        return this.adapter.canvasType;
    }
    
    /**
     * Check if canvas is initialized
     */
    isInitialized(): boolean {
        return this.canvas !== null;
    }
    
    /**
     * Clean shutdown
     */
    async destroy(): Promise<void> {
        if (this.adapter) {
            await this.adapter.destroy();
        }
        this.canvas = null;
        logger.info('[CanvasEngine] Engine destroyed');
    }
    
    /**
     * Invalidate canvas cache when modifications occur
     */
    private invalidateCache(): void {
        this.canvasStateCache = null;
    }
    
    /**
     * Resolve element ID from index for LLM-friendly tools
     * @param index Element index (0=newest, 1=second newest, etc.)
     * @returns Element ID or null if not found
     */
    private async resolveElementByIndex(index: number): Promise<string | null> {
        const canvas = await this.getCanvas();
        const sortedElements = canvas.elements
            .filter(e => e.metadata?.managedByEngine !== false)
            .sort((a, b) => {
                // Ensure createdAt exists, default to 0 if missing
                const aTime = a.metadata?.createdAt || 0;
                const bTime = b.metadata?.createdAt || 0;
                return bTime - aTime;
            });
        
        if (index >= 0 && index < sortedElements.length) {
            return sortedElements[index].id;
        }
        return null;
    }
} 