import { VALIDATION } from '@/core/infrastructure/config/ui-constants';
import log from 'electron-log';

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

// Overwrite methods to use processArgs for formatting
log.error = (...args: any[]) => log.functions.error(processArgs(args));
log.warn = (...args: any[]) => log.functions.warn(processArgs(args));
log.info = (...args: any[]) => log.functions.info(processArgs(args));
log.verbose = (...args: any[]) => log.functions.verbose(processArgs(args));
log.debug = (...args: any[]) => log.functions.debug(processArgs(args));
log.silly = (...args: any[]) => log.functions.silly(processArgs(args));

/**
 * Creates a new logger instance with a specific module name prefix.
 * This is the preferred way to log from within modules to ensure consistency.
 * @param name - The name of the module (e.g., '[CanvasEngine]')
 * @returns A logger object with info, warn, error, and debug methods.
 */
export function createLogger(name: string) {
  const prefix = `${name} `;
  return {
    error: (...args: any[]) => log.functions.error(prefix + processArgs(args)),
    warn: (...args: any[]) => log.functions.warn(prefix + processArgs(args)),
    info: (...args: any[]) => log.functions.info(prefix + processArgs(args)),
    debug: (...args: any[]) => log.functions.debug(prefix + processArgs(args)),
  };
}

// Default export for convenience if only one thing is typically imported
export default log;
