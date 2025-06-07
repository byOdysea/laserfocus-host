// src/core/engine/tools/canvas-tool-schemas.ts
import { z } from 'zod';

export const openWindowSchema = z.object({
    url: z.string().describe("The URL to open in the new browser window. Must be a valid URL string (e.g., https://www.example.com)."),
    title: z.string().optional().describe("Optional title for the new window."),
    x: z.number().optional().describe("Optional x coordinate for the window position."),
    y: z.number().optional().describe("Optional y coordinate for the window position."),
    width: z.number().optional().describe("Optional width for the window."),
    height: z.number().optional().describe("Optional height for the window."),
});

export const closeWindowSchema = z.object({
    id: z.string().describe("The ID of the browser window to close."),
});

export const resizeAndMoveWindowSchema = z.object({
    windowId: z.string().describe("The ID of the window to resize/move."),
    x: z.number().optional().describe("The new x coordinate for the window's top-left corner."),
    y: z.number().optional().describe("The new y coordinate for the window's top-left corner."),
    width: z.number().optional().describe("The new width for the window."),
    height: z.number().optional().describe("The new height for the window.")
});
/*
}).refine(args => args.x !== undefined || args.y !== undefined || args.width !== undefined || args.height !== undefined, {
    message: "At least one geometry parameter (x, y, width, height) must be provided."
});
*/