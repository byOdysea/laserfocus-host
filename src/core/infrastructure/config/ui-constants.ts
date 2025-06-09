/**
 * UI Constants - Single source of truth for all UI dimensions and magic numbers
 * No more hardcoded values scattered throughout the codebase!
 */

// Window Dimensions
export const WINDOW_DEFAULTS = {
  WIDTH: 800,
  HEIGHT: 600,
  MIN_WIDTH: 400,
  MIN_HEIGHT: 300,
} as const;

// Layout Constants
export const LAYOUT = {
  DEFAULT_X: 20,
  DEFAULT_Y: 60,
  WINDOW_GAP: 10,
  MIN_WINDOW_WIDTH: 300,
  SCREEN_EDGE_PADDING: 20,
  MENU_BAR_HEIGHT: 40,
} as const;

// Input Pill Constants
export const INPUT_PILL = {
  WIDTH: 700,
  HEIGHT: 60,
  Y_OFFSET_FROM_BOTTOM: 60,
} as const;

// Athena Widget Constants
export const ATHENA_WIDGET = {
  WIDTH: 350,
  HEIGHT: 250,
  RIGHT_MARGIN: 20,
  TOP_MARGIN: 20,
} as const;

// Byok Widget Constants
export const BYOK_WIDGET = {
  WIDTH: 350,
  HEIGHT: 125,
  GAP_BELOW_ATHENA: 10,
} as const;

// Development Server
export const DEV_SERVER = {
  DEFAULT_PORT: 5173,
  DEFAULT_URL: 'http://localhost:5173',
} as const;

// Timing Constants
export const TIMING = {
  API_KEY_TEST_DEBOUNCE: 500,
  OPERATION_HISTORY_MAX: 100,
} as const;

// Validation Constants
export const VALIDATION = {
  MAX_LOG_CONTENT_LENGTH: 100, // Match current logger behavior
} as const; 