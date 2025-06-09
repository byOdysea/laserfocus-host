import { DynamicStructuredTool } from '@langchain/core/tools';
import { ToolExecutionObserver, ToolStatusCallback } from '../types/tool-status';

/**
 * Enhanced tool executor with status tracking and observer pattern
 */
export interface ToolExecutor {
    /**
     * Execute a tool with status tracking
     */
    execute(toolName: string, args: Record<string, any>): Promise<any>;
    
    /**
     * Add status observer
     */
    addObserver(observer: ToolExecutionObserver): void;
    
    /**
     * Remove status observer
     */
    removeObserver(observer: ToolExecutionObserver): void;
    
    /**
     * Get available tools
     */
    getTools(): DynamicStructuredTool[];
}

/**
 * Factory for creating tool executors with different strategies
 */
export interface ToolExecutorFactory {
    createExecutor(tools: DynamicStructuredTool[], statusCallback?: ToolStatusCallback): ToolExecutor;
}

/**
 * Enhanced tool node that implements the observer pattern
 */
export class ObservableToolExecutor implements ToolExecutor {
    private tools: Map<string, DynamicStructuredTool> = new Map();
    private observers: Set<ToolExecutionObserver> = new Set();
    
    constructor(tools: DynamicStructuredTool[]) {
        tools.forEach(tool => this.tools.set(tool.name, tool));
    }
    
    addObserver(observer: ToolExecutionObserver): void {
        this.observers.add(observer);
    }
    
    removeObserver(observer: ToolExecutionObserver): void {
        this.observers.delete(observer);
    }
    
    async execute(toolName: string, args: Record<string, any>): Promise<any> {
        const tool = this.tools.get(toolName);
        if (!tool) {
            throw new Error(`Tool ${toolName} not found`);
        }
        
        // Notify observers of start
        this.observers.forEach(observer => observer.onToolStart(toolName, args));
        
        try {
            const result = await tool.func(args);
            
            // Notify observers of completion
            this.observers.forEach(observer => observer.onToolComplete(toolName, result));
            
            return result;
        } catch (error) {
            // Notify observers of error
            this.observers.forEach(observer => observer.onToolError(toolName, error as Error));
            throw error;
        }
    }
    
    getTools(): DynamicStructuredTool[] {
        return Array.from(this.tools.values());
    }
}

/**
 * Tool status observer that forwards to a callback
 */
export class CallbackToolObserver implements ToolExecutionObserver {
    constructor(private statusCallback: ToolStatusCallback) {}
    
    onToolStart(toolName: string, args: Record<string, any>): void {
        this.statusCallback({
            toolName,
            status: 'executing',
            timestamp: new Date().toISOString(),
            metadata: { args }
        });
    }
    
    onToolComplete(toolName: string, result: any): void {
        this.statusCallback({
            toolName,
            status: 'completed',
            timestamp: new Date().toISOString(),
            metadata: { result: typeof result === 'string' ? result.substring(0, 200) : 'completed' }
        });
    }
    
    onToolError(toolName: string, error: Error): void {
        this.statusCallback({
            toolName,
            status: 'error',
            timestamp: new Date().toISOString(),
            metadata: { error: error.message }
        });
    }
} 