// Auto-generated file - do not edit manually
// This file is regenerated whenever the development server starts

import * as AthenaWidgetMain from '@ui/platform/AthenaWidget/athenawidget.main';
import * as AthenaWidgetIpc from '@ui/platform/AthenaWidget/athenawidget.ipc';
import * as InputPillMain from '@ui/platform/InputPill/inputpill.main';
import * as InputPillIpc from '@ui/platform/InputPill/inputpill.ipc';
import * as notesMain from '@ui/apps/notes/notes.main';
import * as notesIpc from '@ui/apps/notes/notes.ipc';
import * as remindersMain from '@ui/apps/reminders/reminders.main';
import * as remindersIpc from '@ui/apps/reminders/reminders.ipc';

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
    if (notesMain) {
         for (const [key, value] of Object.entries(notesMain)) {
             if (typeof value === 'function' && (key.includes('Window') || key.includes('notes'))) {
                 registry.mainClasses.set('notes', value);
                break;
            }
        }
    }
    if (remindersMain) {
         for (const [key, value] of Object.entries(remindersMain)) {
             if (typeof value === 'function' && (key.includes('Window') || key.includes('reminders'))) {
                 registry.mainClasses.set('reminders', value);
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
    if (notesIpc.default) {
         registry.ipcModules.set('notes', notesIpc.default);
    }
    if (remindersIpc.default) {
         registry.ipcModules.set('reminders', remindersIpc.default);
    }

    return registry;
}

export function getDiscoveredApps(): string[] {
    return ['AthenaWidget', 'InputPill', 'notes', 'reminders'];
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
        'notes': 'apps/notes',
        'reminders': 'apps/reminders'
    };
    return appPaths[appName] || `apps/${appName}`;
}
