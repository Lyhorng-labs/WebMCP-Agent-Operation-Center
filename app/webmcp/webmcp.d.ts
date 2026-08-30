/**
 * Ambient types for the WebMCP browser API (`document.modelContext`).
 * Not part of lib.dom.d.ts, so we declare the surface we use here.
 */

interface WebMCPJSONSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

interface WebMCPToolDescriptor {
  name: string;
  title?: string;
  description: string;
  inputSchema: WebMCPJSONSchema;
  execute: (args: Record<string, unknown>) => unknown | Promise<unknown>;
}

interface WebMCPModelContext {
  registerTool(tool: WebMCPToolDescriptor): void;
  unregisterTool?(name: string): void;
}

interface Document {
  modelContext?: WebMCPModelContext;
}
