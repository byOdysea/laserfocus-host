/**
 * Layout Calculations & Shared Utilities for Canvas Engine
 * 
 * All layout intelligence and shared utilities belong here.
 * This contains the mathematical logic for optimal window positioning and shared constants.
 */

import { DesktopState } from '@/lib/types/canvas';
import logger from '@/lib/utils/logger';

export interface LayoutCalculations {
    defaultX: number;
    defaultY: number;
    defaultHeight: number;
    maxUsableWidth: number;
    windowGap: number;
    minWindowWidth: number;
    screenEdgePadding: number;
    menuBarHeight: number;
    athenaWidgetWidth: number;
    inputPillHeight: number;
    inputPillMargin: number;
    athenaWidgetMargin: number;
}

export interface WorkArea {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Calculate optimal layout parameters using real desktop state information
 * Gets actual platform component sizes instead of hardcoded assumptions
 */
export function calculateLayoutParameters(workArea: WorkArea, desktopState?: DesktopState): LayoutCalculations {
    // Base layout constants
    const screenEdgePadding = 20;
    const menuBarHeight = 40;
    const windowGap = 10;
    const minWindowWidth = 300;
    
    // Find actual platform components from desktop state
    let athenaWidgetWidth = 350; // fallback
    let inputPillHeight = 80; // fallback
    let actualInputPillY = workArea.height - 120; // fallback - reduced from 200px to 120px
    
    if (desktopState?.windows) {
        // Look for InputPill and AthenaWidget in actual windows
        const inputPillWindow = desktopState.windows.find(w => 
            w.title.toLowerCase().includes('laserfocus') && 
            w.bounds.height < 100 // InputPill is short
        );
        
        const athenaWidgetWindow = desktopState.windows.find(w => 
            w.title.toLowerCase().includes('laserfocus') && 
            w.bounds.width > 300 && w.bounds.width < 400 // AthenaWidget width range
        );
        
        if (inputPillWindow) {
            inputPillHeight = inputPillWindow.bounds.height;
            actualInputPillY = inputPillWindow.bounds.y;
            logger.debug(`[Layout] Found InputPill: height=${inputPillHeight}, y=${actualInputPillY}`);
        }
        
        if (athenaWidgetWindow) {
            athenaWidgetWidth = athenaWidgetWindow.bounds.width;
            logger.debug(`[Layout] Found AthenaWidget: width=${athenaWidgetWidth}`);
        }
    }
    
    // Position window to avoid AthenaWidget on the right
    const defaultX = screenEdgePadding; // Start close to left edge
    
    // Calculate width that avoids AthenaWidget (leave space on right for it)
    const athenaWidgetMargin = athenaWidgetWidth + screenEdgePadding; // Space needed for AthenaWidget
    const maxUsableWidth = workArea.width - defaultX - athenaWidgetMargin - screenEdgePadding;
    
    // Position window to leave same space for InputPill as horizontal space to AthenaWidget
    // Use actual InputPill position if available
    const inputPillMargin = screenEdgePadding; // Match horizontal spacing (20px) for consistent design
    const maxBottomY = Math.min(
        workArea.height - inputPillHeight - inputPillMargin, // calculated fallback
        actualInputPillY - inputPillMargin // actual InputPill position
    );
    
    // Start just below menu bar
    const defaultY = menuBarHeight + screenEdgePadding;
    const defaultHeight = maxBottomY - defaultY;
    
    logger.debug(`[Layout] Calculated: x=${defaultX}, y=${defaultY}, width=${maxUsableWidth}, height=${defaultHeight}`);
    
    return {
        defaultX,
        defaultY,
        defaultHeight: Math.max(defaultHeight, 600), // Much taller minimum height
        maxUsableWidth: Math.max(maxUsableWidth, minWindowWidth),
        windowGap,
        minWindowWidth,
        screenEdgePadding,
        menuBarHeight,
        athenaWidgetWidth,
        inputPillHeight,
        inputPillMargin,
        athenaWidgetMargin
    };
}

/**
 * Build platform components description for prompts
 */
export function buildPlatformComponentsDescription(workArea: WorkArea, calculations: LayoutCalculations): string[] {
    return [
        `- AthenaWidget: Rectangle at top-right (${workArea.width - calculations.athenaWidgetWidth - calculations.screenEdgePadding}, ${calculations.screenEdgePadding}) - Width: ${calculations.athenaWidgetWidth}px, Height: 250px`,
        `- InputPill: Rectangle at bottom-center (${Math.round((workArea.width - 700) / 2)}, ${workArea.height - calculations.inputPillHeight - calculations.screenEdgePadding}) - Width: 700px, Height: 60px`
    ];
}

/**
 * Normalize URLs to include protocol - shared utility to avoid duplication
 */
export function normalizeUrl(url: string): string {
    // If it already has a protocol, return as-is
    if (url.startsWith('http://') || 
        url.startsWith('https://') ||
        url.startsWith('apps://') ||
        url.startsWith('widgets://') ||
        url.startsWith('platform://')) {
        return url;
    }
    
    // Add https:// for domains
    return `https://${url}`;
}

/**
 * Layout pattern constants and decision logic
 */
export const LAYOUT_PATTERNS = {
    SINGLE_WINDOW: 'single',
    SIDE_BY_SIDE: 'side-by-side', 
    TOP_BOTTOM_SPLIT: 'top-bottom-split',
    GRID: 'grid'
} as const;

/**
 * Determine layout pattern based on window count
 */
export function getLayoutPattern(windowCount: number): string {
    if (windowCount === 0) return LAYOUT_PATTERNS.SINGLE_WINDOW;
    if (windowCount === 1) return LAYOUT_PATTERNS.SIDE_BY_SIDE;
    if (windowCount === 2) return LAYOUT_PATTERNS.TOP_BOTTOM_SPLIT;
    return LAYOUT_PATTERNS.GRID;
}

/**
 * Calculate side-by-side window width
 */
export function calculateSideBySideWidth(maxUsableWidth: number, windowGap: number): number {
    return Math.floor((maxUsableWidth - windowGap) / 2);
}

/**
 * Calculate top/bottom split dimensions
 */
export function calculateTopBottomSplit(defaultHeight: number, windowGap: number) {
    const topHeight = Math.floor(defaultHeight / 2) - Math.floor(windowGap / 2);
    const bottomHeight = defaultHeight - Math.floor(defaultHeight / 2) - Math.floor(windowGap / 2);
    return { topHeight, bottomHeight };
}

/**
 * Tool parameter validation constants
 */
export const TOOL_PARAMS = {
    CREATE_ELEMENT: ['type', 'contentType', 'contentSource', 'x', 'y', 'width', 'height'],
    MODIFY_ELEMENT: ['elementId', 'x', 'y', 'width', 'height']
} as const;

/**
 * URI scheme patterns for validation
 */
export const URI_SCHEMES = {
    EXTERNAL: /^https?:\/\/.+/,
    APPS: /^apps:\/\/[^\/\?]+(\?.*)?$/,
    PLATFORM: /^platform:\/\/[^\/\?]+$/,
    WIDGETS: /^widgets:\/\/[^\/\?]+(\?.*)?$/
} as const; 