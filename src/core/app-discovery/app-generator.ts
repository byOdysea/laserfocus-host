#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';

interface AppGeneratorOptions {
    appName: string;
    uiDir?: string;
    useReact?: boolean;
}

export class AppGenerator {
    private options: AppGeneratorOptions & { uiDir: string; useReact: boolean };
    private parsedAppInfo: {
        fullAppName: string;
        appName: string;
        category?: string;
        appDir: string;
    };

    constructor(options: AppGeneratorOptions) {
        this.options = {
            uiDir: 'src/ui',
            useReact: true,
            ...options,
        };
        
        // Parse the app name to extract category and actual app name
        this.parsedAppInfo = this.parseAppName(this.options.appName);
    }

    private parseAppName(fullAppName: string): {
        fullAppName: string;
        appName: string;
        category?: string;
        appDir: string;
    } {
        // Handle new directory structure
        let appType: string;
        let appName: string;
        
        if (fullAppName.startsWith('platform/')) {
            appType = 'platform';
            appName = fullAppName.replace('platform/', '');
        } else if (fullAppName.startsWith('apps/')) {
            appType = 'apps';
            appName = fullAppName.replace('apps/', '');
        } else if (fullAppName.startsWith('widgets/')) {
            appType = 'widgets';
            appName = fullAppName.replace('widgets/', '');
        } else {
            // Default to apps for backward compatibility
            appType = 'apps';
            appName = fullAppName;
        }
        
        // Normalize directory name to kebab-case for consistency
        const normalizedAppName = this.toKebabCase(appName);
        const appDir = path.join(this.options.uiDir, appType, normalizedAppName);
        
        return {
            fullAppName: `${appType}/${normalizedAppName}`,
            appName: normalizedAppName,
            category: appType,
            appDir
        };
    }

    private toPascalCase(str: string): string {
        return str
            .split(/[-_\s]+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }

    private toCamelCase(str: string): string {
        const pascal = this.toPascalCase(str);
        return pascal.charAt(0).toLowerCase() + pascal.slice(1);
    }

    private toKebabCase(str: string): string {
        return str
            .replace(/([a-z])([A-Z])/g, '$1-$2')  // camelCase to kebab-case
            .replace(/[\s_]+/g, '-')              // spaces and underscores to hyphens
            .toLowerCase()
            .replace(/^-+|-+$/g, '');             // trim leading/trailing hyphens
    }



    async generateApp(): Promise<void> {
        const { appName, category, appDir } = this.parsedAppInfo;

        console.log(`🚀 Generating new app: ${appName}${category ? ` (category: ${category})` : ''}`);
        
        // Create app directory (including any nested category directories)
        if (!fs.existsSync(appDir)) {
            fs.mkdirSync(appDir, { recursive: true });
            console.log(`📁 Created directory: ${appDir}`);
        } else {
            console.error(`❌ Directory already exists: ${appDir}`);
            return;
        }
        
        const srcDir = path.join(appDir, 'src');
        fs.mkdirSync(srcDir, { recursive: true });

        // Generate all boilerplate files
        await this.generateMainClass();
        await this.generateIpcHandlers();
        await this.generatePreload();
        await this.generateHtml();
        await this.generateStyles();
        
        if (this.options.useReact) {
            await this.generateReactRenderer();
            await this.generateReactComponent();
            console.log(`✅ React app "${appName}" generated successfully!`);
        } else {
            await this.generateVanillaRenderer();
            console.log(`✅ Vanilla app "${appName}" generated successfully!`);
        }

        console.log(`\n📋 Next steps:`);
        console.log(`1. Run 'yarn dev' to start development`);
        console.log(`2. Your app will be automatically discovered and built`);
        console.log(`3. Customize the generated files to match your needs`);
    }

    private async generateMainClass(): Promise<void> {
        const { fullAppName, appName, appDir } = this.parsedAppInfo;
        const className = `${this.toPascalCase(appName)}Window`;
        const fileName = `${appName}.main.ts`;  // Already kebab-case from normalization
        
        const content = `import { BrowserWindow, Display, app } from 'electron';
import * as path from 'path';
import * as logger from '@utils/logger';

export class ${className} {
    public window: BrowserWindow;
    private viteDevServerUrl: string | undefined;
    private preloadPath: string;

    constructor(primaryDisplay: Display, viteDevServerUrl: string | undefined, preloadPath: string) {
        this.viteDevServerUrl = viteDevServerUrl;
        this.preloadPath = preloadPath;
        this.window = new BrowserWindow({
            width: 800,
            height: 600,
            title: '${appName}',
            webPreferences: {
                preload: this.preloadPath,
                nodeIntegration: false,
                contextIsolation: true,
            },
            frame: false,
            backgroundColor: '#ffffff',
            show: false, // Don't show until ready
            minWidth: 400,
            minHeight: 300,
        });

        // Show window when ready to prevent visual flash
        this.window.once('ready-to-show', () => {
            this.window.show();
        });
    }

    init(): void {
        if (this.viteDevServerUrl) {
            // Development: Load from Vite dev server
            const devPath = '${fullAppName}';
            this.window.loadURL(\`\${this.viteDevServerUrl}/src/ui/\${devPath}/src/index.html\`);
            logger.info('[${className}] Loading from Vite dev server');
        } else {
            // Production: Load from built files
            const basePath = app.getAppPath();
            const prodPath = '${fullAppName}';
            const rendererPath = path.join(basePath, \`dist/ui/\${prodPath}/src/index.html\`);
            logger.info(\`[${className}] Loading from built file: \${rendererPath}\`);
            this.window.loadFile(rendererPath);
        }
        
        // Open DevTools in development
        if (this.viteDevServerUrl) {
            // this.window.webContents.openDevTools({ mode: 'detach' });
        }
    }

    focus(): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.focus();
        }
    }

    close(): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.close();
        }
    }
}`;

        const filePath = path.join(appDir, fileName);
        fs.writeFileSync(filePath, content);
        console.log(`📄 Generated: ${fileName}`);
    }

    private async generateIpcHandlers(): Promise<void> {
        const { appName, appDir } = this.parsedAppInfo;
        const fileName = `${appName}.ipc.ts`;  // Already kebab-case from normalization
        const handlerName = `${this.toPascalCase(appName)}IpcHandlers`;
        const windowClass = `${this.toPascalCase(appName)}Window`;
        
        const content = `import { IpcMain } from 'electron';
import { CanvasEngine } from '@core/engine/canvas-engine';
import { AppIpcModule, AppMainProcessInstances } from '@core/bridge/types';
        import { ${windowClass} } from '@ui/${this.parsedAppInfo.fullAppName}/${appName}.main';
import * as logger from '@utils/logger';

const ${handlerName}: AppIpcModule = {
    moduleId: '${appName}',
    
    registerMainProcessHandlers: (
        ipcMain: IpcMain,
        canvasEngine: CanvasEngine,
        appInstance: ${windowClass},
        allAppInstances?: AppMainProcessInstances
    ) => {
        logger.info('[${appName}IPC] Registering ${appName} IPC handlers');

        // Example: Handle app-specific events
        ipcMain.handle('${appName}:example-action', async (event, data) => {
            try {
                logger.info(\`[${appName}IPC] Example action called with:\`, data);
                // Add your app-specific logic here
                return { success: true, result: 'Example result' };
            } catch (error) {
                logger.error('[${appName}IPC] Error in example action:', error);
                return { success: false, error: 'Failed to execute action' };
            }
        });

        // Focus the app window
        ipcMain.on('${appName}:focus', () => {
            if (appInstance && appInstance.window && !appInstance.window.isDestroyed()) {
                appInstance.focus();
            }
        });

        logger.info('[${appName}IPC] ${appName} IPC handlers registered successfully');
    }
};

export default ${handlerName};`;

        const filePath = path.join(appDir, fileName);
        fs.writeFileSync(filePath, content);
        console.log(`📄 Generated: ${fileName}`);
    }

    private async generatePreload(): Promise<void> {
        const { appName, appDir } = this.parsedAppInfo;
        const apiName = `${appName.toLowerCase()}API`;
        
        const content = `import { contextBridge, ipcRenderer } from 'electron';

export interface ${appName}API {
    exampleAction: (data: any) => Promise<{ success: boolean; result?: any; error?: string }>;
    focusWindow: () => void;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('${apiName}', {
    exampleAction: (data: any) => ipcRenderer.invoke('${appName.toLowerCase()}:example-action', data),
    focusWindow: () => ipcRenderer.send('${appName.toLowerCase()}:focus'),
} as ${appName}API);

// Also expose to global window type for TypeScript
declare global {
    interface Window {
        ${apiName}: ${appName}API;
    }
}`;

        const filePath = path.join(appDir, 'preload.ts');
        fs.writeFileSync(filePath, content);
        console.log(`📄 Generated: preload.ts`);
    }

    private async generateHtml(): Promise<void> {
        const { fullAppName, appName, appDir } = this.parsedAppInfo;
        const scriptSrc = this.options.useReact ? 'renderer.tsx' : 'renderer.ts';
        
        const content = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${appName}</title>
    <link rel="stylesheet" href="/src/ui/${fullAppName}/src/style.css">
    <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline';">
</head>
<body>
    <div id="${appName.toLowerCase()}-root"></div>
    <script type="module" src="/src/ui/${fullAppName}/src/${scriptSrc}"></script>
</body>
</html>`;

        const filePath = path.join(appDir, 'src', 'index.html');
        fs.writeFileSync(filePath, content);
        console.log(`📄 Generated: index.html`);
    }

    private async generateStyles(): Promise<void> {
        const { appName, appDir } = this.parsedAppInfo;
        
        const content = `/* ${appName} App Styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    background-color: #f8f9fa;
    color: #333;
    height: 100vh;
    overflow: hidden;
}

#${appName.toLowerCase()}-root {
    height: 100vh;
    display: flex;
    flex-direction: column;
}

/* Header */
.${appName.toLowerCase()}-header {
    background-color: #ffffff;
    border-bottom: 1px solid #e9ecef;
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
}

.${appName.toLowerCase()}-title {
    font-size: 20px;
    font-weight: 600;
    color: #2c3e50;
}

/* Content */
.${appName.toLowerCase()}-content {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
}

/* Buttons */
.btn {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
}

.btn:hover {
    background-color: #0056b3;
}

.btn:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
}

/* Empty state */
.empty-state {
    text-align: center;
    color: #6c757d;
    padding: 40px 20px;
    font-size: 16px;
}`;

        const filePath = path.join(appDir, 'src', 'style.css');
        fs.writeFileSync(filePath, content);
        console.log(`📄 Generated: style.css`);
    }

    private async generateReactRenderer(): Promise<void> {
        const { appName, appDir } = this.parsedAppInfo;
        const componentName = `${this.toPascalCase(appName)}App`;
        
        const content = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { ${componentName} } from './components/${componentName}';

const container = document.getElementById('${appName.toLowerCase()}-root');
if (!container) {
    throw new Error('Failed to find the root element');
}

const root = createRoot(container);
root.render(<${componentName} />);`;

        const filePath = path.join(appDir, 'src', 'renderer.tsx');
        fs.writeFileSync(filePath, content);
        console.log(`📄 Generated: renderer.tsx`);
    }

    private async generateReactComponent(): Promise<void> {
        const { appName, appDir } = this.parsedAppInfo;
        const componentName = `${this.toPascalCase(appName)}App`;
        const apiName = `${this.toCamelCase(appName)}API`;
        
        // Create components directory
        const componentsDir = path.join(appDir, 'src', 'components');
        if (!fs.existsSync(componentsDir)) {
            fs.mkdirSync(componentsDir, { recursive: true });
        }
        
        const content = `import React, { useState, useEffect } from 'react';

interface ${componentName}State {
    isLoading: boolean;
    error: string | null;
    data: any;
}

export const ${componentName}: React.FC = () => {
    const [state, setState] = useState<${componentName}State>({
        isLoading: false,
        error: null,
        data: null,
    });

    const handleExampleAction = async () => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));
        
        try {
            const result = await window.${apiName}.exampleAction({ example: 'data' });
            if (result.success) {
                setState(prev => ({
                    ...prev,
                    data: result.result,
                    isLoading: false,
                }));
            } else {
                setState(prev => ({
                    ...prev,
                    error: result.error || 'Unknown error',
                    isLoading: false,
                }));
            }
        } catch (error) {
            setState(prev => ({
                ...prev,
                error: 'Failed to execute action',
                isLoading: false,
            }));
        }
    };

    return (
        <div className="${appName.toLowerCase()}-app">
            {/* Header */}
            <div className="${appName.toLowerCase()}-header">
                <h1 className="${appName.toLowerCase()}-title">${this.toPascalCase(appName)}</h1>
                <button 
                    className="btn" 
                    onClick={handleExampleAction}
                    disabled={state.isLoading}
                >
                    {state.isLoading ? 'Loading...' : 'Example Action'}
                </button>
            </div>

            {/* Content */}
            <div className="${appName.toLowerCase()}-content">
                {state.error ? (
                    <div className="empty-state">Error: {state.error}</div>
                ) : state.data ? (
                    <div>
                        <h3>Result:</h3>
                        <pre>{JSON.stringify(state.data, null, 2)}</pre>
                    </div>
                ) : (
                    <div className="empty-state">
                        Welcome to ${this.toPascalCase(appName)}!<br />
                        Click "Example Action" to get started.
                    </div>
                )}
            </div>
        </div>
    );
};`;

        const filePath = path.join(componentsDir, `${componentName}.tsx`);
        fs.writeFileSync(filePath, content);
        console.log(`📄 Generated: components/${componentName}.tsx`);
    }

    private async generateVanillaRenderer(): Promise<void> {
        const { appName, appDir } = this.parsedAppInfo;
        const apiName = `${this.toCamelCase(appName)}API`;
        
        const content = `const appRoot = document.getElementById('${appName.toLowerCase()}-root');

if (!appRoot) {
    throw new Error('Failed to find the root element');
}

// Create app structure
appRoot.innerHTML = \`
    <div class="${appName.toLowerCase()}-app">
        <div class="${appName.toLowerCase()}-header">
            <h1 class="${appName.toLowerCase()}-title">${this.toPascalCase(appName)}</h1>
            <button id="example-btn" class="btn">Example Action</button>
        </div>
        <div class="${appName.toLowerCase()}-content">
            <div id="content-area" class="empty-state">
                Welcome to ${this.toPascalCase(appName)}!<br />
                Click "Example Action" to get started.
            </div>
        </div>
    </div>
\`;

// Add event listeners
const exampleBtn = document.getElementById('example-btn') as HTMLButtonElement;
const contentArea = document.getElementById('content-area') as HTMLDivElement;

exampleBtn.addEventListener('click', async () => {
    exampleBtn.disabled = true;
    exampleBtn.textContent = 'Loading...';
    contentArea.textContent = 'Loading...';
    contentArea.className = 'empty-state';
    
    try {
        const result = await window.${apiName}.exampleAction({ example: 'data' });
        
        if (result.success) {
            contentArea.innerHTML = \`
                <h3>Result:</h3>
                <pre>\${JSON.stringify(result.result, null, 2)}</pre>
            \`;
            contentArea.className = '';
        } else {
            contentArea.textContent = \`Error: \${result.error || 'Unknown error'}\`;
            contentArea.className = 'empty-state';
        }
    } catch (error) {
        contentArea.textContent = 'Failed to execute action';
        contentArea.className = 'empty-state';
    } finally {
        exampleBtn.disabled = false;
        exampleBtn.textContent = 'Example Action';
    }
});`;

        const filePath = path.join(appDir, 'src', 'renderer.ts');
        fs.writeFileSync(filePath, content);
        console.log(`📄 Generated: renderer.ts`);
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: npm run create-app <path/AppName> [--vanilla]');
        console.log('Examples:');
        console.log('  npm run create-app Calendar                    # defaults to apps/Calendar');
        console.log('  npm run create-app platform/StatusBar');
        console.log('  npm run create-app apps/TodoManager --vanilla');
        console.log('  npm run create-app widgets/WeatherWidget');
        process.exit(1);
    }
    
    const nonFlagArgs = args.filter(arg => !arg.startsWith('--'));
    const appPath = nonFlagArgs[0];
    const useReact = !args.includes('--vanilla');
    
    const generator = new AppGenerator({ appName: appPath, useReact });
    generator.generateApp().catch(console.error);
} 