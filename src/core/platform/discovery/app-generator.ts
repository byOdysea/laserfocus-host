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
        // Handle new directory structure with forward compatibility
        let appType: string;
        let appName: string;
        
        if (fullAppName.startsWith('platform/')) {
            appType = 'platform';
            appName = fullAppName.replace('platform/', '');
        } else if (fullAppName.startsWith('apps/') || fullAppName.startsWith('app/')) {
            appType = 'apps';
            appName = fullAppName.replace(/^apps?\//, '');
        } else if (fullAppName.startsWith('widgets/') || fullAppName.startsWith('widget/')) {
            appType = 'widgets';
            appName = fullAppName.replace(/^widgets?\//, '');
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

        // Automatically regenerate the app registry to make the new app immediately available
        await this.regenerateAppRegistry();

        console.log(`\n📋 Next steps:`);
        console.log(`1. Run 'yarn dev' to start development`);
        console.log(`2. Your app is now immediately available to the agent!`);
        console.log(`3. Try: "open ${appName}" to test the new app`);
        console.log(`4. Customize the generated files to match your needs`);
    }

    /**
     * Regenerate the app registry to include the newly created app
     */
    private async regenerateAppRegistry(): Promise<void> {
        try {
            // Import the discovery functions
            const { discoverAppsFromFileSystem, generateAppRegistry } = require('./vite-app-discovery');
            
            // Discover all apps including the newly created one
            const uiComponents = discoverAppsFromFileSystem(this.options.uiDir);
            
            // Generate the updated registry
            const registryPath = path.join(process.cwd(), 'src/core/platform/discovery/app-registry.ts');
            generateAppRegistry(uiComponents, registryPath);
            
            console.log(`🔄 App registry regenerated with ${uiComponents.length} components`);
            console.log(`✨ "${this.parsedAppInfo.appName}" is now available for immediate use!`);
            
            // Try to hot-reload the registry in the running application
            await this.triggerHotReload();
            
        } catch (error) {
            console.warn(`⚠️  Failed to regenerate app registry:`, error);
            console.log(`💡 The app was created successfully, but you may need to restart to use it.`);
        }
    }

    /**
     * Trigger hot-reload in the running application if available
     */
    private async triggerHotReload(): Promise<void> {
        // For now, just provide clear messaging about registry regeneration
        // In the future, this could implement more sophisticated hot-reload via file watchers or IPC
        console.log(`🔥 Registry updated! If LaserFocus is running, restart it to use the new app immediately.`);
        console.log(`   Or use: yarn start:prod`);
    }

    private async generateMainClass(): Promise<void> {
        const { fullAppName, appName, appDir } = this.parsedAppInfo;
        const className = `${this.toPascalCase(appName)}Window`;
        const fileName = `${appName}.main.ts`;
        
        const content = `import { BrowserWindow, Display } from 'electron';
import { createAppFileLoader } from '@lib/utils/app-file-loader';

export class ${className} {
    public window: BrowserWindow;
    private fileLoader: ReturnType<typeof createAppFileLoader>;

    constructor(primaryDisplay: Display, viteDevServerUrl: string | undefined, preloadPath: string) {
        this.fileLoader = createAppFileLoader(viteDevServerUrl);
        this.window = new BrowserWindow({
            width: 600,
            height: 400,
            title: '${appName}',
            webPreferences: {
                preload: preloadPath,
                nodeIntegration: false,
                contextIsolation: true,
            },
        });
    }

    async init(): Promise<void> {
        await this.fileLoader.loadAppHtml(this.window, '${fullAppName}', '[${className}]');
    }

    focus(): void {
        this.window?.focus();
    }

    close(): void {
        this.window?.close();
    }
}`;

        const filePath = path.join(appDir, fileName);
        fs.writeFileSync(filePath, content);
        console.log(`📄 Generated: ${fileName}`);
    }

    private async generateIpcHandlers(): Promise<void> {
        const { appName, appDir } = this.parsedAppInfo;
        const fileName = `${appName}.ipc.ts`;
        const handlerName = `${this.toPascalCase(appName)}IpcHandlers`;
        const windowClass = `${this.toPascalCase(appName)}Window`;
        
        const content = `import { IpcMain } from 'electron';
import { AppIpcModule } from '@core/platform/ipc/types';
import { ${windowClass} } from '@ui/${this.parsedAppInfo.fullAppName}/${appName}.main';

const ${handlerName}: AppIpcModule = {
    moduleId: '${this.toPascalCase(appName)}',
    
    registerMainProcessHandlers: (ipcMain: IpcMain, appInstance: ${windowClass}) => {
        // Add your app-specific handlers here
        ipcMain.handle('${appName}:ping', () => 'pong');
    }
};

export default ${handlerName};`;

        const filePath = path.join(appDir, fileName);
        fs.writeFileSync(filePath, content);
        console.log(`📄 Generated: ${fileName}`);
    }

    private async generatePreload(): Promise<void> {
        const { appName, appDir } = this.parsedAppInfo;
        const apiName = `${this.toCamelCase(appName)}API`;
        
        const content = `import { contextBridge, ipcRenderer } from 'electron';

const api = {
    ping: () => ipcRenderer.invoke('${appName}:ping'),
};

contextBridge.exposeInMainWorld('${apiName}', api);

declare global {
    interface Window {
        ${apiName}: typeof api;
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
<html>
<head>
    <meta charset="UTF-8">
    <title>${appName}</title>
    <link rel="stylesheet" href="/src/ui/${fullAppName}/src/style.css">
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/src/ui/${fullAppName}/src/${scriptSrc}"></script>
</body>
</html>`;

        const filePath = path.join(appDir, 'src', 'index.html');
        fs.writeFileSync(filePath, content);
        console.log(`📄 Generated: index.html`);
    }

    private async generateStyles(): Promise<void> {
        const { appName, appDir } = this.parsedAppInfo;
        
        const content = `body {
    font-family: system-ui, sans-serif;
    margin: 0;
    padding: 20px;
}

#root {
    max-width: 800px;
}

h1 {
    color: #333;
    margin-bottom: 20px;
}

button {
    padding: 8px 16px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: #f9f9f9;
    cursor: pointer;
}

button:hover {
    background: #e9e9e9;
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

const root = createRoot(document.getElementById('root')!);
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
        
        const content = `import React from 'react';

export const ${componentName}: React.FC = () => {
    const handleClick = async () => {
        const result = await window.${apiName}.ping();
        alert('Response: ' + result);
    };

    return (
        <div>
            <h1>${this.toPascalCase(appName)}</h1>
            <button onClick={handleClick}>
                Test Connection
            </button>
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
        
        const content = `const root = document.getElementById('root')!;

root.innerHTML = \`
    <div>
        <h1>${this.toPascalCase(appName)}</h1>
        <button id="test-btn">Test Connection</button>
    </div>
\`;

const button = document.getElementById('test-btn')!;
button.addEventListener('click', async () => {
    const result = await window.${apiName}.ping();
    alert('Response: ' + result);
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