// Auto-generated file - do not edit manually
// This file is regenerated whenever the development server starts

import * as AthenawidgetMain from '@ui/platform/AthenaWidget/athenawidget.main';
import * as AthenawidgetIpc from '@ui/platform/AthenaWidget/athenawidget.ipc';
import * as InputpillMain from '@ui/platform/InputPill/inputpill.main';
import * as InputpillIpc from '@ui/platform/InputPill/inputpill.ipc';
import * as NotesMain from '@ui/apps/Notes/notes.main';
import * as NotesIpc from '@ui/apps/Notes/notes.ipc';
import * as RemindersMain from '@ui/apps/reminders/reminders.main';
import * as RemindersIpc from '@ui/apps/reminders/reminders.ipc';

export interface AppRegistry {
    mainClasses: Map<string, any>;
    ipcModules: Map<string, any>;
}

export function createAppRegistry(): AppRegistry {
    const registry: AppRegistry = {
        mainClasses: new Map(),
        ipcModules: new Map(),
    };

    if (AthenawidgetMain) {
         for (const [key, value] of Object.entries(AthenawidgetMain)) {
             if (typeof value === 'function' && (key.includes('Window') || key.includes('Athenawidget'))) {
                 registry.mainClasses.set('AthenaWidget', value);
                break;
            }
        }
    }
    if (InputpillMain) {
         for (const [key, value] of Object.entries(InputpillMain)) {
             if (typeof value === 'function' && (key.includes('Window') || key.includes('Inputpill'))) {
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
    if (RemindersMain) {
         for (const [key, value] of Object.entries(RemindersMain)) {
             if (typeof value === 'function' && (key.includes('Window') || key.includes('Reminders'))) {
                 registry.mainClasses.set('reminders', value);
                break;
            }
        }
    }
    if (AthenawidgetIpc.default) {
         registry.ipcModules.set('AthenaWidget', AthenawidgetIpc.default);
    }
    if (InputpillIpc.default) {
         registry.ipcModules.set('InputPill', InputpillIpc.default);
    }
    if (NotesIpc.default) {
         registry.ipcModules.set('Notes', NotesIpc.default);
    }
    if (RemindersIpc.default) {
         registry.ipcModules.set('reminders', RemindersIpc.default);
    }

    return registry;
}

export function getDiscoveredApps(): string[] {
    return ['AthenaWidget', 'InputPill', 'Notes', 'reminders'];
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
        'Notes': 'apps/Notes',
        'reminders': 'apps/reminders'
    };
    return appPaths[appName] || `apps/${appName}`;
}
