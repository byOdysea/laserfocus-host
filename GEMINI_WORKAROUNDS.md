# Gemini Workarounds Documentation

⚠️ **THIS FILE DOCUMENTS TECHNICAL DEBT** ⚠️

## Overview

The current LaserFocus Canvas Engine implementation contains significant hardcoded workarounds specifically for Google Gemini's poor schema adherence and tool execution issues. **These workarounds are temporary hacks** that should be completely removed when migrating to better LLM providers.

## Core Problem

Google Gemini consistently **ignores schema definitions** and sends malformed tool arguments, causing the standard LangChain tool execution pipeline to fail. This forces us to implement custom parameter parsing and intelligent fallbacks.

## Specific Issues with Gemini

### 1. Schema Parameter Name Violations
- **Expected**: `{"windowId": "window-3", "width": 530, ...}`
- **Gemini sends**: `{"input": "window-3", "width": 530, ...}`
- **Result**: Zod schema validation strips the invalid "input" field

### 2. Unpredictable Argument Formats
- Sometimes receives proper objects: `{windowId: "window-3", width: 530}`
- Sometimes receives just strings: `"window-3"` (after Zod filtering)
- LangChain's ToolNode can't handle this inconsistency

### 3. Parameter Loss Due to Filtering
- When Gemini uses wrong parameter names, Zod removes them
- Critical layout parameters (x, y, width, height) get lost
- Tool execution fails due to missing required parameters

### 4. Poor Multi-Step Planning
- Gemini doesn't maintain context between tool calls
- Inconsistent window arrangement strategies
- Requires intelligent fallbacks to maintain user intent

## Current Workarounds (TO BE REMOVED)

### File: `src/core/engine/canvas-engine.ts`

#### 1. Parameter Name Auto-Fixing
```typescript
// GEMINI-SPECIFIC FIX: Handle schema violations
const windowId = args.windowId || rawArgs.input || rawArgs.id;
```
**Purpose**: Map Gemini's incorrect parameter names to correct ones
**Remove when**: Switching to OpenAI/Claude (they respect schemas)

#### 2. String Argument Handling
```typescript
if (typeof args === 'string') {
    windowId = args;
    // Use fallback layout parameters
}
```
**Purpose**: Handle malformed arguments after Zod filtering
**Remove when**: Using LLMs that send proper objects

#### 3. Intelligent Layout Fallbacks
```typescript
// When Zod filters out resize parameters, provide smart defaults
if (x === undefined && y === undefined && width === undefined && height === undefined) {
    // Calculate side-by-side or 3-window layout
}
```
**Purpose**: Recover from parameter loss due to schema violations
**Remove when**: Parameters are reliably preserved

#### 4. Predictive Layout Detection
```typescript
const isPreparingForNewWindow = windowCount >= 2;
const targetLayout = isPreparingForNewWindow ? 3 : windowCount + 1;
```
**Purpose**: Anticipate Gemini's layout intent when parameters are lost
**Remove when**: LLM provides explicit, correct parameters

## Clean Architecture (Post-Migration)

### What Should Remain
✅ **LangGraph workflow** - Provider agnostic
✅ **Tool schema definitions** - Standard across providers  
✅ **State management** - Core business logic
✅ **Window lifecycle management** - Platform-specific logic
✅ **Layout calculation utilities** - Mathematical functions

### What Should Be Removed
❌ **All "GEMINI-SPECIFIC FIX" blocks**
❌ **Parameter name mapping logic** 
❌ **String argument handling**
❌ **Intelligent layout fallbacks**
❌ **Predictive layout detection**

## Migration Checklist

When switching to OpenAI GPT-4 or Claude:

### Phase 1: Remove Workarounds
- [ ] Delete all `// GEMINI-SPECIFIC FIX` code blocks
- [ ] Remove parameter name auto-fixing logic
- [ ] Remove string argument handling
- [ ] Remove layout fallback calculations
- [ ] Restore standard Zod schema validation

### Phase 2: Simplify resizeAndMoveWindow()
```typescript
// Clean implementation (post-migration)
private resizeAndMoveWindow(args: z.infer<typeof resizeAndMoveWindowSchema>) {
    const { windowId, x, y, width, height } = args; // Direct destructuring
    
    const windowInstance = this.openWindows.get(windowId);
    if (!windowInstance) {
        return { id: windowId, status: 'not_found' };
    }
    
    // Standard resize logic without fallbacks
    windowInstance.setBounds({ x, y, width, height });
    return { id: windowId, status: 'updated' };
}
```

### Phase 3: Validate Provider Switch
- [ ] Test schema adherence with new provider
- [ ] Verify consistent parameter formats
- [ ] Confirm multi-step tool execution works
- [ ] Remove any remaining provider-specific code

## Expected Behavior (Post-Migration)

### With OpenAI/Claude
1. **Schema Respect**: Parameters sent exactly as defined
2. **Consistent Format**: Always proper objects, never strings
3. **Complete Parameters**: No parameter loss due to schema violations
4. **Predictable Planning**: Multi-step operations work reliably

### Performance Improvements
- **Reduced Code Complexity**: ~200 lines of workaround code removed
- **Faster Execution**: No fallback calculations needed
- **Better Reliability**: No parameter guessing or recovery
- **Cleaner Logs**: No "schema violation detected" messages

## Testing Strategy

### Before Migration
```bash
# Current behavior with Gemini workarounds
yarn test:gemini-workarounds
```

### After Migration  
```bash
# Verify clean behavior with better LLM
yarn test:clean-implementation
```

## Cost-Benefit Analysis

### Current State (Gemini + Workarounds)
- ✅ **Cost**: Free tier available
- ❌ **Reliability**: ~70% success rate due to schema issues
- ❌ **Maintainability**: High technical debt
- ❌ **Performance**: Slow due to fallback calculations

### Post-Migration (OpenAI/Claude)
- ❌ **Cost**: Paid API required
- ✅ **Reliability**: ~95% success rate
- ✅ **Maintainability**: Clean, standard implementation
- ✅ **Performance**: Fast, direct execution

## Conclusion

The current Gemini workarounds are **necessary evils** that enable functionality despite poor LLM schema adherence. They represent significant technical debt that must be eliminated when switching to production-ready LLM providers.

**The core Canvas Engine architecture is sound** - only the parameter handling layer needs cleanup. 