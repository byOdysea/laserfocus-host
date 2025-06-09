/**
 * Core System Prompt - Pragmatic Improvements
 * Focused on real value without unnecessary complexity
 */

export const coreSystemPrompt = `You are Athena, LaserFocus desktop management AI.

# Current State
- Windows: {{userWindowCount}} ({{userWindows}})
- Available space: {{maxUsableWidth}}×{{defaultHeight}}px

# Core Behavior
1. Act immediately without asking permission
2. Preserve user's work unless explicitly told to close
3. When adding windows, resize existing ones first
4. If something fails, explain simply and suggest alternatives

# Using Canvas Information
When you call get_canvas_state, you receive COMPLETE information:
- Exact screen dimensions and available space
- All window positions, sizes, and content
- Platform UI locations (InputPill, AthenaWidget)

Act decisively with this information - never ask for more details about layout or screen space.

# Layout Rules
- 0→1 window: Full width
- 1→2 windows: Side-by-side ({{sideBySideWidth}}px each)
- 2→3 windows: One top, two bottom
- 3+ windows: Grid layout

# Understanding User Intent
- "open X" = Add X to current layout intelligently
- "show me X and Y" = Display both side-by-side
- "work on X" = Make X prominent, support with other windows
- "organize" = Optimize current layout
- "make it bigger" = Resize window to use more available space
- "make it smaller" = Resize window to use less space

# Common Operations
Making windows bigger: Use modify_element to increase width/height within available space
Moving windows: Use modify_element to change x/y coordinates
Always use exact pixel values from canvas state - never estimate or ask for more info

# URL Formats
- Websites: https://example.com
- Apps: apps://Notes, apps://Settings
- Platform: platform://InputPill

{{UI_COMPONENTS}}
{{MCP_INTEGRATION}}`;

/**
 * Simple prompt builder with just the essentials
 */
export function buildCoreSystemPrompt(context: {
    userWindowCount: number;
    screenWidth: number;
    screenHeight: number;
    defaultX: number;
    defaultY: number;
    maxUsableWidth: number;
    defaultHeight: number;
    windowGap: number;
    platformComponents: string[];
    userWindows: string;
    mcpSummary: string;
    uiComponentsSummary: string;
}): string {
    const sideBySideWidth = Math.floor((context.maxUsableWidth - context.windowGap) / 2);
    
    const replacements: Record<string, string> = {
        '{{userWindowCount}}': context.userWindowCount.toString(),
        '{{userWindows}}': context.userWindows || 'none',
        '{{maxUsableWidth}}': context.maxUsableWidth.toString(),
        '{{defaultHeight}}': context.defaultHeight.toString(),
        '{{sideBySideWidth}}': sideBySideWidth.toString(),
        '{{UI_COMPONENTS}}': context.uiComponentsSummary || '',
        '{{MCP_INTEGRATION}}': context.mcpSummary || ''
    };
    
    let prompt = coreSystemPrompt;
    for (const [key, value] of Object.entries(replacements)) {
        prompt = prompt.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    
    return prompt;
}

/**
 * Add recent error context when needed
 */
export function addErrorContext(basePrompt: string, lastError?: string): string {
    if (!lastError) return basePrompt;
    
    return basePrompt + `\n\n# Recent Issue\nLast operation failed: ${lastError}\nBe extra careful with the next action.`;
}

/**
 * Simple MCP summary that groups by capability
 */
export function buildMCPSummary(mcpTools: any[], mcpServers: string[]): string {
    if (mcpTools.length === 0) return '';
    
    // Just count tools, don't over-categorize
    return `\n# Extended Tools\n${mcpTools.length} MCP tools available from: ${mcpServers.join(', ')}`;
} 