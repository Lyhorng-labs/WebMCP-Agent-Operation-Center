
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

interface WebMCPRegisteredTool {
  name: string;
  description?: string;
  [key: string]: unknown;
}

interface WebMCPModelContext {
  registerTool(
    tool: WebMCPToolDescriptor,
  ): WebMCPRegisteredTool | void | Promise<WebMCPRegisteredTool | void>;
  /** The browser's own view of what is registered. */
  getTools(): WebMCPRegisteredTool[] | Promise<WebMCPRegisteredTool[]>;
  executeTool(tool: WebMCPRegisteredTool, args: string): string | Promise<string>;
  ontoolchange: ((this: WebMCPModelContext, ev: Event) => unknown) | null;
}

interface Document {
  modelContext?: WebMCPModelContext;
}
