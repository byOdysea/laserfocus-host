/**
 * Canvas Engine Type Definitions
 * Abstract canvas concepts that work with any canvas implementation
 * Preparing for Desktop → VisionOS → AR/WebXR evolution
 */

// ===================================================================
// CORE CANVAS ABSTRACTIONS
// ===================================================================

/**
 * Abstract element that exists on any canvas (window, 3D object, panel, etc.)
 */
export interface CanvasElement {
    id: string;
    type: string;                    // 'window', 'object3d', 'panel', 'widget'
    metadata: Record<string, any>;   // Canvas-specific metadata
    transform: CanvasTransform;      // Position/size abstraction
    content?: CanvasContent;         // What the element contains
    state: ElementState;             // Current element state
    canvasType: string;              // Which canvas this element belongs to
}

/**
 * Abstract positioning system (works for 2D desktop, 3D VisionOS, etc.)
 */
export interface CanvasTransform {
    position: Position;              // Abstract position
    size: Size;                      // Abstract size  
    rotation?: Rotation;             // For 3D canvases (VisionOS, AR)
    anchor?: AnchorPoint;            // Reference point for positioning
}

/**
 * Position abstraction - works for any coordinate system
 */
export interface Position {
    coordinates: number[];           // [x,y] for 2D, [x,y,z] for 3D
    reference: 'absolute' | 'relative' | 'anchor';
    relativeTo?: string;             // Element ID if relative positioning
    units: 'pixels' | 'meters' | 'percent' | 'viewport';
}

/**
 * Size abstraction - works for any measurement system
 */
export interface Size {
    dimensions: number[];            // [w,h] for 2D, [w,h,d] for 3D
    units: 'pixels' | 'meters' | 'percent' | 'viewport';
    aspectRatio?: number;            // Maintain aspect ratio
    constraints?: SizeConstraint[];   // Min/max bounds
}

/**
 * Rotation for 3D canvases
 */
export interface Rotation {
    angles: number[];                // [rx, ry, rz] in degrees/radians
    units: 'degrees' | 'radians';
    pivot?: number[];                // Rotation pivot point
}

/**
 * Anchor point for positioning
 */
export interface AnchorPoint {
    horizontal: 'left' | 'center' | 'right';
    vertical: 'top' | 'center' | 'bottom';
    depth?: 'front' | 'center' | 'back';  // For 3D
}

/**
 * Content abstraction - what goes inside elements
 */
export interface CanvasContent {
    type: 'url' | 'component' | 'native' | 'custom';
    source: string;                  // URL, component name, native app, etc.
    parameters?: Record<string, any>; // Content-specific parameters
    metadata?: Record<string, any>;   // Additional content metadata
}

/**
 * Element state - current status and properties
 */
export interface ElementState {
    visible: boolean;
    interactive: boolean;
    focused: boolean;
    minimized?: boolean;             // Desktop-specific
    properties: Record<string, any>; // Canvas-specific state
}

/**
 * Size constraints
 */
export interface SizeConstraint {
    type: 'min' | 'max' | 'exact';
    dimension: 'width' | 'height' | 'depth';
    value: number;
    units: string;
}

// ===================================================================
// CANVAS DEFINITIONS
// ===================================================================

/**
 * The canvas itself - abstract workspace
 */
export interface Canvas {
    id: string;
    type: string;                    // 'desktop', 'visionos', 'browser', 'ar'
    elements: CanvasElement[];
    boundaries: CanvasBoundaries;
    capabilities: CanvasCapabilities;
    constraints: CanvasConstraint[];
    metadata: Record<string, any>;   // Canvas-specific data
}

/**
 * Canvas boundaries (viewport, space, room, etc.)
 */
export interface CanvasBoundaries {
    dimensions: number[];            // [w,h] for 2D, [w,h,d] for 3D
    units: string;
    origin: number[];                // Where [0,0,0] is located
    constraints?: BoundaryConstraint[];
}

/**
 * What the canvas can do
 */
export interface CanvasCapabilities {
    maxElements?: number;
    supportedElementTypes: string[];
    supportedOperations: string[];
    supports3D: boolean;
    supportsLayers: boolean;
    supportsRotation: boolean;
    supportsTransparency: boolean;
    supportsAnimation: boolean;
    coordinateSystem: '2d' | '3d' | 'mixed';
}

/**
 * Canvas-wide constraints
 */
export interface CanvasConstraint {
    id: string;
    type: 'reserved_area' | 'avoid_region' | 'preferred_zone' | 'custom';
    region: Region;
    priority: number;
    description: string;
}

/**
 * Constraints on specific regions (reserved areas, etc.)
 */
export interface BoundaryConstraint {
    region: Region;
    type: 'reserved' | 'avoid' | 'preferred';
    priority: number;
    metadata?: Record<string, any>;
}

/**
 * Abstract region definition
 */
export interface Region {
    shape: 'rectangle' | 'circle' | 'sphere' | 'polygon' | 'custom';
    bounds: number[];                // Shape-specific bounds
    transform?: Partial<CanvasTransform>; // Region positioning
}

// ===================================================================
// DESKTOP STATE (ENHANCED AWARENESS)  
// ===================================================================

/**
 * Enhanced desktop window information - ALL windows, not just managed
 */
export interface DesktopWindow {
    id: string;
    processName: string;             // "Google Chrome", "Code", "Finder" 
    processId: number;
    title: string;
    bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    isVisible: boolean;
    isMinimized: boolean;
    isFocused: boolean;
    isFullscreen: boolean;
    managedByEngine: boolean;        // true if we created/manage it
    managedId?: string;              // our internal ID if managed
    windowLayer: number;             // z-order
    ownerName?: string;              // "chrome", "electron", "finder"
    windowType?: string;             // "browser", "editor", "system", etc.
}

/**
 * Complete desktop state
 */
export interface DesktopState {
    windows: DesktopWindow[];
    displays: Electron.Display[];
    activeWindowId: string | null;
    focusedProcessName: string | null;
    timestamp: number;
    workArea: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

// ===================================================================
// CANVAS ADAPTER INTERFACE
// ===================================================================

/**
 * Canvas Adapter Interface
 * Implement this for different canvas types (desktop, VisionOS, etc.)
 */
export interface CanvasAdapter {
    readonly canvasType: string;
    
    initializeCanvas(): Promise<Canvas>;
    createElement(params: CreateElementParams): Promise<CanvasElement>;
    modifyElement(element: CanvasElement, changes: ModifyElementParams): Promise<void>;
    removeElement(element: CanvasElement): Promise<void>;
    
    // State management
    getCanvasState(): Promise<Canvas>;
    monitorChanges(callback: (canvas: Canvas) => void): void;
    
    // Lifecycle
    destroy(): Promise<void>;
}

/**
 * Parameters for creating elements
 */
export interface CreateElementParams {
    type: string;
    content?: CanvasContent;
    transform?: Partial<CanvasTransform>;
    metadata?: Record<string, any>;
    constraints?: ElementConstraint[];
}

/**
 * Parameters for modifying elements
 */
export interface ModifyElementParams {
    transform?: Partial<CanvasTransform>;
    state?: Partial<ElementState>;
    metadata?: Record<string, any>;
    content?: Partial<CanvasContent>;
}

/**
 * Element-specific constraints
 */
export interface ElementConstraint {
    type: 'position' | 'size' | 'relationship' | 'custom';
    rule: string;
    parameters: Record<string, any>;
}

// ===================================================================
// OPERATION TRACKING
// ===================================================================

/**
 * Track operations for context and undo functionality
 */
export interface CanvasOperation {
    id: string;
    type: 'create' | 'modify' | 'remove' | 'focus' | 'custom';
    elementId?: string;
    timestamp: number;
    parameters: Record<string, any>;
    result?: Record<string, any>;
    error?: string;
}

 