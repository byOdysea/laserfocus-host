import * as fs from 'fs';
import * as path from 'path';
import { Plugin } from 'vite';

interface DiscoveredUIComponent {
    name: string;
    type: 'platform' | 'app' | 'widget';
    fullPath: string;
    mainFile?: string;
    ipcFile?: string;
    preloadFile?: string;
}

/**
 * Discovers UI components from the file system and generates the registry
 */
export function discoverUIComponentsFromFileSystem(uiDir: string): DiscoveredUIComponent[] {
    const components: DiscoveredUIComponent[] = [];
    
    // Check platform directory
    const platformDir = path.join(uiDir, 'platform');
    if (fs.existsSync(platformDir)) {
        const platformComponents = fs.readdirSync(platformDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        for (const componentName of platformComponents) {
            const componentPath = path.join(platformDir, componentName);
            const component = createUIComponentInfo(componentName, 'platform', `platform/${componentName}`, componentPath);
            if (component) components.push(component);
        }
    }
    
    // Check apps directory
    const appsDir = path.join(uiDir, 'apps');
    if (fs.existsSync(appsDir)) {
        const appComponents = fs.readdirSync(appsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        for (const componentName of appComponents) {
            const componentPath = path.join(appsDir, componentName);
            const component = createUIComponentInfo(componentName, 'app', `apps/${componentName}`, componentPath);
            if (component) components.push(component);
        }
    }
    
    // Check widgets directory
    const widgetsDir = path.join(uiDir, 'widgets');
    if (fs.existsSync(widgetsDir)) {
        const widgetComponents = fs.readdirSync(widgetsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        for (const componentName of widgetComponents) {
            const componentPath = path.join(widgetsDir, componentName);
            const component = createUIComponentInfo(componentName, 'widget', `widgets/${componentName}`, componentPath);
            if (component) components.push(component);
        }
    }
    
    return components;
}

function createUIComponentInfo(
    name: string, 
    type: 'platform' | 'app' | 'widget', 
    fullPath: string, 
    componentPath: string
): DiscoveredUIComponent | null {
    const mainFile = findMainFile(componentPath, name);
    const ipcFile = findIpcFile(componentPath, name);
    const preloadFile = findPreloadFile(componentPath);
    
    if (!mainFile && !ipcFile) {
        return null; // Component must have at least one of these
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

function findMainFile(componentPath: string, componentName: string): string | undefined {
    const possibleNames = [
        `${componentName.toLowerCase()}.main.ts`,
        `${componentName.toLowerCase()}.main.js`,
        `main.ts`,
        `main.js`
    ];
    
    for (const fileName of possibleNames) {
        const filePath = path.join(componentPath, fileName);
        if (fs.existsSync(filePath)) {
            return fileName;
        }
    }
    
    return undefined;
}

function findIpcFile(componentPath: string, componentName: string): string | undefined {
    const possibleNames = [
        `${componentName.toLowerCase()}.ipc.ts`,
        `${componentName.toLowerCase()}.ipc.js`,
        `ipc.ts`,
        `ipc.js`
    ];
    
    for (const fileName of possibleNames) {
        const filePath = path.join(componentPath, fileName);
        if (fs.existsSync(filePath)) {
            return fileName;
        }
    }
    
    return undefined;
}

function findPreloadFile(componentPath: string): string | undefined {
    const possibleNames = ['preload.ts', 'preload.js'];
    
    for (const fileName of possibleNames) {
        const filePath = path.join(componentPath, fileName);
        if (fs.existsSync(filePath)) {
            return fileName;
        }
    }
    
    return undefined;
}

/**
 * Helper function to convert kebab-case to PascalCase for valid JS identifiers
 * Also preserves existing PascalCase names
 */
function toPascalCase(str: string): string {
    // If the string is already in PascalCase (starts with uppercase and has no separators), return as-is
    if (/^[A-Z][a-zA-Z0-9]*$/.test(str)) {
        return str;
    }
    
    return str
        .split(/[-_\s]+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

/**
 * Generates the UI component registry file
 */
export function generateUIComponentRegistry(components: DiscoveredUIComponent[], outputPath: string): void {
    const imports: string[] = [];
    const mainClassEntries: string[] = [];
    const ipcModuleEntries: string[] = [];
    const componentNames: string[] = [];
    
    components.forEach(component => {
        const { name, fullPath, mainFile, ipcFile } = component;
        const safeName = toPascalCase(name); // Convert to valid JS identifier
        
        if (mainFile) {
            const mainImportName = `${safeName}Main`;
            imports.push(`import * as ${mainImportName} from '@ui/${fullPath}/${mainFile.replace(/\.(ts|js)$/, '')}';`);
            
            mainClassEntries.push(`    if (${mainImportName}) {
         for (const [key, value] of Object.entries(${mainImportName})) {
             if (typeof value === 'function' && (key.includes('Window') || key.includes('${safeName}'))) {
                 registry.mainClasses.set('${safeName}', value);
                break;
            }
        }
    }`);
        }

        if (ipcFile) {
            const ipcImportName = `${safeName}Ipc`;
            imports.push(`import * as ${ipcImportName} from '@ui/${fullPath}/${ipcFile.replace(/\.(ts|js)$/, '')}';`);
            
            ipcModuleEntries.push(`    if (${ipcImportName}.default) {
         registry.ipcModules.set('${safeName}', ${ipcImportName}.default);
    }`);
        }
        
        componentNames.push(`'${safeName}'`);
    });
    
    const registryContent = `// Auto-generated file - do not edit manually
// This file is regenerated whenever the development server starts

${imports.join('\n')}

export interface UIComponentRegistry {
    mainClasses: Map<string, any>;
    ipcModules: Map<string, any>;
}

export function createUIComponentRegistry(): UIComponentRegistry {
    const registry: UIComponentRegistry = {
        mainClasses: new Map(),
        ipcModules: new Map(),
    };

${mainClassEntries.join('\n')}
${ipcModuleEntries.join('\n')}

    return registry;
}

export function getDiscoveredUIComponents(): string[] {
    return [${componentNames.join(', ')}];
}

export function getUIComponentType(componentName: string): 'platform' | 'app' | 'widget' {
    const platformUIComponents = [${components.filter(c => c.type === 'platform').map(c => `'${toPascalCase(c.name)}'`).join(', ')}];
    const widgets: string[] = [${components.filter(c => c.type === 'widget').map(c => `'${toPascalCase(c.name)}'`).join(', ')}];
    
    if (platformUIComponents.includes(componentName)) return 'platform';
    if (widgets.includes(componentName)) return 'widget';
    return 'app';
}

export function getUIComponentPath(componentName: string): string {
    const componentPaths: Record<string, string> = {
${components.map(component => `        '${toPascalCase(component.name)}': '${component.fullPath}'`).join(',\n')}
    };
    return componentPaths[componentName] || \`apps/\${componentName}\`;
}
`;
    
    fs.writeFileSync(outputPath, registryContent);
    // CLI feedback - console.log is appropriate for build-time tools
    console.log(`✅ Generated UI component registry with ${components.length} components`);
}

/**
 * Main function to discover and generate registry
 */
export function generateUIComponentRegistryFromFileSystem(uiDir: string, outputPath: string): void {
    const components = discoverUIComponentsFromFileSystem(uiDir);
    generateUIComponentRegistry(components, outputPath);
}

// CLI usage
if (require.main === module) {
    const uiDir = path.join(process.cwd(), 'src/ui');
    const outputPath = path.join(process.cwd(), 'src/core/platform/discovery/ui-component-registry.ts');
    
    generateUIComponentRegistryFromFileSystem(uiDir, outputPath);
}

export function generateViteElectronEntries(components: DiscoveredUIComponent[]) {
    const entries = [];
    
    for (const component of components) {
        if (component.preloadFile) {
            entries.push({
                entry: `src/ui/${component.fullPath}/${component.preloadFile}`,
                onstart(options: any) {
                    options.reload();
                },
                vite: {
                    build: {
                        outDir: `dist/ui/${component.fullPath}`,
                    },
                },
            });
        }
    }
    
    return entries;
}

export function generateViteInputs(components: DiscoveredUIComponent[]): Record<string, string> {
    const inputs: Record<string, string> = {};
    
    for (const component of components) {
        if (component.preloadFile) {
            // Convert CamelCase to camelCase for input keys
            const inputKey = component.name.charAt(0).toLowerCase() + component.name.slice(1);
            inputs[inputKey] = path.resolve(process.cwd(), `src/ui/${component.fullPath}/${component.preloadFile}`);
        }
    }
    
    return inputs;
}

export function createUIDiscoveryPlugin(): Plugin {
    return {
        name: 'ui-discovery',
        configResolved() {
            const uiComponents = discoverUIComponentsFromFileSystem('src/ui');
            generateUIComponentRegistry(uiComponents, path.join(process.cwd(), 'src/core/platform/discovery/ui-component-registry.ts'));
            // Vite plugin feedback - console.log is appropriate for build-time tools
            console.log(`[UI Discovery] Discovered ${uiComponents.length} UI components:`, uiComponents.map(c => c.name).join(', '));
        },
    };
} 