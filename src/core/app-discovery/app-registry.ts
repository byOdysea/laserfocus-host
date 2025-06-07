// Auto-generated file - do not edit manually
// This file is regenerated whenever the development server starts

import * as AthenaWidgetMain from '@ui/platform/AthenaWidget/athenawidget.main';
import * as AthenaWidgetIpc from '@ui/platform/AthenaWidget/athenawidget.ipc';
import * as InputPillMain from '@ui/platform/InputPill/inputpill.main';
import * as InputPillIpc from '@ui/platform/InputPill/inputpill.ipc';
import * as NotesMain from '@ui/apps/Notes/notes.main';
import * as NotesIpc from '@ui/apps/Notes/notes.ipc';

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
    if (InputPillMain) {
         for (const [key, value] of Object.entries(InputPillMain)) {
             if (typeof value === 'function' && (key.includes('Window') || key.includes('InputPill'))) {
                 registry.mainClasses.set('InputPill', value);
                 break;
             }
         }
     }
    if (NotesMain) {
         for (const [key, value] of Object.entries(NotesMain)) {
             if (typeof value === 'function' && (key.includes('Window') || key.includes('Notes'))) {
                 registry.mainClasses.set('Notes', value);
                 break;
             }
         }
     }
    if (AthenaWidgetIpc.default) {
         registry.ipcModules.set('AthenaWidget', AthenaWidgetIpc.default);
     }
    if (InputPillIpc.default) {
         registry.ipcModules.set('InputPill', InputPillIpc.default);
     }
    if (NotesIpc.default) {
         registry.ipcModules.set('Notes', NotesIpc.default);
     }

    return registry;
}

export function getDiscoveredApps(): string[] {
    return ['AthenaWidget', 'InputPill', 'Notes'];
}

export function getAppType(appName: string): 'platform-ui-component' | 'application' | 'widget' {
    const platformUIComponents = ['AthenaWidget', 'InputPill'];
    const widgets = [];
    
    if (platformUIComponents.includes(appName)) return 'platform-ui-component';
    if (widgets.includes(appName)) return 'widget';
    return 'application';
}

export function getAppPath(appName: string): string {
    const appPaths: Record<string, string> = {
        'AthenaWidget': 'platform/AthenaWidget',
        'InputPill': 'platform/InputPill',
        'Notes': 'apps/Notes'
    };
    return appPaths[appName] || `apps/${appName}`;
}
