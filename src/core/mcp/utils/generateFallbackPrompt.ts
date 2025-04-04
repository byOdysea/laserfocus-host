// src/core/mcp/utils/generateFallbackPrompt.ts
// Utility to generate fallback tool description prompts
// when a server doesn't provide a "tool-descriptions" prompt

import { ToolDefinition } from '../../../types/mcp';
import { createComponentLogger } from '../../../utils/logger';

const logger = createComponentLogger('GenerateFallbackPrompt');

/**
 * Generates a fallback tool description prompt for a server
 *
 * This is used when a server doesn't implement the "tool-descriptions" prompt
 * or when the prompt fetching fails.
 *
 * @param serverId The ID of the server
 * @param definitions The tool definitions from the server
 * @returns A fallback description prompt
 */
export function generateFallbackToolDescription(
  serverId: string,
  definitions: ToolDefinition[],
): string {
  logger.debug(
    { serverId, toolCount: definitions.length },
    'Generating fallback tool description prompt',
  );

  let description = `When using tools from the "${serverId}" server, follow these guidelines:\n\n`;

  if (definitions.length === 0) {
    description += `There are currently no tools available from this server.`;
    return description;
  }

  description += `Available tools:\n\n`;

  // Add each tool with its description and parameters
  definitions.forEach((tool) => {
    description += `## ${tool.name}\n`;
    description += `${tool.description}\n\n`;

    // Add parameters information if available
    if (tool.parameters && typeof tool.parameters === 'object') {
      description += `Parameters:\n`;

      // Check if it follows JSON Schema with properties
      if (tool.parameters.properties) {
        const properties = tool.parameters.properties as Record<string, any>;
        const required = Array.isArray(tool.parameters.required) ? tool.parameters.required : [];

        Object.entries(properties).forEach(([paramName, paramInfo]) => {
          const isRequired = required.includes(paramName);
          const typeInfo = paramInfo.type || 'any';
          const paramDesc = paramInfo.description || '';

          description += `- ${paramName}${isRequired ? ' (required)' : ''}: ${typeInfo} - ${paramDesc}\n`;
        });
      } else {
        // Simple fallback if not following standard JSON Schema format
        description += `- Complex parameters structure, refer to the tool's schema.\n`;
      }

      description += `\n`;
    }

    // Add examples if available
    if (Array.isArray(tool.examples) && tool.examples.length > 0) {
      description += `Example usage:\n\`\`\`json\n${JSON.stringify(tool.examples[0], null, 2)}\n\`\`\`\n\n`;
    }

    description += `---\n\n`;
  });

  description += `When calling these tools, ensure you provide all required parameters in the correct format.`;

  logger.debug({ serverId, description }, 'Generated fallback tool description prompt');
  return description;
}
