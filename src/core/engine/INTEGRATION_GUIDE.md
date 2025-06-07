# Canvas Engine V2 Integration Guide

## Architecture Overview

The LaserFocus application follows a modular architecture with clear separation of concerns:

```
src/
├── apps/           # UI components (InputPill, AthenaWidget)
├── core/           # Core business logic
│   ├── bridge/     # IPC communication system
│   ├── config/     # Application configuration
│   └── engine/     # Canvas Engine (V1 & V2)
├── utils/          # Shared utilities (logger)
└── types/          # TypeScript definitions
```

## Canvas Engine V2 Design Alignment

### ✅ **Follows Existing Patterns**

1. **Service Layer Pattern**: Initialized via `engine.service.ts` singleton pattern
2. **Modular Architecture**: V2 engine integrates with existing IPC bridge system
3. **Type Safety**: Proper TypeScript interfaces and union types for V1/V2 compatibility
4. **Logging**: Uses the same logger instance and formatting patterns
5. **Configuration**: Respects existing config patterns from `app-config.ts`
6. **Error Handling**: Consistent error handling and propagation

### ✅ **Backwards Compatibility**

The integration provides seamless backwards compatibility:

- **Auto-Selection**: `initializeCanvasEngineAuto()` chooses V1 or V2 based on environment
- **Type Union**: `AnyCanvasEngine` type supports both versions
- **IPC Bridge**: Handles both engine versions with appropriate handlers
- **Graceful Migration**: V2 enabled in development, V1 for production stability

## Quick Start

### 1. Automatic Initialization (Recommended)

```typescript
import { initializeCanvasEngineAuto } from './core/engine/engine.service';

// Auto-selects V2 in development, V1 in production
const engine = initializeCanvasEngineAuto(inputPillWindow, athenaWidgetWindow);
```

### 2. Explicit Version Selection

```typescript
// Force V2 usage
process.env.USE_CANVAS_ENGINE_V2 = 'true';
const engine = initializeCanvasEngineAuto(inputPillWindow, athenaWidgetWindow);

// Or direct initialization
import { initializeCanvasEngineV2 } from './core/engine/engine.service';
const engineV2 = initializeCanvasEngineV2(inputPillWindow, athenaWidgetWindow);
```

### 3. Check Current Engine Version

```typescript
import { getCurrentEngineVersion, getCurrentEngineInstance } from './core/engine/engine.service';

console.log(`Using Canvas Engine ${getCurrentEngineVersion()}`); // 'V1', 'V2', or 'None'
const engine = getCurrentEngineInstance();
```

## IPC Integration

The Canvas Engine V2 integrates seamlessly with the existing IPC bridge:

### Modern Handler (V2)
```typescript
// Automatically registered for V2 engines
ipcMain.on('run-agent', async (event, query: string) => {
    const result = await canvasEngineV2.invoke(query);
    // Proper structured tool execution
    // Enhanced error handling
    // Better response formatting
});
```

### Legacy Handler (V1)
```typescript
// Backwards compatible for V1 engines
// Uses existing main-handlers.ts pattern
registerMainProcessEventHandlers(canvasEngineV1, inputPill, athenaWidget);
```

## Environment Configuration

### Development (V2 Default)
```bash
NODE_ENV=development
# V2 enabled by default
```

### Production (V1 Default)
```bash
NODE_ENV=production
USE_CANVAS_ENGINE_V2=true  # Explicitly enable V2 if desired
```

## Key Improvements in V2

### 🔧 **Fixed Tool Calling**
- **Before**: Text-based tool parsing with complex JSON extraction
- **After**: Proper structured tool calls with ToolNode integration

### 📁 **Modular Prompts**  
- **Before**: 500+ line inline prompts
- **After**: Separated prompt files with template variables

### 🏗️ **Modern Architecture**
- **Before**: Monolithic class with mixed concerns  
- **After**: Clean OOP design with proper separation of concerns

### 🎯 **Enhanced Canvas State**
- **Before**: Basic x,y,width,height reporting
- **After**: Rich state representation optimized for LLM understanding

## Migration Path

### Phase 1: Development Testing
- V2 runs by default in development
- Existing production unchanged (V1)
- Test V2 features and stability

### Phase 2: Selective Production
- Enable V2 in production via environment variable
- Monitor performance and stability
- Gradual rollout to users

### Phase 3: Full Migration
- V2 becomes default in production
- V1 maintained for backwards compatibility
- Eventually deprecate V1

## Monitoring & Debugging

### Check Engine Status
```typescript
import { getCurrentEngineVersion } from './core/engine/engine.service';
logger.info(`Current engine: ${getCurrentEngineVersion()}`);
```

### Canvas State Monitoring
```typescript
// V2 only - enhanced state representation
const canvasState = engineV2.getCanvasState();
console.log('Current windows:', canvasState.windows);
```

### Tool Execution Logs
```typescript
// V2 provides better tool execution logging
// Check logs for structured tool calls vs text parsing
```

## Best Practices

1. **Use Auto-Initialization**: Let the system choose the appropriate engine version
2. **Environment-Based Testing**: Test V2 in development before production use
3. **Monitor Logs**: V2 provides better logging for tool execution and state changes
4. **Gradual Migration**: Move to V2 incrementally, starting with development environments
5. **Type Safety**: Use `AnyCanvasEngine` type for functions that support both versions

## Troubleshooting

### V2 Not Loading
- Check `USE_CANVAS_ENGINE_V2` environment variable
- Verify `NODE_ENV` setting
- Check logs for initialization errors

### Tool Calls Not Working  
- V2: Verify structured tool calls in logs
- V1: Check JSON parsing in legacy handler
- Compare behavior between engine versions

### State Sync Issues
- V2: Enhanced state representation should reduce confusion
- V1: Legacy state format may need manual interpretation
- Use canvas state monitoring utilities

## API Reference

### CanvasEngineV2 Class

#### Constructor
```typescript
constructor(
    apiKey: string | undefined,
    modelName: string,
    externalTools: StructuredTool[] = [],
    inputPillWindow?: BrowserWindow,
    athenaWidgetWindow?: BrowserWindow
)
```

#### Methods

**`invoke(userInput: string, config?: { recursionLimit?: number }): Promise<MessagesAnnotation.State>`**
- Process a user request and return the conversation state
- Handles tool calling automatically
- Returns complete message history for the session

**`getCanvasState(): Readonly<CanvasState>`**
- Get current window state (read-only)
- Includes all open windows with positioning

**`getMessages(): ReadonlyArray<BaseMessage>`**
- Get conversation history (read-only)
- Useful for debugging and context tracking

**`clearHistory(): void`**
- Clear conversation history
- Useful for starting fresh sessions

## Tool Capabilities

### Available Tools

1. **open_browser_window**
   - Opens new browser windows
   - Supports custom positioning and sizing
   - Automatic layout management

2. **close_browser_window**
   - Closes windows by ID
   - Automatic state cleanup

3. **resize_and_move_window**
   - Resize and/or move existing windows
   - Supports partial updates (e.g., only width)

### Tool Schemas

All tools use strict Zod validation:

```typescript
// Example: Opening a window
{
    url: "https://google.com",     // Required: Valid URL
    x: 100,                       // Optional: X coordinate (integer >= 0)
    y: 50,                        // Optional: Y coordinate (integer >= 0) 
    width: 800,                   // Optional: Width (integer >= 100)
    height: 600,                  // Optional: Height (integer >= 100)
    title: "Google"               // Optional: Window title
}
```

## Layout System

### Automatic Layout Management

The engine automatically handles:
- **Single Window**: Full available width, optimized positioning
- **Multiple Windows**: Horizontal tiling with equal spacing
- **UI Avoidance**: Respects InputPill and AthenaWidget boundaries
- **Size Validation**: Ensures windows remain usable

### Configuration

Layout parameters can be customized:

```typescript
// In canvas-engine-v2.ts, modify layoutConfig:
private readonly layoutConfig: LayoutConfig = {
    screenEdgePadding: 10,    // Padding from screen edges
    windowGap: 10,            // Gap between tiled windows
    menuBarHeight: 40,        // Space for system menu bar
    minWindowWidth: 300       // Minimum usable window width
};
```

## Error Handling

### Common Errors and Solutions

1. **"Window ID not found"**
   - Window was closed manually or doesn't exist
   - Check `getCanvasState()` for valid window IDs

2. **"At least one geometry parameter required"**
   - `resize_and_move_window` needs x, y, width, or height
   - Ensure at least one parameter is provided

3. **"Invalid URL"**
   - URL must be valid (include protocol)
   - Use full URLs: `https://google.com` not `google.com`

### Debugging

Enable detailed logging:

```typescript
import logger from '../../utils/logger';

// Check logs for detailed tool execution info
logger.info('Canvas state:', engine.getCanvasState());
```

## Integration Examples

### Basic Window Management

```typescript
// Open a window
await engine.invoke("open https://github.com");

// Resize it
await engine.invoke("resize the github window to 600x400");

// Close it  
await engine.invoke("close all windows");
```

### Advanced Layout

```typescript
// Open multiple windows with automatic tiling
await engine.invoke("open google.com");
await engine.invoke("open github.com");
await engine.invoke("open stackoverflow.com");

// The engine automatically tiles them horizontally
```

### State Management

```typescript
// Monitor window changes
const initialState = engine.getCanvasState();
await engine.invoke("open reddit.com");
const newState = engine.getCanvasState();

console.log(`Windows increased from ${initialState.windows.length} to ${newState.windows.length}`);
```

## Testing

Use the provided test file:

```bash
# Run integration tests
npm run test:canvas-engine

# Or import in your own tests
import { testCanvasEngine } from './canvas-engine-test';
await testCanvasEngine();
```

## Migration from V1

### Key Differences

1. **Tool Execution**: V2 actually executes tools, V1 often failed
2. **State Management**: V2 uses MessagesAnnotation for better LangGraph integration
3. **Prompt System**: V2 uses external files, easier to customize
4. **Error Handling**: V2 has robust validation and clear error messages

### Migration Steps

1. Replace `initializeCanvasEngine()` with `initializeCanvasEngineV2()`
2. Update any direct CanvasEngine imports to CanvasEngineV2
3. Test thoroughly with your existing use cases
4. Remove legacy engine usage when confident

### Backwards Compatibility

Both engines can run side-by-side during transition:

```typescript
// Legacy
const oldEngine = initializeCanvasEngine();

// New
const newEngine = initializeCanvasEngineV2();
```

## Troubleshooting

### Tool Calls Not Executing

**Symptoms**: LLM responds but no windows open/close
**Solution**: Ensure using CanvasEngineV2, not legacy CanvasEngine

### Windows Overlap UI Elements

**Symptoms**: Windows cover InputPill or AthenaWidget
**Solution**: Verify UI component windows are passed to constructor

### Poor Layout Decisions

**Symptoms**: Windows positioned poorly
**Solution**: Check prompt files and layout parameters

### API Key Issues

**Symptoms**: Engine fails to initialize
**Solution**: Set `GOOGLE_API_KEY` environment variable

For additional support, check the logs and the IMPROVEMENTS.md file for detailed technical information. 