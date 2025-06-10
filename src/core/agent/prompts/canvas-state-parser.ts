/**
 * Canvas State Parser
 * Centralized parsing and caching of canvas state to eliminate duplicate processing
 */

import { Canvas, CanvasElement, DesktopState } from '@/lib/types/canvas';
import logger from '@/lib/utils/logger';
import { calculateLayoutParameters, WorkArea } from './layout-calculations';

export interface ParsedCanvasState {
    // Raw references
    canvas: Canvas;
    workArea: WorkArea;
    desktopState?: DesktopState;
    
    // Parsed data
    managedElements: CanvasElement[];
    userWindows: CanvasElement[];
    layoutCalculations: ReturnType<typeof calculateLayoutParameters>;
    
    // Formatted strings for prompts
    userWindowsDescription: string;
    windowCount: number;
    
    // Metadata
    timestamp: number;
    hash: string;
}

/**
 * Parser and cache for canvas state
 * Prevents duplicate parsing across prompt builders and tools
 */
export class CanvasStateParser {
    private cache: ParsedCanvasState | null = null;
    private readonly CACHE_TTL_MS = 1000; // 1 second cache for conversation consistency
    
    /**
     * Get parsed canvas state with caching
     */
    async getParsedState(canvas: Canvas): Promise<ParsedCanvasState> {
        const now = Date.now();
        const currentHash = this.hashCanvas(canvas);
        
        // Return cached if valid
        if (this.cache && 
            this.cache.hash === currentHash && 
            (now - this.cache.timestamp) < this.CACHE_TTL_MS) {
            logger.debug('[CanvasStateParser] Returning cached parsed state');
            return this.cache;
        }
        
        // Parse fresh
        logger.debug('[CanvasStateParser] Parsing fresh canvas state');
        const parsed = this.parseCanvas(canvas);
        this.cache = parsed;
        return parsed;
    }
    
    /**
     * Parse canvas into structured data
     */
    private parseCanvas(canvas: Canvas): ParsedCanvasState {
        const managedElements = canvas.elements || [];
        const userWindows = managedElements.filter((el: CanvasElement) => 
            el.type === 'browser' || el.type === 'application'
        );
        
        const desktopState = canvas.metadata?.desktopState;
        const workArea = desktopState?.workArea || { x: 0, y: 0, width: 1920, height: 1080 };
        const layoutCalculations = calculateLayoutParameters(workArea, desktopState);
        
        // Build user windows description once
        const userWindowsDescription = this.buildWindowsDescription(userWindows);
        
        return {
            canvas,
            workArea,
            desktopState,
            managedElements,
            userWindows,
            layoutCalculations,
            userWindowsDescription,
            windowCount: userWindows.length,
            timestamp: Date.now(),
            hash: this.hashCanvas(canvas)
        };
    }
    
    /**
     * Build concise windows description for prompts
     */
    private buildWindowsDescription(windows: CanvasElement[]): string {
        if (windows.length === 0) return 'none';
        
        return windows.map((w: CanvasElement) => {
            const width = w.transform.size.dimensions[0];
            const height = w.transform.size.dimensions[1];
            return `${w.content?.source || 'Unknown'} (${width}×${height})`;
        }).join(', ');
    }
    
    /**
     * Create lightweight hash of canvas state
     */
    private hashCanvas(canvas: Canvas): string {
        // Hash based on element IDs, positions, and sizes
        const elementKey = canvas.elements
            .map(e => `${e.id}:${e.transform.position.coordinates.join(',')}:${e.transform.size.dimensions.join(',')}`)
            .sort()
            .join('|');
        
        let hash = 0;
        for (let i = 0; i < elementKey.length; i++) {
            const char = elementKey.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }
    
    /**
     * Invalidate cache
     */
    invalidate(): void {
        this.cache = null;
        logger.debug('[CanvasStateParser] Cache invalidated');
    }
}

// Singleton instance
let parserInstance: CanvasStateParser | null = null;

/**
 * Get or create the singleton parser instance
 */
export function getCanvasStateParser(): CanvasStateParser {
    if (!parserInstance) {
        parserInstance = new CanvasStateParser();
    }
    return parserInstance;
} 