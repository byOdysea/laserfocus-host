const electronLog = require('electron-log');

// Configure electron-log
electronLog.transports.file.level = 'debug';   // Log debug and above to file
electronLog.transports.console.level = 'info';  // Log info and above to console
// Optional: Customize format if desired. Default is usually fine.
// electronLog.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{processType}] [{level}] {text}';

const MAX_LOG_CONTENT_LENGTH = 100;

// --- Internal Helper Functions for Formatting LangChain Objects ---
function getMessageContent(messageInstance) {
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

function formatIndividualContent(content) {
  let displayContent = typeof content === 'string' ? content : JSON.stringify(content);
  if (displayContent.length > MAX_LOG_CONTENT_LENGTH) {
    displayContent = displayContent.substring(0, MAX_LOG_CONTENT_LENGTH) + "...";
  }
  return displayContent.replace(/\n/g, ' ');
}

function formatSingleLangChainMessage(message) {
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
          toolCallsInfo = ` (Tool Calls: ${message.tool_calls.map(tc => tc.name).join(', ')})`;
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
        toolCallsInfo = ` (Tool Calls: ${actualMessage.tool_calls.map(tc => tc.name).join(', ')})`;
      }
    } else if (message.id.includes("ToolMessage")) {
      prefix = "[Tool]";
      contentStr = `ID ${actualMessage.tool_call_id || 'N/A'}: ${contentStr}`;
    }
  }
  if (prefix === "[Unknown]") return formatIndividualContent(JSON.stringify(message)); // Not a known LC, just format
  return `${prefix} ${formatIndividualContent(contentStr)}${toolCallsInfo}`;
}

function formatPotentiallyComplexObject(obj) {

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
function processArgs(args) {
  return args.map(arg => {
    if (typeof arg === 'string') return arg;
    if (Array.isArray(arg)) return arg.map(formatPotentiallyComplexObject).join('\n');
    return formatPotentiallyComplexObject(arg);
  }).join(' ');
}

// --- Exported Logger Functions ---
module.exports = {
  debug: (...args) => electronLog.debug(processArgs(args)),
  info: (...args) => electronLog.info(processArgs(args)),
  warn: (...args) => electronLog.warn(processArgs(args)),
  error: (...args) => electronLog.error(processArgs(args)),
  // Expose log for direct use if needed (e.g. for transports configuration)
  log: electronLog 
};
