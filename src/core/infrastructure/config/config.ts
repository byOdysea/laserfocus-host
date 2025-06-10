import { z } from 'zod';

// Environment detection
export const IS_DEV = process.env.NODE_ENV === 'development';
export const APP_NAME = 'Laserfocus';
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
export const DEFAULT_MODEL_NAME = 'gemini-1.5-flash-latest';

// Single source of truth: Default models for each provider
export const DEFAULT_MODELS = {
  google: 'gemini-1.5-flash-latest',
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  ollama: 'llama3.2',
  custom: 'default'
} as const;

// Available models for each provider (dynamically marks defaults)
export const PROVIDER_MODELS = {
  google: [
    { value: 'gemini-1.5-flash-latest', label: 'Gemini 1.5 Flash Latest' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Experimental)' },
    { value: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro Latest' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
  ],
  ollama: [
    { value: 'llama3.2', label: 'Llama 3.2' },
    { value: 'llama3.1', label: 'Llama 3.1' },
    { value: 'mistral', label: 'Mistral' },
    { value: 'codellama', label: 'CodeLlama' },
  ],
  custom: [
    { value: 'default', label: 'Default Model' },
  ],
} as const;

/**
 * Get provider models with default marking
 */
export function getProviderModelsWithDefaults(provider: keyof typeof PROVIDER_MODELS) {
  const models = PROVIDER_MODELS[provider];
  const defaultModel = DEFAULT_MODELS[provider];
  
  return models.map(model => ({
    value: model.value,
    label: model.value === defaultModel ? `${model.label} (Default)` : model.label
  }));
}

// Semantic configuration schema with clear categories
export const configSchema = z.object({
  // AI/LLM Provider Configuration
  provider: z.object({
    service: z.enum(['google', 'openai', 'anthropic', 'ollama', 'custom']).default('google'),
    apiKey: z.string().default(''), // Managed separately by ApiKeyManager, kept for compatibility
    model: z.string().default(DEFAULT_MODELS.google),
    baseUrl: z.string().optional(),
    temperature: z.number().min(0).max(2).default(0.2),
    maxTokens: z.number().min(1).default(2048),
    ollamaHost: z.string().optional(),
    ollamaKeepAlive: z.string().optional(),
  }).default({}),
  
  // System-level Configuration
  system: z.object({
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    // Future: autoStart, crashReporting, updateChannel
  }).default({}),

  // Future Categories (Placeholder for Implementation)
  
  // User Interface Configuration
  ui: z.object({
    // Agent streaming behavior
    enableSmoothStreaming: z.boolean().default(true),
    streamingSpeed: z.enum(['fast', 'normal', 'slow']).default('normal'),
    // Browser window settings
    browserWindowFrame: z.boolean().default(false),
    enableToolPills: z.boolean().default(false),  
    // Future: theme, fontSize, widgetPositions, layoutPresets
  }).default({}),
  
  // Workspace Management
  workspace: z.object({
    // Future: savedSessions, defaultLayout, windowRules, workspaces
  }).default({}).optional(),
  
  // External Integrations
  integrations: z.object({
    // MCP (Model Context Protocol) Configuration
    mcp: z.object({
      enabled: z.boolean().default(false),
      servers: z.array(z.object({
        name: z.string(),
        description: z.string().optional(),
        transport: z.enum(['stdio', 'sse', 'http', 'streamableHttp']).default('stdio'),
        enabled: z.boolean().default(true),
        
        // Transport-specific configurations
        stdio: z.object({
          command: z.string(),
          args: z.array(z.string()).default([]),
          env: z.record(z.string()).optional(),
          // Execution method: npx, uvx, docker, or direct command
          executor: z.enum(['npx', 'uvx', 'docker', 'direct']).default('direct'),
          // Docker-specific options (only needed for docker executor)
          dockerImage: z.string().optional(),
          dockerArgs: z.array(z.string()).optional(),
          dockerEnv: z.record(z.string()).optional(),
          // Working directory for the command
          cwd: z.string().optional()
        }).optional(),
        
        sse: z.object({
          url: z.string().url(),
          headers: z.record(z.string()).optional()
        }).optional(),
        
        http: z.object({
          url: z.string().url(),
          headers: z.record(z.string()).optional(),
          method: z.enum(['GET', 'POST']).default('POST')
        }).optional(),
        
        // Streamable HTTP transport (replaces SSE)
        streamableHttp: z.object({
          url: z.string().url(),
          headers: z.record(z.string()).optional(),
          // OAuth 2.1 authentication support (optional)
          auth: z.object({
            type: z.enum(['oauth2.1', 'bearer', 'basic']).optional(),
            clientId: z.string().optional(),
            clientSecret: z.string().optional(),
            tokenUrl: z.string().url().optional(),
            scopes: z.array(z.string()).optional(),
            // For bearer token auth
            token: z.string().optional(),
            // For basic auth
            username: z.string().optional(),
            password: z.string().optional()
          }).optional(),
          // JSON-RPC batching support (with sensible defaults)
          enableBatching: z.boolean().default(true),
          batchSize: z.number().min(1).max(100).default(10)
        }).optional(),
        
        // Advanced filtering (all optional with permissive defaults)
        toolFilters: z.object({
          allowedTools: z.array(z.string()).optional(),
          blockedTools: z.array(z.string()).optional()
        }).optional(),
        
        componentFilters: z.object({
          enableTools: z.boolean().default(true),
          enableResources: z.boolean().default(true),
          enablePrompts: z.boolean().default(true),
          allowedResources: z.array(z.string()).optional(),
          blockedResources: z.array(z.string()).optional(),
          allowedPrompts: z.array(z.string()).optional(),
          blockedPrompts: z.array(z.string()).optional()
        }).optional(),
        
        // Connection settings (with sensible defaults)
        timeout: z.number().min(1000).max(60000).default(15000),
        retries: z.number().min(0).max(5).default(2),
        
        // Tool annotations support (optional, disabled by default for simplicity)
        toolAnnotations: z.object({
          enableMetadata: z.boolean().default(false),
          supportReadOnlyMarking: z.boolean().default(false),
          supportDestructiveMarking: z.boolean().default(false)
        }).optional()
      })).default([])
    }).default({}),
    // Future: webhooks, thirdPartyAPIs, plugins, extensions
  }).default({}).optional(),
  
  // Performance & Resource Management
  performance: z.object({
    // Future: memoryLimit, cacheSize, backgroundProcessing, resourceThrottling
  }).default({}).optional(),
  
  // Security & Privacy
  security: z.object({
    // Future: permissions, sandboxing, dataRetention, encryptionLevel
  }).default({}).optional()
});

export type AppConfig = z.infer<typeof configSchema>;
export type ProviderConfig = z.infer<typeof configSchema>['provider'];
export type SystemConfig = z.infer<typeof configSchema>['system'];
export type UIConfig = z.infer<typeof configSchema>['ui'];
export type IntegrationsConfig = NonNullable<z.infer<typeof configSchema>['integrations']>;
export type MCPConfig = IntegrationsConfig['mcp'];
export type MCPServerConfig = MCPConfig['servers'][number];

/**
 * Create default configuration
 */
export function createDefaultConfig(): AppConfig {
  return configSchema.parse({});
} 