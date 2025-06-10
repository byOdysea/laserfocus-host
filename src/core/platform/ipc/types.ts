// src/core/bridge/types.ts
import { IpcMain } from 'electron';

// A map to hold main process instances of different apps, keyed by a unique app identifier.
// This is a placeholder for a more robust service location/dependency injection if needed.
export type AppMainProcessInstances = Map<string, any>;

export interface AppIpcModule {
    /**
     * A unique identifier for the app module, e.g., 'inputPill', 'athenaWidget'.
     */
    moduleId: string;

    /**
     * Registers IPC event handlers specific to this app module.
     * @param ipcMain - The Electron IpcMain instance to register handlers with.
     * @param appInstance - The main process instance of this specific app (e.g., InputPill instance).
     *                      This allows handlers to interact with their app's specific logic or windows.
     * @param allAppInstances - (Optional) A map of all other app instances, for more complex cross-app IPC.
     *                          Use with caution to avoid tight coupling; an event bus is often preferable.
     */
    registerMainProcessHandlers: (
        ipcMain: IpcMain,
        appInstance: any, // Type this more specifically if possible per app, or use a base class/interface
        allAppInstances?: AppMainProcessInstances
    ) => void;

    /**
     * Unregisters IPC event handlers specific to this app module.
     * This is crucial for cleanup when an app's window is closed to prevent memory leaks
     * and errors from lingering handlers.
     * @param ipcMain - The Electron IpcMain instance to unregister handlers from.
     * @param appInstance - The main process instance of this specific app.
     */
    unregisterMainProcessHandlers?: (
        ipcMain: IpcMain,
        appInstance: any
    ) => void;
}
