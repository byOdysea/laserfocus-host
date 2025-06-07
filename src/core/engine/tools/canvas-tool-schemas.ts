// src/core/engine/tools/canvas-tool-schemas.ts
import { z } from 'zod';

export const openWindowSchema = z.object({
    url: z.string()
        .min(1, "URL cannot be empty")
        .describe("The URL to open in the new browser window (e.g., https://www.google.com)"),
    title: z.string()
        .optional()
        .describe("Optional title for the window"),
    x: z.number()
        .int("X coordinate must be an integer")
        .min(0, "X coordinate must be non-negative")
        .optional()
        .describe("X coordinate for the window's top-left corner in pixels"),
    y: z.number()
        .int("Y coordinate must be an integer") 
        .min(0, "Y coordinate must be non-negative")
        .optional()
        .describe("Y coordinate for the window's top-left corner in pixels"),
    width: z.number()
        .int("Width must be an integer")
        .min(100, "Width must be at least 100 pixels")
        .optional()
        .describe("Width of the window in pixels"),
    height: z.number()
        .int("Height must be an integer")
        .min(100, "Height must be at least 100 pixels")
        .optional()
        .describe("Height of the window in pixels")
});

export const closeWindowSchema = z.object({
    id: z.string()
        .min(1, "Window ID cannot be empty")
        .describe("The ID of the window to close (e.g., 'window-123')")
});

export const resizeAndMoveWindowSchema = z.object({
    windowId: z.string()
        .min(1, "Window ID cannot be empty")
        .describe("REQUIRED: The ID of the window to resize/move. Use the exact windowId parameter name. Example: windowId: 'window-123'"),
    x: z.number()
        .int("X coordinate must be an integer")
        .min(0, "X coordinate must be non-negative")
        .optional()
        .describe("New X coordinate for the window's top-left corner in pixels"),
    y: z.number()
        .int("Y coordinate must be an integer")
        .min(0, "Y coordinate must be non-negative")
        .optional()
        .describe("New Y coordinate for the window's top-left corner in pixels"),
    width: z.number()
        .int("Width must be an integer")
        .min(100, "Width must be at least 100 pixels")
        .optional()
        .describe("New width of the window in pixels"),
    height: z.number()
        .int("Height must be an integer")
        .min(100, "Height must be at least 100 pixels")
        .optional()
        .describe("New height of the window in pixels")
});

export const openAppSchema = z.object({
    appName: z.string()
        .min(1, "App name cannot be empty")
        .describe("The name of the internal application to open (e.g., 'Notes', 'Settings')"),
    title: z.string()
        .optional()
        .describe("Optional title for the window"),
    x: z.number()
        .int("X coordinate must be an integer")
        .min(0, "X coordinate must be non-negative")
        .optional()
        .describe("X coordinate for the window's top-left corner in pixels"),
    y: z.number()
        .int("Y coordinate must be an integer") 
        .min(0, "Y coordinate must be non-negative")
        .optional()
        .describe("Y coordinate for the window's top-left corner in pixels"),
    width: z.number()
        .int("Width must be an integer")
        .min(100, "Width must be at least 100 pixels")
        .optional()
        .describe("Width of the window in pixels"),
    height: z.number()
        .int("Height must be an integer")
        .min(100, "Height must be at least 100 pixels")
        .optional()
        .describe("Height of the window in pixels")
});