// src/config/app-config.ts
export const APP_NAME = "Laserfocus";
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

export const DEFAULT_MODEL_NAME = 'gemini-1.5-flash-latest';

// It's good practice to also export a way to check if in development
export const IS_DEV = process.env.NODE_ENV === 'development' || VITE_DEV_SERVER_URL !== undefined;
