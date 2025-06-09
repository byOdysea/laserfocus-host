/**
 * LLM Provider Factory
 * 
 * Creates appropriate LLM instances based on provider configuration
 * Supports Google, OpenAI, Anthropic, Ollama, and custom providers
 */

import { apiKeyManager } from "@/core/infrastructure/config/api-key-manager";
import { ChatAnthropic } from "@langchain/anthropic";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import logger from '@utils/logger';
import { DEFAULT_MODELS, ProviderConfig } from '../../../infrastructure/config/config';

export interface LLMProviderOptions {
    provider: ProviderConfig;
    tools?: any[];
}

export class LLMProviderFactory {
    /**
     * Create LLM instance based on provider configuration
     */
    static async createLLM(options: LLMProviderOptions): Promise<BaseChatModel | any> {
        const { provider, tools } = options;
        
        logger.info(`[LLMFactory] Creating LLM for provider: ${provider.service}`);
        
        // Get API key from API key manager
        const apiKey = await apiKeyManager.getApiKey(provider.service);
        
        // Create provider config with actual API key
        const providerWithKey = {
            ...provider,
            apiKey: apiKey || ''
        };
        
        let llm: BaseChatModel;
        
        switch (provider.service) {
            case 'google':
                llm = this.createGoogleLLM(providerWithKey);
                break;
                
            case 'openai':
                llm = this.createOpenAILLM(providerWithKey);
                break;
                
            case 'anthropic':
                llm = this.createAnthropicLLM(providerWithKey);
                break;
                
            case 'ollama':
                llm = this.createOllamaLLM(providerWithKey);
                break;
                
            case 'custom':
                llm = this.createCustomLLM(providerWithKey);
                break;
                
            default:
                throw new Error(`Unsupported LLM provider: ${provider.service}`);
        }
        
        // Bind tools if provided
        if (tools && tools.length > 0 && llm.bindTools) {
            llm = llm.bindTools(tools) as any;
        }
        
        logger.info(`[LLMFactory] LLM created successfully: ${provider.service} with ${provider.model}`);
        return llm;
    }
    
    /**
     * Create Google AI LLM instance
     */
    private static createGoogleLLM(provider: ProviderConfig): ChatGoogleGenerativeAI {
        if (!provider.apiKey) {
            throw new Error('Google AI API key is required');
        }
        
        return new ChatGoogleGenerativeAI({
            apiKey: provider.apiKey,
            model: provider.model || 'gemini-1.5-pro-latest',
            temperature: provider.temperature || 0.2,
            maxOutputTokens: provider.maxTokens || 4096,
        });
    }
    
    /**
     * Create OpenAI LLM instance
     */
    private static createOpenAILLM(provider: ProviderConfig): ChatOpenAI {
        if (!provider.apiKey) {
            throw new Error('OpenAI API key is required');
        }
        
        const config: any = {
            apiKey: provider.apiKey,
            model: provider.model || 'gpt-4o',
            temperature: provider.temperature || 0.2,
            maxTokens: provider.maxTokens || 4096,
        };
        
        if (provider.baseUrl) {
            config.configuration = {
                baseURL: provider.baseUrl
            };
        }
        
        return new ChatOpenAI(config);
    }
    
    /**
     * Create Anthropic LLM instance
     */
    private static createAnthropicLLM(provider: ProviderConfig): ChatAnthropic {
        if (!provider.apiKey) {
            throw new Error('Anthropic API key is required');
        }
        
        const config: any = {
            apiKey: provider.apiKey,
            model: provider.model || 'claude-3-5-sonnet-20241022',
            temperature: provider.temperature || 0.2,
            maxTokens: provider.maxTokens || 4096,
        };
        
        if (provider.baseUrl) {
            config.clientOptions = {
                baseURL: provider.baseUrl
            };
        }
        
        return new ChatAnthropic(config);
    }
    
    /**
     * Create Ollama LLM instance
     */
    private static createOllamaLLM(provider: ProviderConfig): ChatOllama {
        const config: any = {
            model: provider.model || 'llama3.2',
            temperature: provider.temperature || 0.2,
            baseUrl: provider.ollamaHost || 'http://localhost:11434',
        };
        
        // Ollama-specific options
        if (provider.ollamaKeepAlive) {
            config.keepAlive = provider.ollamaKeepAlive;
        }
        
        return new ChatOllama(config);
    }
    
    /**
     * Create custom LLM instance
     */
    private static createCustomLLM(provider: ProviderConfig): BaseChatModel {
        if (!provider.baseUrl) {
            throw new Error('Base URL is required for custom providers');
        }
        
        // For custom providers, default to OpenAI-compatible API
        return new ChatOpenAI({
            apiKey: provider.apiKey || 'not-required',
            model: provider.model || 'default',
            temperature: provider.temperature || 0.2,
            maxTokens: provider.maxTokens || 4096,
            configuration: {
                baseURL: provider.baseUrl
            }
        });
    }
    
    /**
     * Validate provider configuration (async version that checks actual API keys)
     */
    static async validateProviderAsync(provider: ProviderConfig): Promise<string[]> {
        const errors: string[] = [];
        
        switch (provider.service) {
            case 'google':
                const googleKey = await apiKeyManager.getApiKey('google');
                if (!googleKey) {
                    errors.push('Google AI API key is required');
                }
                break;
                
            case 'openai':
                const openaiKey = await apiKeyManager.getApiKey('openai');
                if (!openaiKey) {
                    errors.push('OpenAI API key is required');
                }
                break;
                
            case 'anthropic':
                const anthropicKey = await apiKeyManager.getApiKey('anthropic');
                if (!anthropicKey) {
                    errors.push('Anthropic API key is required');
                }
                break;
                
            case 'ollama':
                if (!provider.model) {
                    errors.push('Model name is required for Ollama');
                }
                // Note: API key not required for local Ollama
                break;
                
            case 'custom':
                if (!provider.baseUrl) {
                    errors.push('Base URL is required for custom providers');
                }
                break;
        }
        
        return errors;
    }

    /**
     * Validate provider configuration (sync version for compatibility)
     */
    static validateProvider(provider: ProviderConfig): string[] {
        const errors: string[] = [];
        
        switch (provider.service) {
            case 'google':
                // Note: This sync version doesn't check actual API keys
                if (!provider.apiKey) {
                    errors.push('Google AI API key is required');
                }
                break;
                
            case 'openai':
                if (!provider.apiKey) {
                    errors.push('OpenAI API key is required');
                }
                break;
                
            case 'anthropic':
                if (!provider.apiKey) {
                    errors.push('Anthropic API key is required');
                }
                break;
                
            case 'ollama':
                if (!provider.model) {
                    errors.push('Model name is required for Ollama');
                }
                // Note: API key not required for local Ollama
                break;
                
            case 'custom':
                if (!provider.baseUrl) {
                    errors.push('Base URL is required for custom providers');
                }
                break;
        }
        
        return errors;
    }
    
    /**
     * Get default model for provider
     */
    static getDefaultModel(service: string): string {
        return DEFAULT_MODELS[service as keyof typeof DEFAULT_MODELS] || 'default';
    }
    
    /**
     * Check if provider requires API key
     */
    static requiresApiKey(service: string): boolean {
        return service !== 'ollama';
    }
} 