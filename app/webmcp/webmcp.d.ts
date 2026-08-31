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

/**
 * What `registerTool` hands back. Implementations differ: some return a
 * registration object, some a bare unregister function, some nothing at all
 * (and expose `unregisterTool` instead), so all three are modelled.
 */
interface WebMCPToolRegistration {
  unregister(): void | Promise<void>;
}

type WebMCPRegisterResult =
  | WebMCPToolRegistration
  | (() => void | Promise<void>)
  | void;

interface WebMCPModelContext {
  registerTool(
    tool: WebMCPToolDescriptor,
  ): WebMCPRegisterResult | Promise<WebMCPRegisterResult>;
  unregisterTool?(name: string): void | Promise<void>;
}

interface Document {
  modelContext?: WebMCPModelContext;
}
