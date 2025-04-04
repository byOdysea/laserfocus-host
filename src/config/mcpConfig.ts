// src/config/mcpConfig.ts
// MCP configuration schema validation using Zod

import fs from 'fs';
import { z } from 'zod';
import { ConfigurationError } from '../utils/errors';
import { createComponentLogger } from '../utils/logger';

const logger = createComponentLogger('MCPConfig');

// Define the schema for an individual server config
const serverConfigSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['local', 'remote']),
    transport: z.enum(['stdio', 'http']),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    url: z.string().url().optional(),
    timeoutMs: z.number().positive().optional(),
  })
  .refine(
    (data) => {
      // Additional validation: stdio requires command, http requires url
      if (data.transport === 'stdio' && !data.command) {
        return false;
      }
      if (data.transport === 'http' && !data.url) {
        return false;
      }
      return true;
    },
    {
      message:
        "For 'stdio' transport, 'command' is required. For 'http' transport, 'url' is required.",
    },
  );

// Define the schema for the entire MCP config file
const mcpConfigSchema = z.object({
  servers: z.record(serverConfigSchema),
});

// Export the schema types
export type MCPServerConfig = z.infer<typeof serverConfigSchema>;
export type MCPConfig = z.infer<typeof mcpConfigSchema>;

/**
 * Loads and validates the MCP configuration from the given path
 * @param configPath Path to the mcp.json file
 * @returns Validated MCP configuration
 * @throws ConfigurationError if the file is invalid or missing
 */
export function loadMCPConfig(configPath: string): MCPConfig {
  try {
    logger.info({ configPath }, 'Loading MCP configuration');

    // Check if the file exists
    if (!fs.existsSync(configPath)) {
      throw new ConfigurationError(`MCP configuration file not found: ${configPath}`, configPath);
    }

    // Read and parse the JSON file
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    // Validate against the schema
    const validatedConfig = mcpConfigSchema.safeParse(configData);

    if (!validatedConfig.success) {
      const errorMessage = validatedConfig.error.format();
      logger.error({ error: errorMessage }, 'Invalid MCP configuration');
      throw new ConfigurationError(
        `Invalid MCP configuration: ${JSON.stringify(errorMessage)}`,
        configPath,
      );
    }

    logger.info(
      { serverCount: Object.keys(validatedConfig.data.servers).length },
      'MCP configuration loaded successfully',
    );
    return validatedConfig.data;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }

    logger.error({ error }, 'Failed to load MCP configuration');
    throw new ConfigurationError(
      `Failed to load MCP configuration: ${(error as Error).message}`,
      configPath,
    );
  }
}
