import { createLogger } from '@/lib/utils/logger';
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MCPServerConfig } from '../../infrastructure/config/config';

const logger = createLogger('[MCP]');

export interface OAuth2AuthManager {
    authenticate(authConfig: any): Promise<string>;
    refreshToken(authConfig: any): Promise<string>;
    isTokenValid(token: string): boolean;
}

class OAuth2AuthManagerImpl implements OAuth2AuthManager {
    private tokenCache = new Map<string, { token: string; expires: Date }>();

    async authenticate(authConfig: any): Promise<string> {
        if (authConfig.type === 'bearer' && authConfig.token) {
            return authConfig.token;
        }

        if (authConfig.type === 'basic' && authConfig.username && authConfig.password) {
            return Buffer.from(`${authConfig.username}:${authConfig.password}`).toString('base64');
        }

        if (authConfig.type === 'oauth2.1' && authConfig.clientId && authConfig.clientSecret && authConfig.tokenUrl) {
            const cacheKey = `${authConfig.clientId}:${authConfig.tokenUrl}`;
            const cached = this.tokenCache.get(cacheKey);
            if (cached && cached.expires > new Date()) {
                return cached.token;
            }
            const response = await fetch(authConfig.tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(`${authConfig.clientId}:${authConfig.clientSecret}`).toString('base64')}`
                },
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    scope: authConfig.scopes?.join(' ') || ''
                })
            });
            if (!response.ok) {
                throw new Error(`OAuth 2.1 authentication failed: ${response.statusText}`);
            }
            const tokenData = await response.json();
            const token = tokenData.access_token;
            const expiresIn = tokenData.expires_in || 3600;
            this.tokenCache.set(cacheKey, { token, expires: new Date(Date.now() + (expiresIn * 1000)) });
            return token;
        }

        throw new Error(`Unsupported authentication type: ${authConfig.type}`);
    }

    async refreshToken(authConfig: any): Promise<string> {
        return this.authenticate(authConfig);
    }

    isTokenValid(token: string): boolean {
        return Boolean(token && token.length > 0);
    }
}

export interface MCPTransportFactory {
    createTransport(config: MCPServerConfig): Promise<any>;
    validateConfig(config: MCPServerConfig): string[];
}

export class MCPTransportFactoryImpl implements MCPTransportFactory {
    private authManager = new OAuth2AuthManagerImpl();

    async createTransport(config: MCPServerConfig): Promise<any> {
        switch (config.transport) {
            case 'stdio':
                if (!config.stdio) {
                    throw new Error(`[MCP] STDIO configuration missing for server: ${config.name}`);
                }
                let command: string;
                let args: string[] = [];
                switch (config.stdio.executor) {
                    case 'npx':
                        command = 'npx';
                        args = ['-y', config.stdio.command, ...config.stdio.args];
                        break;
                    case 'uvx':
                        command = 'uvx';
                        args = [config.stdio.command, ...config.stdio.args];
                        break;
                    case 'docker':
                        command = 'docker';
                        args = [
                            'run',
                            '--rm',
                            '-i',
                            ...(config.stdio.dockerArgs || []),
                        ];
                        if (config.stdio.dockerEnv) {
                            Object.entries(config.stdio.dockerEnv).forEach(([key, value]) => {
                                args.push('-e', `${key}=${value}`);
                            });
                        }
                        if (config.stdio.dockerImage) {
                            args.push(config.stdio.dockerImage);
                        } else {
                            throw new Error(`[MCP] Docker image required for server: ${config.name}`);
                        }
                        args.push(...config.stdio.args);
                        break;
                    case 'direct':
                    default:
                        command = config.stdio.command;
                        args = config.stdio.args;
                        break;
                }
                return new StdioClientTransport({
                    command,
                    args,
                    env: {
                        ...Object.fromEntries(
                            Object.entries(process.env).filter(([_, value]) => value !== undefined)
                        ) as Record<string, string>,
                        ...config.stdio.env
                    },
                    cwd: config.stdio.cwd
                });
            case 'sse':
                if (!config.sse) {
                    throw new Error(`[MCP] SSE configuration missing for server: ${config.name}`);
                }
                logger.warn(`[MCP] SSE transport is deprecated. Consider migrating to streamableHttp transport for server: ${config.name}`);
                return new SSEClientTransport(new URL(config.sse.url));
            case 'streamableHttp':
                if (!config.streamableHttp) {
                    throw new Error(`[MCP] Streamable HTTP configuration missing for server: ${config.name}`);
                }
                const headers = { ...config.streamableHttp.headers } as any;
                if (config.streamableHttp.auth) {
                    const token = await this.authManager.authenticate(config.streamableHttp.auth);
                    switch (config.streamableHttp.auth.type) {
                        case 'bearer':
                        case 'oauth2.1':
                            headers['Authorization'] = `Bearer ${token}`;
                            break;
                        case 'basic':
                            headers['Authorization'] = `Basic ${token}`;
                            break;
                    }
                }
                logger.info(`[MCP] Creating Streamable HTTP transport for ${config.name} with batching: ${config.streamableHttp.enableBatching}`);
                return new SSEClientTransport(new URL(config.streamableHttp.url));
            case 'http':
                if (!config.http) {
                    throw new Error(`[MCP] HTTP configuration missing for server: ${config.name}`);
                }
                logger.warn(`HTTP transport has limited support. Consider using streamableHttp for server: ${config.name}`);
                throw new Error(`HTTP transport not fully implemented for server: ${config.name}`);
            default:
                throw new Error(`[MCP] Unsupported transport type: ${config.transport} for server: ${config.name}`);
        }
    }

    validateConfig(config: MCPServerConfig): string[] {
        const errors: string[] = [];
        switch (config.transport) {
            case 'stdio':
                if (!config.stdio) {
                    errors.push('STDIO configuration is required for stdio transport');
                } else {
                    if (!config.stdio.command) {
                        errors.push('STDIO command is required');
                    }
                    if (config.stdio.executor === 'docker' && !config.stdio.dockerImage) {
                        errors.push('Docker image is required when using docker executor');
                    }
                }
                break;
            case 'sse':
                if (!config.sse) {
                    errors.push('SSE configuration is required for sse transport');
                } else {
                    try {
                        new URL(config.sse.url);
                    } catch {
                        errors.push('SSE URL must be a valid URL');
                    }
                }
                logger.warn(`[MCP] SSE transport is deprecated for server: ${config.name}. Please migrate to streamableHttp.`);
                break;
            case 'streamableHttp':
                if (!config.streamableHttp) {
                    errors.push('Streamable HTTP configuration is required for streamableHttp transport');
                } else {
                    try {
                        new URL(config.streamableHttp.url);
                    } catch {
                        errors.push('Streamable HTTP URL must be a valid URL');
                    }
                    if (config.streamableHttp.auth) {
                        const auth = config.streamableHttp.auth;
                        if (auth.type === 'oauth2.1') {
                            if (!auth.clientId || !auth.clientSecret || !auth.tokenUrl) {
                                errors.push('OAuth 2.1 requires clientId, clientSecret, and tokenUrl');
                            }
                        } else if (auth.type === 'bearer' && !auth.token) {
                            errors.push('Bearer authentication requires token');
                        } else if (auth.type === 'basic' && (!auth.username || !auth.password)) {
                            errors.push('Basic authentication requires username and password');
                        }
                    }
                }
                break;
            case 'http':
                if (!config.http) {
                    errors.push('HTTP configuration is required for http transport');
                } else {
                    try {
                        new URL(config.http.url);
                    } catch {
                        errors.push('HTTP URL must be a valid URL');
                    }
                }
                break;
            default:
                errors.push(`Unsupported transport type: ${config.transport}`);
        }
        return errors;
    }
}
