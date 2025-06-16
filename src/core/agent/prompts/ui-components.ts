/**
 * UI Components System - Consolidated URI Schemes & Component Information
 * Single source of truth for internal component documentation
 */

export const uiComponentsPrompt = `# LaserFocus UI Component Ecosystem

## Available Components
{{uiComponents}}

## URI Scheme Reference
- **apps://AppName[?params][/path]** - Full applications (Notes, Settings, Reminders)
- **platform://ComponentName** - System interface (InputPill, AthenaWidget) 
- **widgets://WidgetName[?config]** - Embeddable components (when available)

## Advanced URI Examples
- \`apps://Notes?theme=dark&readonly=true\` - Parameterized apps
- \`apps://Notes/document/123/edit\` - Path-based routing
- \`widgets://Timer/pomodoro\` - Widget variants

## Component Capabilities
- **conversation-monitor**: AthenaWidget (conversation tracking)
- **user-input**: InputPill (command processing)  
- **api-key-management**: Byokwidget (configuration)
- **window-management**: Canvas engine integration

## 🚨 CRITICAL LAYOUT BEHAVIOR FOR INTERNAL COMPONENTS
**Internal apps follow IDENTICAL layout rules as external websites!**

- ❌ **WRONG**: Open \`apps://Notes\` at full width when other windows exist
- ✅ **CORRECT**: Follow same layout patterns as \`https://reddit.com\`

**Examples**:
- User says "open notes" with 1 existing window → resize existing + open Notes side-by-side
- User says "open settings" with 2 existing windows → use top/bottom split pattern
- **URI scheme does NOT change layout strategy!**

## Error Handling
- Invalid component names fail gracefully with descriptive errors
- Missing parameters use sensible defaults
- Unavailable components log warnings and suggest alternatives`;

/**
 * Builds the UI components description for the system prompt
 */
export function buildUIComponentsDescription(availableComponents: {
    platform: string[];
    apps: string[];
    widgets: string[];
}): string {
    const sections = [];
    
    // Platform components (system UI) - Most critical
    if (availableComponents.platform.length > 0) {
        const platformDesc = availableComponents.platform.map(name => 
            `  - **${name}**: \`platform://${name}\` - System component`
        ).join('\n');
        sections.push(`**⚙️ Platform Components**:\n${platformDesc}`);
    }
    
    // Applications (most commonly requested)
    if (availableComponents.apps.length > 0) {
        const appsDesc = availableComponents.apps.map(name => 
            `  - **${name}**: \`apps://${name}\` - Full application`
        ).join('\n');
        sections.push(`**📱 Applications**:\n${appsDesc}`);
    }
    
    // Widgets (embeddable)
    if (availableComponents.widgets.length > 0) {
        const widgetsDesc = availableComponents.widgets.map(name => 
            `  - **${name}**: \`widgets://${name}\` - Embeddable widget`
        ).join('\n');
        sections.push(`**🧩 Widgets**:\n${widgetsDesc}`);
    }
    
    if (sections.length === 0) {
        return "No UI components are currently available.";
    }
    
    return sections.join('\n\n');
}

/**
 * UI Components summary builder for system prompts
 * Centralizes the logic to avoid duplication across different prompt builders
 */

import { getUIDiscoveryService } from '../../platform/discovery/main-process-discovery';

/**
 * Build UI components summary with URI schemes for the system prompt
 * @returns Formatted UI components summary string
 */
export function buildUIComponentsSummary(): string {
    // Get available UI components
    const uiDiscoveryService = getUIDiscoveryService();
    let availableApps: string[] = [];
    
    if (uiDiscoveryService) {
        const allApps = uiDiscoveryService.getAllUIComponents();
        availableApps = allApps.filter((app: string) => 
            !['AthenaWidget', 'InputPill', 'Byokwidget'].includes(app)
        );
    }

    // Use default apps if none found
    const appsList = availableApps.length > 0 ? availableApps : ['notes', 'settings', 'reminders'];
    
    // Build comprehensive UI components summary with URI schemes
    return `# Available Internal Apps
${appsList.map(app => `- ${app}: Use \`apps://${app}\` (e.g., "open ${app}" → create_element with contentSource="apps://${app}")`).join('\n')}

# URI Scheme Examples
- apps://settings - Opens the LaserFocus settings app
- apps://notes - Opens the notes application  
- apps://reminders - Opens the reminders app
- https://example.com - Opens external websites

# Critical: Internal apps use SAME layout rules as external URLs!`;
} 