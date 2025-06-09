// Auto-generated file - do not edit manually
// This file is regenerated whenever the development server starts

import * as AthenaWidgetMain from '@ui/platform/AthenaWidget/athenawidget.main';
import * as AthenaWidgetIpc from '@ui/platform/AthenaWidget/athenawidget.ipc';
import * as ByokwidgetMain from '@ui/platform/Byokwidget/byokwidget.main';
import * as ByokwidgetIpc from '@ui/platform/Byokwidget/byokwidget.ipc';
import * as InputPillMain from '@ui/platform/InputPill/inputpill.main';
import * as InputPillIpc from '@ui/platform/InputPill/inputpill.ipc';
import * as NotesMain from '@ui/apps/notes/notes.main';
import * as NotesIpc from '@ui/apps/notes/notes.ipc';
import * as RemindersMain from '@ui/apps/reminders/reminders.main';
import * as RemindersIpc from '@ui/apps/reminders/reminders.ipc';
import * as SettingsMain from '@ui/apps/settings/settings.main';
import * as SettingsIpc from '@ui/apps/settings/settings.ipc';

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
    if (SettingsMain) {
         for (const [key, value] of Object.entries(SettingsMain)) {
             if (typeof value === 'function' && (key.includes('Window') || key.includes('Settings'))) {
                 registry.mainClasses.set('Settings', value);
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
    if (NotesIpc.default) {
         registry.ipcModules.set('Notes', NotesIpc.default);
    }
    if (RemindersIpc.default) {
         registry.ipcModules.set('Reminders', RemindersIpc.default);
    }
    if (SettingsIpc.default) {
         registry.ipcModules.set('Settings', SettingsIpc.default);
    }

    return registry;
}

export function getDiscoveredApps(): string[] {
    return ['AthenaWidget', 'Byokwidget', 'InputPill', 'Notes', 'Reminders', 'Settings'];
}

export function getAppType(appName: string): 'platform' | 'app' | 'widget' {
    const platformUIComponents = ['AthenaWidget', 'Byokwidget', 'InputPill'];
    const widgets: string[] = [];
    
    if (platformUIComponents.includes(appName)) return 'platform';
    if (widgets.includes(appName)) return 'widget';
    return 'app';
}

export function getAppPath(appName: string): string {
    const appPaths: Record<string, string> = {
        'AthenaWidget': 'platform/AthenaWidget',
        'Byokwidget': 'platform/Byokwidget',
        'InputPill': 'platform/InputPill',
        'Notes': 'apps/notes',
        'Reminders': 'apps/reminders',
        'Settings': 'apps/settings'
    };
    return appPaths[appName] || `apps/${appName}`;
}
