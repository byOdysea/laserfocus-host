// src/config/env.ts
// Environment variables validation using Zod

import dotenv from 'dotenv';
import { z } from 'zod';
import { ConfigurationError } from '../utils/errors';
import { createComponentLogger } from '../utils/logger';

// Load environment variables from .env file
dotenv.config();

const logger = createComponentLogger('EnvConfig');

// Define the schema for environment variables
const envSchema = z.object({
  // API Keys
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),

  // Server Configuration
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  HOST: z.string().default('localhost'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // MCP Configuration
  MCP_JSON_PATH: z.string().default('./mcp.json'),

  // LLM Configuration
  MAX_TOKEN_COUNT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive())
    .default('8192'),
  DEFAULT_TOOL_TIMEOUT_MS: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive())
    .default('5000'),
});

// Export the validated environment schema type
export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates environment variables against the schema
 * @returns Validated environment variables
 * @throws ConfigurationError if any required variables are missing or invalid
 */
export function validateEnv(): EnvConfig {
  try {
    logger.debug('Validating environment variables');

    // Parse and validate the environment variables
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
      const errorMessage = result.error.format();
      logger.error({ error: errorMessage }, 'Invalid environment configuration');
      throw new ConfigurationError(
        `Invalid environment configuration: ${JSON.stringify(errorMessage)}`,
      );
    }

    logger.info('Environment variables validated successfully');
    return result.data;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }

    logger.error({ error }, 'Failed to validate environment variables');
    throw new ConfigurationError(
      `Failed to validate environment variables: ${(error as Error).message}`,
    );
  }
}

// Export the validated config
export const env = validateEnv();
