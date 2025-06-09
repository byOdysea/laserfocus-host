import { configSchema } from './config';

/**
 * UI-compatible schema format for dynamic form generation
 */
export interface UISchemaField {
    type: 'string' | 'number' | 'boolean' | 'enum' | 'select' | 'json';
    label: string;
    default?: any;
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
    sensitive?: boolean;
    optional?: boolean;
    dependsOn?: string;
}

export interface UISchema {
    [section: string]: {
        [key: string]: UISchemaField;
    };
}

/**
 * Field metadata that can't be extracted from Zod schema
 */
const fieldMetadata: Record<string, Record<string, Partial<UISchemaField>>> = {
    // AI/LLM Provider Configuration
    provider: {
        service: { label: 'AI Provider' },
        model: { label: 'Model', type: 'select', dependsOn: 'service' },
        baseUrl: { label: 'Base URL (Optional)' },
        temperature: { label: 'Temperature', step: 0.1 },
        maxTokens: { label: 'Max Tokens' },
        ollamaHost: { label: 'Ollama Host' },
        ollamaKeepAlive: { label: 'Ollama Keep Alive' }
    },
    
    // System-level Configuration
    system: {
        logLevel: { label: 'Log Level' }
    },
    
    // Future Categories (Placeholders)
    ui: {
        // Agent streaming behavior
        enableSmoothStreaming: { label: 'Enable Smooth Streaming', type: 'boolean' },
        streamingSpeed: { label: 'Streaming Speed', type: 'enum', options: ['fast', 'normal', 'slow'] },
        // Browser window settings
        browserWindowFrame: { label: 'Show window controls for Athena-opened browsers', type: 'boolean' },
        // Future: theme, fontSize, widgetPositions, layoutPresets
    },
    
    workspace: {
        // Future: savedSessions, defaultLayout, windowRules, workspaces
    },
    
    integrations: {
        // MCP (Model Context Protocol) Configuration
        'mcp.enabled': { label: 'Enable MCP Support', type: 'boolean' },
        'mcp.servers': { 
            label: 'MCP Servers Configuration', 
            type: 'json',
            optional: false
        },
        // Transport specific fields that might be exposed individually
        'mcp.servers[].name': { label: 'Server Name', type: 'string' },
        'mcp.servers[].description': { label: 'Server Description', type: 'string', optional: true },
        'mcp.servers[].transport': { 
            label: 'Transport Type', 
            type: 'select', 
            options: ['stdio', 'sse', 'http'] 
        },
        'mcp.servers[].enabled': { label: 'Server Enabled', type: 'boolean' },
        'mcp.servers[].stdio.executor': { 
            label: 'Execution Method', 
            type: 'select', 
            options: ['direct', 'npx', 'uvx', 'docker'],
            optional: true
        },
        'mcp.servers[].stdio.command': { label: 'Command/Package', type: 'string', optional: true },
        'mcp.servers[].stdio.dockerImage': { label: 'Docker Image', type: 'string', optional: true },
        'mcp.servers[].sse.url': { label: 'SSE URL', type: 'string', optional: true },
        'mcp.servers[].http.url': { label: 'HTTP URL', type: 'string', optional: true },
        'mcp.servers[].timeout': { label: 'Timeout (ms)', type: 'number', optional: true },
        'mcp.servers[].retries': { label: 'Retry Attempts', type: 'number', optional: true },
        // Future: webhooks, thirdPartyAPIs, plugins, extensions
    },
    
    performance: {
        // Future: memoryLimit, cacheSize, backgroundProcessing, resourceThrottling
    },
    
    security: {
        // Future: permissions, sandboxing, dataRetention, encryptionLevel
    }
};

/**
 * Extract UI field definition from Zod schema
 */
function extractFieldFromZod(zodField: any, metadata: Partial<UISchemaField> = {}): UISchemaField {
    let field: Partial<UISchemaField> = { ...metadata };
    
    // Unwrap optional and default wrappers
    let unwrapped = zodField;
    while (unwrapped?._def?.typeName === 'ZodOptional' || unwrapped?._def?.typeName === 'ZodDefault') {
        if (unwrapped._def.typeName === 'ZodOptional') {
            field.optional = true;
            unwrapped = unwrapped._def.innerType;
        }
        if (unwrapped._def.typeName === 'ZodDefault') {
            field.default = unwrapped._def.defaultValue();
            unwrapped = unwrapped._def.innerType;
        }
    }
    
    // Extract type and constraints based on Zod type name (only if not overridden by metadata)
    const typeName = unwrapped?._def?.typeName;
    if (!field.type) {
        if (typeName === 'ZodString') {
            field.type = 'string';
        } else if (typeName === 'ZodNumber') {
            field.type = 'number';
        } else if (typeName === 'ZodBoolean') {
            field.type = 'boolean';
        } else if (typeName === 'ZodEnum') {
            field.type = 'enum';
            field.options = unwrapped._def.values;
        }
    }
    
    // Extract constraints for numbers regardless of type override
    if (typeName === 'ZodNumber') {
        const checks = unwrapped._def.checks || [];
        for (const check of checks) {
            if (check.kind === 'min') field.min = check.value;
            if (check.kind === 'max') field.max = check.value;
        }
    }
    
    // Extract enum options if type is enum (from metadata or Zod)
    if (field.type === 'enum' && typeName === 'ZodEnum') {
        field.options = unwrapped._def.values;
    }
    
    return field as UISchemaField;
}

/**
 * Generate UI schema from Zod config schema - TRUE single source of truth!
 */
export function generateUISchema(): UISchema {
    const result: UISchema = {};
    
    // Extract the object shape from the config schema
    const shape = (configSchema as any)._def.shape();
    
    for (const [sectionName, sectionSchema] of Object.entries(shape)) {
        result[sectionName] = {};
        
        // Unwrap section schema (handle defaults)
        let unwrappedSection = sectionSchema as any;
        if (unwrappedSection._def?.typeName === 'ZodDefault') {
            unwrappedSection = unwrappedSection._def.innerType;
        }
        
        if (unwrappedSection._def?.typeName === 'ZodObject') {
            const sectionShape = unwrappedSection._def.shape();
            
            for (const [fieldName, fieldSchema] of Object.entries(sectionShape)) {
                // Skip API key field - handled by BYOK widget
                if (fieldName === 'apiKey') continue;
                
                // Skip MCP field - handled by custom MCP Tools component
                if (sectionName === 'integrations' && fieldName === 'mcp') continue;
                
                const metadata = fieldMetadata[sectionName]?.[fieldName] || { label: fieldName };
                result[sectionName][fieldName] = extractFieldFromZod(fieldSchema, metadata);
            }
        }
    }
    
    return result;
} 