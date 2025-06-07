export const uiComponentsPrompt = `# LaserFocus UI Component Ecosystem

## Available UI Components
The LaserFocus application includes its own ecosystem of UI components that can be opened using special URL schemes:

{{uiComponents}}

## URL Schemes for Internal Components
Instead of external web URLs, you can open internal LaserFocus components using these schemes:

- \`platform://ComponentName\` - **Platform UI Components**: Core system interface elements (auto-start)
- \`apps://AppName\` - **Applications**: Full applications that users can open on-demand  
- \`widgets://WidgetName\` - **Widgets**: Lightweight embeddable components

## Examples
- To open the Notes application: \`"url": "apps://Notes"\`
- To open a weather widget: \`"url": "widgets://WeatherWidget"\`
- To focus a platform component: \`"url": "platform://InputPill"\`

## Important Notes
- These components are part of the native LaserFocus ecosystem, not external websites
- They integrate seamlessly with the window management system
- They can be positioned, resized, and arranged like any browser window
- When users ask to "open notes", "open settings", etc., use the appropriate \`apps://\` URL
- Platform components are typically already running, but can be focused if needed`;

/**
 * Builds the UI components description for the system prompt
 */
export function buildUIComponentsDescription(availableComponents: {
    platform: string[];
    apps: string[];
    widgets: string[];
}): string {
    const sections = [];
    
    // Applications (most commonly requested)
    if (availableComponents.apps.length > 0) {
        const appsDesc = availableComponents.apps.map(name => 
            `  - **${name}**: Use \`"url": "apps://${name}"\` to open this application`
        ).join('\n');
        sections.push(`**📱 Applications (User Apps)**:\n${appsDesc}`);
    }
    
    // Platform components (system UI)
    if (availableComponents.platform.length > 0) {
        const platformDesc = availableComponents.platform.map(name => 
            `  - **${name}**: Use \`"url": "platform://${name}"\` to focus this system component`
        ).join('\n');
        sections.push(`**⚙️ Platform UI Components (System Interface)**:\n${platformDesc}`);
    }
    
    // Widgets (embeddable)
    if (availableComponents.widgets.length > 0) {
        const widgetsDesc = availableComponents.widgets.map(name => 
            `  - **${name}**: Use \`"url": "widgets://${name}"\` to embed this widget`
        ).join('\n');
        sections.push(`**🧩 Widgets (Embeddable Components)**:\n${widgetsDesc}`);
    }
    
    if (sections.length === 0) {
        return "No UI components are currently available in the LaserFocus ecosystem.";
    }
    
    return sections.join('\n\n') + 
           '\n\n**💡 Usage Tip**: When users ask to open internal apps like "notes" or "settings", ' +
           'use the appropriate URL scheme instead of treating them as web searches.';
} 