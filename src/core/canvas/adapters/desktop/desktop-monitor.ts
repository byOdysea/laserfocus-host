import type { DesktopWindow, DesktopState, CanvasElement, CanvasOperation } from '@/lib/types/canvas';
import { BrowserWindow, screen } from 'electron';
import { createLogger } from '@utils/logger';

const logger = createLogger('[DesktopMonitor]');

export function startDesktopMonitoring(this: any): void {
    this.monitoringInterval = setInterval(async () => {
        try {
            await this.updateDesktopState();
        } catch (error) {
            logger.error('Error during desktop state monitoring:', error);
            this.stopDesktopMonitoring();
        }
    }, 1000);
}

export function stopDesktopMonitoring(this: any): void {
    if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
        logger.info('Stopped desktop monitoring');
    }
}

export async function updateDesktopState(this: any): Promise<void> {
    try {
        const allWindows = await this.getAllDesktopWindows();
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

        for (const [id, window] of this.managedElements) {
            if (!window.isDestroyed()) {
                const element = this.canvas.elements.find((e: CanvasElement) => e.id === id);
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

export async function getAllDesktopWindows(this: any): Promise<DesktopWindow[]> {
    const windows: DesktopWindow[] = [];

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

export function setupWindowEventHandlers(this: any, window: BrowserWindow, elementId: string): void {
    window.on('move', () => this.updateElementPosition(elementId));
    window.on('resize', () => this.updateElementSize(elementId));
    window.on('focus', () => this.updateElementFocus(elementId, true));
    window.on('blur', () => this.updateElementFocus(elementId, false));
    window.on('show', () => this.updateElementVisibility(elementId, true));
    window.on('hide', () => this.updateElementVisibility(elementId, false));
    window.on('closed', () => this.handleElementClosed(elementId));
    logger.debug(`Event handlers set up for element ${elementId}`);
}

export function updateElementPosition(this: any, elementId: string): void {
    const window = this.managedElements.get(elementId);
    const element = this.canvas.elements.find((e: CanvasElement) => e.id === elementId);
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

export function updateElementSize(this: any, elementId: string): void {
    const window = this.managedElements.get(elementId);
    const element = this.canvas.elements.find((e: CanvasElement) => e.id === elementId);
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

export function updateElementFocus(this: any, elementId: string, focused: boolean): void {
    const element = this.canvas.elements.find((e: CanvasElement) => e.id === elementId);
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

export function updateElementVisibility(this: any, elementId: string, visible: boolean): void {
    const element = this.canvas.elements.find((e: CanvasElement) => e.id === elementId);
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

export function handleElementClosed(this: any, elementId: string): void {
    this.managedElements.delete(elementId);
    this.canvas.elements = this.canvas.elements.filter((e: CanvasElement) => e.id !== elementId);
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

export function getActiveWindowId(this: any): string | null {
    return null;
}

export function getFocusedProcessName(this: any): string | null {
    return null;
}

