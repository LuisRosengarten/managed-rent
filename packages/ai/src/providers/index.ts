import type { AiProvider } from "@workspace/core/status"
import { createAnthropicAdapter } from "./anthropic.ts"
import { createGoogleAdapter } from "./google.ts"
import { createOpenAiAdapter } from "./openai.ts"
import type { AiProviderAdapter, ProviderConfig } from "./types.ts"

export function createAdapter(cfg: ProviderConfig): AiProviderAdapter {
  switch (cfg.provider) {
    case "anthropic":
      return createAnthropicAdapter(cfg)
    case "openai":
      return createOpenAiAdapter(cfg)
    case "google":
      return createGoogleAdapter(cfg)
    default: {
      const _exhaustive: never = cfg.provider
      throw new Error(`Unknown AI provider: ${_exhaustive as AiProvider}`)
    }
  }
}

export { DEFAULT_MODELS } from "./types.ts"
export type { AiProviderAdapter, ProviderConfig } from "./types.ts"
