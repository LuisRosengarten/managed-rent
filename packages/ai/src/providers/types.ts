import type { AiProvider } from "@workspace/core/status"
import type { z } from "zod"

export type ProviderConfig = {
  provider: AiProvider
  apiKey: string
  model: string
}

export interface JsonCompletion {
  raw: unknown
  text: string
  usage?: { promptTokens?: number; completionTokens?: number }
}

export interface AiProviderAdapter {
  generateJson<T>(args: {
    system: string
    user: string
    schema: z.ZodType<T>
    schemaName: string
  }): Promise<{ data: T; completion: JsonCompletion }>

  // Simple health check — returns model metadata
  ping(): Promise<{ ok: true; model: string } | { ok: false; error: string }>
}

export const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o-mini",
  google: "gemini-2.0-flash",
} as const satisfies Record<AiProvider, string>
