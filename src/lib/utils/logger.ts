import { VALIDATION } from '@/core/infrastructure/config/ui-constants';
import log from 'electron-log';
import chalk from 'chalk';

// Color scheme for different log levels and components
const colors = {
  // Log levels
  error: chalk.red.bold,
  warn: chalk.yellow.bold,
  info: chalk.blue,
  debug: chalk.gray,
  
  // Module prefixes
  main: chalk.magenta.bold,
  agent: chalk.green.bold,
  canvas: chalk.cyan.bold,
  ui: chalk.blue.bold,
  config: chalk.yellow.bold,
  ipc: chalk.magentaBright.bold,
  window: chalk.yellowBright.bold,
  
  // Special highlights
  success: chalk.green.bold,
  highlight: chalk.white.bold,
  dim: chalk.gray,
  
  // Status indicators
  ready: chalk.green,
  loading: chalk.yellow,
  failed: chalk.red,
  
  // Data highlighting
  value: chalk.cyan,
  count: chalk.magenta,
  path: chalk.blue,
  url: chalk.underline.blue,
};

// Enhanced color formatter for module names
function colorizeModuleName(name: string): string {
  const cleanName = name.replace(/[\[\]]/g, '').toLowerCase();
  
  // Match specific module types
  if (cleanName.includes('main')) return colors.main(name);
  if (cleanName.includes('agent') || cleanName.includes('athena')) return colors.agent(name);
  if (cleanName.includes('canvas')) return colors.canvas(name);
  if (cleanName.includes('ui') || cleanName.includes('widget')) return colors.ui(name);
  if (cleanName.includes('config')) return colors.config(name);
  if (cleanName.includes('ipc') || cleanName.includes('bridge')) return colors.ipc(name);
  if (cleanName.includes('window')) return colors.window(name);
  
  // Default to highlight color
  return colors.highlight(name);
}

// Enhanced message formatter with context-aware coloring
function enhanceMessage(message: string, level: 'error' | 'warn' | 'info' | 'debug'): string {
  let enhanced = message;
  
  // Color code specific patterns
  enhanced = enhanced.replace(/\b(ready|initialized|success|complete|loaded)\b/gi, (match) => colors.success(match));
  enhanced = enhanced.replace(/\b(loading|initializing|starting)\b/gi, (match) => colors.loading(match));
  enhanced = enhanced.replace(/\b(error|failed|failure|exception)\b/gi, (match) => colors.failed(match));
  
  // Color code numbers and counts
  enhanced = enhanced.replace(/\b(\d+)\b/g, (match) => colors.count(match));
  
  // Color code file paths
  enhanced = enhanced.replace(/\b[a-zA-Z0-9_-]+\.(ts|js|json|html|css|tsx|jsx)\b/g, (match) => colors.path(match));
  
  // Color code URLs
  enhanced = enhanced.replace(/https?:\/\/[^\s]+/g, (match) => colors.url(match));
  
  // Color code values in quotes
  enhanced = enhanced.replace(/"([^"]+)"/g, (match, value) => `"${colors.value(value)}"`);
  
  return enhanced;
}

// Environment-aware logging configuration
const IS_DEV = process.env.NODE_ENV === 'development';
const IS_TEST = process.env.NODE_ENV === 'test';

// Default log levels based on environment
const getDefaultLogLevel = () => {
  if (IS_TEST) return 'error'; // Minimal logging during tests
  if (IS_DEV) return 'debug';  // Verbose logging in development
  return 'info';               // Standard logging in production
};

// Configure electron-log with environment awareness
const defaultLevel = getDefaultLogLevel();

// Initialize electron-log transports if they don't exist
if (!log.transports.file) {
  log.transports.file = log.transports.file || {};
  log.transports.file.level = IS_DEV ? 'debug' : 'info';
  log.transports.file.format = IS_DEV ? '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}' : '[{h}:{i}:{s}] {text}';
  log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
}

if (!log.transports.console) {
  log.transports.console = log.transports.console || {};
  log.transports.console.level = defaultLevel;
  log.transports.console.format = IS_DEV ? '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}' : '[{h}:{i}:{s}] {text}';
  log.transports.console.useStyles = true;
}

// Set log levels
log.transports.file.level = IS_DEV ? 'debug' : 'info';     // Always log debug to file in dev
log.transports.console.level = defaultLevel;               // Environment-aware console logging

// Optimize format for production performance
if (IS_DEV) {
  log.transports.console.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
} else {
  // Simpler format in production for performance
  log.transports.console.format = '[{h}:{i}:{s}] {text}';
}

/**
 * Update logging levels dynamically (e.g., from system configuration)
 */
export function updateLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
  if (log.transports.console) {
    log.transports.console.level = level;
  }
  if (log.transports.file) {
    // Always keep file logging at debug level for troubleshooting, except in error-only mode
    log.transports.file.level = level === 'error' ? 'error' : 'debug';
  }
  
  info(`[Logger] Log level updated to: console=${level}, file=${log.transports.file?.level}`);
}

/**
 * Get current logging configuration
 */
export function getLogConfig(): { console: string; file: string; environment: string } {
  return {
    console: log.transports.console?.level as string || 'info',
    file: log.transports.file?.level as string || 'info',
    environment: process.env.NODE_ENV || 'unknown'
  };
}

/**
 * Initialize logger with configuration system integration
 * Should be called after configuration is loaded
 */
export function initializeWithConfig(): void {
  try {
    // For bundled environment, the configuration manager should be available directly
    // We'll skip the config integration for now to avoid import issues in bundled code
    info(`[Logger] Initialized - Environment: ${process.env.NODE_ENV || 'unknown'}`);
  } catch (error) {
    // Fallback gracefully if config system isn't available
    warn(`[Logger] Could not integrate with config system:`, error);
  }
}

// --- Internal Helper Functions for Formatting LangChain Objects ---
function getMessageContent(messageInstance: any): string {
  if (typeof messageInstance.content === 'string') {
    return messageInstance.content;
  }
  if (Array.isArray(messageInstance.content) && messageInstance.content.length > 0 && typeof messageInstance.content[0] === 'string') {
    return messageInstance.content.join(' ');
  }
  if (typeof messageInstance.content === 'object' && messageInstance.content !== null && typeof messageInstance.content.text === 'string') {
    return messageInstance.content.text;
  }
  return JSON.stringify(messageInstance.content);
}

function formatIndividualContent(content: any): string {
  let displayContent = typeof content === 'string' ? content : JSON.stringify(content);
  if (displayContent.length > VALIDATION.MAX_LOG_CONTENT_LENGTH) {
    displayContent = displayContent.substring(0, VALIDATION.MAX_LOG_CONTENT_LENGTH) + "...";
  }
  return displayContent.replace(/\n/g, ' ');
}

function formatSingleLangChainMessage(message: any): string {
  if (!message) return "[Invalid Message]";
  let prefix = "[Unknown]";
  let contentStr = "";
  let toolCallsInfo = "";

  if (message.constructor && message.constructor.name) {
    const constructorName = message.constructor.name;
    switch (constructorName) {
      case 'HumanMessage':
        prefix = "[Human]";
        contentStr = getMessageContent(message);
        break;
      case 'AIMessage':
        prefix = "[AI]";
        contentStr = getMessageContent(message);
        if (message.tool_calls && message.tool_calls.length > 0) {
          toolCallsInfo = ` (Tool Calls: ${message.tool_calls.map((tc: any) => tc.name).join(', ')})`;
        }
        break;
      case 'ToolMessage':
        prefix = "[Tool]";
        contentStr = `ID ${message.tool_call_id}: ${getMessageContent(message)}`;
        break;
      default: break; 
    }
  }

  if (prefix === "[Unknown]" && message.lc === 1 && message.kwargs && message.id) {
    const actualMessage = message.kwargs;
    contentStr = getMessageContent(actualMessage);
    if (message.id.includes("HumanMessage")) prefix = "[Human]";
    else if (message.id.includes("AIMessage")) {
      prefix = "[AI]";
      if (actualMessage.tool_calls && actualMessage.tool_calls.length > 0) {
        toolCallsInfo = ` (Tool Calls: ${actualMessage.tool_calls.map((tc: any) => tc.name).join(', ')})`;
      }
    } else if (message.id.includes("ToolMessage")) {
      prefix = "[Tool]";
      contentStr = `ID ${actualMessage.tool_call_id || 'N/A'}: ${contentStr}`;
    }
  }
  if (prefix === "[Unknown]") return formatIndividualContent(JSON.stringify(message)); // Not a known LC, just format
  return `${prefix} ${formatIndividualContent(contentStr)}${toolCallsInfo}`;
}

function formatPotentiallyComplexObject(obj: any): string {
  if (obj && ( (obj.constructor && ['HumanMessage', 'AIMessage', 'ToolMessage'].includes(obj.constructor.name)) || (obj.lc === 1 && obj.kwargs && obj.id) )) {
    return formatSingleLangChainMessage(obj);
  }
  if (obj instanceof Error) {
    return `${obj.name}: ${obj.message}\n${obj.stack ? formatIndividualContent(obj.stack) : ''}`;
  }
  if (typeof obj === 'object') {
    return formatIndividualContent(JSON.stringify(obj));
  }
  return formatIndividualContent(String(obj));
}

// --- Log Processing Function ---
function processArgs(args: any[]): string {
  return args.map(arg => {
    if (typeof arg === 'string') return arg;
    if (Array.isArray(arg)) return arg.map(formatPotentiallyComplexObject).join('\n');
    return formatPotentiallyComplexObject(arg);
  }).join(' ');
}

// Export the main log object and potentially the helper if needed elsewhere (though unlikely)
export const { error, warn, info, verbose, debug, silly } = log;

// Overwrite methods to use processArgs for formatting with colors
log.error = (...args: any[]) => {
  const message = processArgs(args);
  const enhanced = enhanceMessage(message, 'error');
  log.functions.error(colors.error('ERROR:') + ' ' + enhanced);
};

log.warn = (...args: any[]) => {
  const message = processArgs(args);
  const enhanced = enhanceMessage(message, 'warn');
  log.functions.warn(colors.warn('WARN:') + ' ' + enhanced);
};

log.info = (...args: any[]) => {
  const message = processArgs(args);
  const enhanced = enhanceMessage(message, 'info');
  log.functions.info(colors.info('INFO:') + ' ' + enhanced);
};

log.verbose = (...args: any[]) => {
  const message = processArgs(args);
  const enhanced = enhanceMessage(message, 'info');
  log.functions.verbose(colors.info('VERBOSE:') + ' ' + enhanced);
};

log.debug = (...args: any[]) => {
  const message = processArgs(args);
  const enhanced = enhanceMessage(message, 'debug');
  log.functions.debug(colors.debug('DEBUG:') + ' ' + enhanced);
};

log.silly = (...args: any[]) => {
  const message = processArgs(args);
  const enhanced = enhanceMessage(message, 'debug');
  log.functions.silly(colors.dim('SILLY:') + ' ' + enhanced);
};

/**
 * Creates a new logger instance with a specific module name prefix.
 * This is the preferred way to log from within modules to ensure consistency.
 * @param name - The name of the module (e.g., '[CanvasEngine]')
 * @returns A logger object with info, warn, error, and debug methods.
 */
export function createLogger(name: string) {
  const colorizedPrefix = `${colorizeModuleName(name)} `;
  
  return {
    error: (...args: any[]) => {
      const message = processArgs(args);
      const enhanced = enhanceMessage(message, 'error');
      log.functions.error(colorizedPrefix + colors.error('ERROR:') + ' ' + enhanced);
    },
    warn: (...args: any[]) => {
      const message = processArgs(args);
      const enhanced = enhanceMessage(message, 'warn');
      log.functions.warn(colorizedPrefix + colors.warn('WARN:') + ' ' + enhanced);
    },
    info: (...args: any[]) => {
      const message = processArgs(args);
      const enhanced = enhanceMessage(message, 'info');
      log.functions.info(colorizedPrefix + colors.info('INFO:') + ' ' + enhanced);
    },
    debug: (...args: any[]) => {
      const message = processArgs(args);
      const enhanced = enhanceMessage(message, 'debug');
      log.functions.debug(colorizedPrefix + colors.debug('DEBUG:') + ' ' + enhanced);
    },
  };
}

// Default export for convenience if only one thing is typically imported
export default log;
