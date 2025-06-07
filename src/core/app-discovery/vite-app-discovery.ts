import * as fs from 'fs';
import * as path from 'path';
import { Plugin } from 'vite';

interface DiscoveredApp {
    name: string;
    type: 'platform-ui-component' | 'application' | 'widget';
    fullPath: string;
    mainFile?: string;
    ipcFile?: string;
    preloadFile?: string;
}

/**
 * Discovers apps from the file system and generates the registry
 */
export function discoverAppsFromFileSystem(uiDir: string): DiscoveredApp[] {
    const apps: DiscoveredApp[] = [];
    
    // Check platform directory
    const platformDir = path.join(uiDir, 'platform');
    if (fs.existsSync(platformDir)) {
        const platformApps = fs.readdirSync(platformDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        for (const appName of platformApps) {
            const appPath = path.join(platformDir, appName);
            const app = createAppInfo(appName, 'platform-ui-component', `platform/${appName}`, appPath);
            if (app) apps.push(app);
        }
    }
    
    // Check apps directory
    const appsDir = path.join(uiDir, 'apps');
    if (fs.existsSync(appsDir)) {
        const applicationApps = fs.readdirSync(appsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        for (const appName of applicationApps) {
            const appPath = path.join(appsDir, appName);
            const app = createAppInfo(appName, 'application', `apps/${appName}`, appPath);
            if (app) apps.push(app);
        }
    }
    
    // Check widgets directory
    const widgetsDir = path.join(uiDir, 'widgets');
    if (fs.existsSync(widgetsDir)) {
        const widgetApps = fs.readdirSync(widgetsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        for (const appName of widgetApps) {
            const appPath = path.join(widgetsDir, appName);
            const app = createAppInfo(appName, 'widget', `widgets/${appName}`, appPath);
            if (app) apps.push(app);
        }
    }
    
    return apps;
}

function createAppInfo(
    name: string, 
    type: 'platform-ui-component' | 'application' | 'widget', 
    fullPath: string, 
    appPath: string
): DiscoveredApp | null {
    const mainFile = findMainFile(appPath, name);
    const ipcFile = findIpcFile(appPath, name);
    const preloadFile = findPreloadFile(appPath);
    
    if (!mainFile && !ipcFile) {
        return null; // App must have at least one of these
    }
    
    return {
        name,
        type,
        fullPath,
        mainFile,
        ipcFile,
        preloadFile
    };
}

function findMainFile(appPath: string, appName: string): string | undefined {
    const possibleNames = [
        `${appName.toLowerCase()}.main.ts`,
        `${appName.toLowerCase()}.main.js`,
        `main.ts`,
        `main.js`
    ];
    
    for (const fileName of possibleNames) {
        const filePath = path.join(appPath, fileName);
        if (fs.existsSync(filePath)) {
            return fileName;
        }
    }
    
    return undefined;
}

function findIpcFile(appPath: string, appName: string): string | undefined {
    const possibleNames = [
        `${appName.toLowerCase()}.ipc.ts`,
        `${appName.toLowerCase()}.ipc.js`,
        `ipc.ts`,
        `ipc.js`
    ];
    
    for (const fileName of possibleNames) {
        const filePath = path.join(appPath, fileName);
        if (fs.existsSync(filePath)) {
            return fileName;
        }
    }
    
    return undefined;
}

function findPreloadFile(appPath: string): string | undefined {
    const possibleNames = ['preload.ts', 'preload.js'];
    
    for (const fileName of possibleNames) {
        const filePath = path.join(appPath, fileName);
        if (fs.existsSync(filePath)) {
            return fileName;
        }
    }
    
    return undefined;
}

/**
 * Generates the app registry file
 */
export function generateAppRegistry(apps: DiscoveredApp[], outputPath: string): void {
    const imports: string[] = [];
    const mainClassEntries: string[] = [];
    const ipcModuleEntries: string[] = [];
    const appNames: string[] = [];
    
    apps.forEach(app => {
        const { name, fullPath, mainFile, ipcFile } = app;
        
                 if (mainFile) {
             const mainImportName = `${name}Main`;
             imports.push(`import * as ${mainImportName} from '@ui/${fullPath}/${mainFile.replace(/\.(ts|js)$/, '')}';`);
            
             mainClassEntries.push(`    if (${mainImportName}) {
         for (const [key, value] of Object.entries(${mainImportName})) {
             if (typeof value === 'function' && (key.includes('Window') || key.includes('${name}'))) {
                 registry.mainClasses.set('${name}', value);
                break;
            }
        }
    }`);
        }

         if (ipcFile) {
             const ipcImportName = `${name}Ipc`;
             imports.push(`import * as ${ipcImportName} from '@ui/${fullPath}/${ipcFile.replace(/\.(ts|js)$/, '')}';`);
            
             ipcModuleEntries.push(`    if (${ipcImportName}.default) {
         registry.ipcModules.set('${name}', ${ipcImportName}.default);
    }`);
        }
        
        appNames.push(`'${name}'`);
    });
    
    const registryContent = `// Auto-generated file - do not edit manually
// This file is regenerated whenever the development server starts

${imports.join('\n')}

export interface AppRegistry {
    mainClasses: Map<string, any>;
    ipcModules: Map<string, any>;
}

export function createAppRegistry(): AppRegistry {
    const registry: AppRegistry = {
        mainClasses: new Map(),
        ipcModules: new Map(),
    };

${mainClassEntries.join('\n')}
${ipcModuleEntries.join('\n')}

    return registry;
}

export function getDiscoveredApps(): string[] {
    return [${appNames.join(', ')}];
}

export function getAppType(appName: string): 'platform-ui-component' | 'application' | 'widget' {
    const platformUIComponents = [${apps.filter(a => a.type === 'platform-ui-component').map(a => `'${a.name}'`).join(', ')}];
    const widgets = [${apps.filter(a => a.type === 'widget').map(a => `'${a.name}'`).join(', ')}];
    
    if (platformUIComponents.includes(appName)) return 'platform-ui-component';
    if (widgets.includes(appName)) return 'widget';
    return 'application';
}

export function getAppPath(appName: string): string {
    const appPaths: Record<string, string> = {
${apps.map(app => `        '${app.name}': '${app.fullPath}'`).join(',\n')}
    };
    return appPaths[appName] || \`apps/\${appName}\`;
}
`;
    
    fs.writeFileSync(outputPath, registryContent);
    console.log(`✅ Generated app registry with ${apps.length} apps`);
}

/**
 * Main function to discover and generate registry
 */
export function generateAppRegistryFromFileSystem(uiDir: string, outputPath: string): void {
    const apps = discoverAppsFromFileSystem(uiDir);
    generateAppRegistry(apps, outputPath);
}

// CLI usage
if (require.main === module) {
    const uiDir = path.join(process.cwd(), 'src/ui');
    const outputPath = path.join(process.cwd(), 'src/core/app-discovery/app-registry.ts');
    
    generateAppRegistryFromFileSystem(uiDir, outputPath);
}

export function generateViteElectronEntries(apps: DiscoveredApp[]) {
    const entries = [];
    
    for (const app of apps) {
        if (app.preloadFile) {
            entries.push({
                entry: `src/ui/${app.fullPath}/${app.preloadFile}`,
                onstart(options: any) {
                    options.reload();
                },
                vite: {
                    build: {
                        outDir: `dist/ui/${app.fullPath}`,
                    },
                },
            });
        }
    }
    
    return entries;
}

export function generateViteInputs(apps: DiscoveredApp[]): Record<string, string> {
    const inputs: Record<string, string> = {};
    
    for (const app of apps) {
        if (app.preloadFile) {
            // Convert CamelCase to camelCase for input keys
            const inputKey = app.name.charAt(0).toLowerCase() + app.name.slice(1);
            inputs[inputKey] = path.resolve(process.cwd(), `src/ui/${app.fullPath}/${app.preloadFile}`);
        }
    }
    
    return inputs;
}

export function createUIDiscoveryPlugin(): Plugin {
    return {
        name: 'ui-discovery',
        configResolved() {
            const uiComponents = discoverAppsFromFileSystem('src/ui');
            generateAppRegistry(uiComponents, path.join(process.cwd(), 'src/core/app-discovery/app-registry.ts'));
            console.log(`[UI Discovery] Discovered ${uiComponents.length} UI components:`, uiComponents.map(a => a.name).join(', '));
        },
    };
} 