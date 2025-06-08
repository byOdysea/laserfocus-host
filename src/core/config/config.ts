import { z } from 'zod';

// Application constants
export const APP_NAME = 'Laserfocus';
export const IS_DEV = process.env.NODE_ENV === 'development';
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

/**
 * LaserFocus Configuration Schema
 * 
 * Clean, extensible configuration with three main sections:
 * - provider: AI service settings
 * - app: Application behavior 
 * - engine: Performance & advanced settings
 */
export const AppConfigSchema = z.object({
  // === AI Provider Settings ===
  provider: z.object({
    service: z.enum(['google', 'openai', 'anthropic', 'custom']).default('google'),
    apiKey: z.string().default(''),
    model: z.string().default('gemini-1.5-flash-latest'),
    baseUrl: z.string().url().optional(),
    temperature: z.number().min(0).max(2).default(0.2),
    maxTokens: z.number().positive().default(2048),
  }).default({}),

  // === App Behavior Settings ===
  app: z.object({
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    autoStart: z.boolean().default(true),
    showInDock: z.boolean().default(true),
    minimizeToTray: z.boolean().default(false),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }).default({}),

  // === Engine Performance Settings ===
  engine: z.object({
    maxConcurrentRequests: z.number().positive().default(3),
    requestTimeout: z.number().positive().default(30000),
    cachingEnabled: z.boolean().default(true),
    layoutAnimationSpeed: z.enum(['fast', 'normal', 'slow']).default('normal'),
    smartLayoutEnabled: z.boolean().default(true),
    
    // New extensible configuration sections
    layout: z.object({
      screenEdgePadding: z.number().positive().default(10),
      windowGap: z.number().positive().default(10),
      menuBarHeight: z.number().positive().default(40),
      minWindowWidth: z.number().positive().default(300),
      defaultWindowStrategy: z.enum(['fullscreen', 'sideBySide', 'grid']).default('sideBySide'),
      enableSmartArrangement: z.boolean().default(true),
    }).default({}),
    
    workflow: z.object({
      enableToolLooping: z.boolean().default(true),
      maxToolContinuations: z.number().positive().default(2),
      enableMemoryPersistence: z.boolean().default(true),
      threadIdStrategy: z.enum(['session', 'daily', 'conversation']).default('session'),
    }).default({}),
    
    performance: z.object({
      maxEventListeners: z.number().positive().default(50),
      enableBatchProcessing: z.boolean().default(true),
      layoutCalculationCaching: z.boolean().default(true),
      eventDebounceMs: z.number().positive().default(250),
    }).default({}),
    
    providers: z.object({
      enableProviderFallback: z.boolean().default(false),
      fallbackOrder: z.array(z.enum(['google', 'openai', 'anthropic', 'custom'])).default(['google']),
      retryAttempts: z.number().positive().default(3),
      retryDelayMs: z.number().positive().default(1000),
    }).default({}),
    
    tools: z.object({
      enableExternalTools: z.boolean().default(true),
      allowedToolCategories: z.array(z.string()).default(['window', 'browser', 'system']),
      toolTimeoutMs: z.number().positive().default(30000),
      enableToolValidation: z.boolean().default(true),
    }).default({}),
    
    prompts: z.object({
      systemPromptStrategy: z.enum(['template', 'dynamic', 'contextual']).default('template'),
      enableContextCaching: z.boolean().default(true),
      contextUpdateFrequency: z.enum(['realtime', 'onchange', 'periodic']).default('onchange'),
      enablePromptOptimization: z.boolean().default(false),
    }).default({}),
  }).default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type ProviderConfig = AppConfig['provider'];
export type AppBehaviorConfig = AppConfig['app'];
export type EngineConfig = AppConfig['engine'];

// Configuration field metadata for auto-generating UI
export interface ConfigFieldMeta {
  type: 'string' | 'number' | 'boolean' | 'select' | 'password' | 'url';
  label: string;
  description?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  validation?: {
    required?: boolean;
    min?: number;
    max?: number;
    pattern?: string;
  };
  section: 'provider' | 'app' | 'engine';
  group?: string;
  sensitive?: boolean; // For passwords/API keys
}

// Metadata for auto-generating settings UI
export const CONFIG_FIELDS_META: Record<string, ConfigFieldMeta> = {
  'provider.service': {
    type: 'select',
    label: 'AI Provider',
    description: 'Choose your AI provider',
    options: [
      { value: 'google', label: 'Google AI (Gemini)' },
      { value: 'openai', label: 'OpenAI (GPT)' },
      { value: 'anthropic', label: 'Anthropic (Claude)' },
      { value: 'custom', label: 'Custom Provider' },
    ],
    section: 'provider',
  },
  'provider.apiKey': {
    type: 'password',
    label: 'API Key',
    description: 'Your AI provider API key',
    placeholder: 'Enter your API key...',
    section: 'provider',
    sensitive: true,
    validation: { required: true },
  },
  'provider.model': {
    type: 'string',
    label: 'Model',
    description: 'AI model to use',
    placeholder: 'gemini-1.5-flash-latest',
    section: 'provider',
  },
  'provider.baseUrl': {
    type: 'url',
    label: 'Base URL',
    description: 'Custom API endpoint (for custom providers)',
    placeholder: 'https://api.example.com',
    section: 'provider',
  },
  'app.theme': {
    type: 'select',
    label: 'Theme',
    description: 'App appearance theme',
    options: [
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
      { value: 'system', label: 'System' },
    ],
    section: 'app',
  },
  'app.autoStart': {
    type: 'boolean',
    label: 'Auto Start',
    description: 'Start Laserfocus when macOS starts',
    section: 'app',
  },
  'engine.maxConcurrentRequests': {
    type: 'number',
    label: 'Max Concurrent Requests',
    description: 'Maximum parallel AI requests',
    section: 'engine',
    group: 'Performance',
    validation: { min: 1, max: 10 },
  },
};

// Validation helpers
export const validateConfig = (config: unknown): AppConfig => {
  return AppConfigSchema.parse(config);
};

export const validatePartialConfig = <K extends keyof AppConfig>(
  config: unknown, 
  section: K
): AppConfig[K] => {
  const sectionSchema = AppConfigSchema.shape[section];
  return sectionSchema.parse(config);
};

// Default config factory
export const createDefaultConfig = (): AppConfig => {
  return AppConfigSchema.parse({});
};

// Default model name constant
export const DEFAULT_MODEL_NAME = 'gemini-1.5-flash-latest';

// Easy extension system for new features
export interface ConfigExtension<T> {
  key: string;
  schema: z.ZodType<T>;
  defaultValue: T;
  metadata: Record<string, ConfigFieldMeta>;
}

// Example of how MCP would be added:
export const MCPConfigExtension: ConfigExtension<{
  enabled: boolean;
  servers: Array<{
    name: string;
    command: string;
    args: string[];
    enabled: boolean;
  }>;
}> = {
  key: 'mcp',
  schema: z.object({
    enabled: z.boolean().default(false),
    servers: z.array(z.object({
      name: z.string(),
      command: z.string(), 
      args: z.array(z.string()).default([]),
      enabled: z.boolean().default(true),
    })).default([]),
  }),
  defaultValue: {
    enabled: false,
    servers: [],
  },
  metadata: {
    'mcp.enabled': {
      type: 'boolean',
      label: 'Enable MCP Tools',
      description: 'Enable Model Context Protocol tool support',
      section: 'engine',
      group: 'Tools',
    },
    // ... more MCP fields
  },
};

// Function to extend configuration with new features
export const extendConfig = <T>(extension: ConfigExtension<T>) => {
  // This would dynamically extend the schema and metadata
  // Implementation would merge schemas and update CONFIG_FIELDS_META
}; 