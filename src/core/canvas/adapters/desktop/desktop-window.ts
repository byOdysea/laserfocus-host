import type { CanvasElement, CreateElementParams } from '@/lib/types/canvas';
import { BrowserWindow } from 'electron';
import { createLogger } from '@utils/logger';
import { ConfigurationManager } from '../infrastructure/config/configuration-manager';
import { getUIDiscoveryService } from '../platform/discovery/main-process-discovery';

const logger = createLogger('[DesktopWindow]');

function toPascalCase(str: string): string {
    if (!str) return '';
    return str
        .split(/[-_\s]+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

export async function createBrowserWindow(this: any, params: CreateElementParams): Promise<CanvasElement> {
    const elementIndex = this.canvas.elements.length;
    const elementId = `element-${elementIndex}`;

    if (!params.transform?.position?.coordinates || !params.transform?.size?.dimensions) {
        throw new Error('Agent must provide complete positioning (x, y, width, height) for all windows. No hardcoded fallbacks allowed.');
    }

    const x = params.transform.position.coordinates[0];
    const y = params.transform.position.coordinates[1];
    const width = params.transform.size.dimensions[0];
    const height = params.transform.size.dimensions[1];
    const contentSource = params.content?.source || '';

    if (this.isInternalUriScheme(contentSource)) {
        return await createInternalUIComponent.call(this, params, elementId, x, y, width, height, contentSource);
    }

    const configManager = ConfigurationManager.getInstance();
    const config = configManager.get();
    const showFrame = config.ui?.browserWindowFrame ?? false;

    const window = new BrowserWindow({
        x, y, width, height,
        show: false,
        frame: showFrame,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            sandbox: true
        },
        skipTaskbar: false,
        minimizable: true,
        maximizable: true,
        closable: true
    });

    logger.info(`Created BrowserWindow for ${contentSource} at (${x}, ${y}) size ${width}x${height}`);

    const normalizedUrl = this.normalizeUrl(contentSource);
    logger.debug(`Loading URL: ${normalizedUrl}`);

    try {
        await window.loadURL(normalizedUrl);
        logger.debug(`Successfully loaded URL: ${normalizedUrl}`);
        logger.debug(`Showing window for ${normalizedUrl}`);
        window.show();
        window.focus();
    } catch (error) {
        logger.error(`Failed to load URL ${normalizedUrl}:`, error);
        throw error;
    }

    setTimeout(() => {
        if (!window.isDestroyed() && !window.isVisible()) {
            logger.debug('Window still not visible, forcing show');
            window.show();
            window.focus();
        }
    }, 500);

    setTimeout(() => {
        const bounds = window.getBounds();
        logger.debug(`Window state check - Visible: ${window.isVisible()}, Bounds: ${JSON.stringify(bounds)}, Destroyed: ${window.isDestroyed()}`);
    }, 1000);

    this.managedElements.set(elementId, window);
    this.setupWindowEventHandlers(window, elementId);

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

    this.canvas.elements.push(element);

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

export async function createInternalUIComponent(this: any,
    params: CreateElementParams,
    elementId: string,
    x: number,
    y: number,
    width: number,
    height: number,
    contentSource: string): Promise<CanvasElement> {
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
    componentWindow.setBounds({ x, y, width, height });
    componentWindow.once('ready-to-show', () => {
        componentWindow.show();
        componentWindow.focus();
    });

    this.managedElements.set(elementId, componentWindow);
    this.setupWindowEventHandlers(componentWindow, elementId);

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

    this.canvas.elements.push(element);

    if (parsedUri.params.size > 0) {
        logger.info('Component parameters:', Object.fromEntries(parsedUri.params));
        componentWindow.webContents.once('dom-ready', () => {
            componentWindow.webContents.send('component-params', Object.fromEntries(parsedUri.params));
        });
    }

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

export async function createApplicationWindow(this: any, params: CreateElementParams): Promise<CanvasElement> {
    return await createBrowserWindow.call(this, { ...params, type: 'application' });
}

