// src/types/mcp-sdk.mock.js
// Mock implementation of the MCP SDK for testing

class MockClient {
  constructor() {
    this.transport = 'stdio';
    this.connect = jest.fn().mockResolvedValue(undefined);
    this.disconnect = jest.fn().mockResolvedValue(undefined);
    this.listTools = jest.fn().mockResolvedValue({
      tools: [],
    });
    this.getPrompt = jest.fn().mockRejectedValue(new Error('Not implemented'));
    this.callTool = jest.fn().mockImplementation((name, args) => {
      return Promise.resolve({ success: true, args });
    });
  }
}

module.exports = {
  Client: MockClient,
};
