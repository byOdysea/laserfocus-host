// Auto-generated file - do not edit manually
// This file is regenerated whenever the development server starts

import * as AthenaWidgetMain from '@ui/platform/AthenaWidget/athenawidget.main';
import * as AthenaWidgetIpc from '@ui/platform/AthenaWidget/athenawidget.ipc';
import * as InputPillMain from '@ui/platform/InputPill/inputpill.main';
import * as InputPillIpc from '@ui/platform/InputPill/inputpill.ipc';
import * as ByokwidgetMain from '@ui/platform/byokwidget/byokwidget.main';
import * as ByokwidgetIpc from '@ui/platform/byokwidget/byokwidget.ipc';
import * as NotesMain from '@ui/apps/notes/notes.main';
import * as NotesIpc from '@ui/apps/notes/notes.ipc';
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
    if (ByokwidgetMain) {
         for (const [key, value] of Object.entries(ByokwidgetMain)) {
             if (typeof value === 'function' && (key.includes('Window') || key.includes('Byokwidget'))) {
                 registry.mainClasses.set('Byokwidget', value);
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
                 registry.mainClasses.set('Reminders', value);
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
    if (ByokwidgetIpc.default) {
         registry.ipcModules.set('Byokwidget', ByokwidgetIpc.default);
    }
    if (NotesIpc.default) {
         registry.ipcModules.set('Notes', NotesIpc.default);
    }
    if (RemindersIpc.default) {
         registry.ipcModules.set('Reminders', RemindersIpc.default);
    }

    return registry;
}

export function getDiscoveredApps(): string[] {
    return ['AthenaWidget', 'InputPill', 'Byokwidget', 'Notes', 'Reminders'];
}

export function getAppType(appName: string): 'platform-ui-component' | 'application' | 'widget' {
    const platformUIComponents = ['AthenaWidget', 'InputPill', 'Byokwidget'];
    const widgets = [];
    
    if (platformUIComponents.includes(appName)) return 'platform-ui-component';
    if (widgets.includes(appName)) return 'widget';
    return 'application';
}

export function getAppPath(appName: string): string {
    const appPaths: Record<string, string> = {
        'AthenaWidget': 'platform/AthenaWidget',
        'InputPill': 'platform/InputPill',
        'Byokwidget': 'platform/byokwidget',
        'Notes': 'apps/notes',
        'Reminders': 'apps/reminders'
    };
    return appPaths[appName] || `apps/${appName}`;
}
