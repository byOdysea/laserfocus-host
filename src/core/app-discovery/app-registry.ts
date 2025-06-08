// Auto-generated file - do not edit manually
// This file is regenerated whenever the development server starts

import * as AthenaWidgetMain from '@ui/platform/AthenaWidget/athenawidget.main';
import * as AthenaWidgetIpc from '@ui/platform/AthenaWidget/athenawidget.ipc';
import * as ByokwidgetMain from '@ui/platform/Byokwidget/byokwidget.main';
import * as ByokwidgetIpc from '@ui/platform/Byokwidget/byokwidget.ipc';
import * as InputPillMain from '@ui/platform/InputPill/inputpill.main';
import * as InputPillIpc from '@ui/platform/InputPill/inputpill.ipc';

export interface AppRegistry {
    mainClasses: Map<string, any>;
    ipcModules: Map<string, any>;
}

export function createAppRegistry(): AppRegistry {
    const registry: AppRegistry = {
        mainClasses: new Map(),
        ipcModules: new Map(),
    };

    if (AthenaWidgetMain) {
         for (const [key, value] of Object.entries(AthenaWidgetMain)) {
             if (typeof value === 'function' && (key.includes('Window') || key.includes('AthenaWidget'))) {
                 registry.mainClasses.set('AthenaWidget', value);
                break;
            }
        }
    }
    if (ByokwidgetMain) {
         for (const [key, value] of Object.entries(ByokwidgetMain)) {
             if (typeof value === 'function' && (key.includes('Window') || key.includes('Byokwidget'))) {
                 registry.mainClasses.set('Byokwidget', value);
                break;
            }
        }
    }
    if (InputPillMain) {
         for (const [key, value] of Object.entries(InputPillMain)) {
             if (typeof value === 'function' && (key.includes('Window') || key.includes('InputPill'))) {
                 registry.mainClasses.set('InputPill', value);
                break;
            }
        }
    }
    if (AthenaWidgetIpc.default) {
         registry.ipcModules.set('AthenaWidget', AthenaWidgetIpc.default);
    }
    if (ByokwidgetIpc.default) {
         registry.ipcModules.set('Byokwidget', ByokwidgetIpc.default);
    }
    if (InputPillIpc.default) {
         registry.ipcModules.set('InputPill', InputPillIpc.default);
    }

    return registry;
}

export function getDiscoveredApps(): string[] {
    return ['AthenaWidget', 'Byokwidget', 'InputPill'];
}

export function getAppType(appName: string): 'platform-ui-component' | 'application' | 'widget' {
    const platformUIComponents = ['AthenaWidget', 'Byokwidget', 'InputPill'];
    const widgets = [];
    
    if (platformUIComponents.includes(appName)) return 'platform-ui-component';
    if (widgets.includes(appName)) return 'widget';
    return 'application';
}

export function getAppPath(appName: string): string {
    const appPaths: Record<string, string> = {
        'AthenaWidget': 'platform/AthenaWidget',
        'Byokwidget': 'platform/Byokwidget',
        'InputPill': 'platform/InputPill'
    };
    return appPaths[appName] || `apps/${appName}`;
}
