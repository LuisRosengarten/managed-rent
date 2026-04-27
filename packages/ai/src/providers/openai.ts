import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"
import type { AiProviderAdapter, ProviderConfig } from "./types.ts"

export function createOpenAiAdapter(cfg: ProviderConfig): AiProviderAdapter {
  const client = new OpenAI({ apiKey: cfg.apiKey })

  return {
    async generateJson({ system, user, schema, schemaName }) {
      const res = await client.beta.chat.completions.parse({
        model: cfg.model,
        response_format: zodResponseFormat(schema, schemaName),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      })
      const choice = res.choices[0]
      if (!choice?.message.parsed) {
        throw new Error("OpenAI did not return parsed output")
      }
      return {
        data: choice.message.parsed,
        completion: {
          raw: res,
          text: choice.message.content ?? "",
          usage: {
            promptTokens: res.usage?.prompt_tokens,
            completionTokens: res.usage?.completion_tokens,
          },
        },
      }
    },
    async ping() {
      try {
        await client.chat.completions.create({
          model: cfg.model,
          max_tokens: 8,
          messages: [{ role: "user", content: "ping" }],
        })
        return { ok: true, model: cfg.model }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  }
}
