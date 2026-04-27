import { GoogleGenAI } from "@google/genai"
import type { AiProviderAdapter, ProviderConfig } from "./types.ts"
import type { z } from "zod"

export function createGoogleAdapter(cfg: ProviderConfig): AiProviderAdapter {
  const client = new GoogleGenAI({ apiKey: cfg.apiKey })

  return {
    async generateJson({ system, user, schema }) {
      const res = await client.models.generateContent({
        model: cfg.model,
        contents: [{ role: "user", parts: [{ text: user }] }],
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseSchema: zodToGeminiSchema(schema),
        },
      })
      const text = res.text ?? ""
      const json = JSON.parse(text)
      const parsed = schema.parse(json)
      return {
        data: parsed,
        completion: {
          raw: res,
          text,
          usage: {
            promptTokens: res.usageMetadata?.promptTokenCount,
            completionTokens: res.usageMetadata?.candidatesTokenCount,
          },
        },
      }
    },
    async ping() {
      try {
        await client.models.generateContent({
          model: cfg.model,
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
        })
        return { ok: true, model: cfg.model }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },
  }
}

// Convert Zod → Gemini responseSchema (OpenAPI-like subset).
function zodToGeminiSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def
  const t = def.typeName
  switch (t) {
    case "ZodObject": {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape
      const properties: Record<string, unknown> = {}
      const required: string[] = []
      for (const [k, v] of Object.entries(shape)) {
        properties[k] = zodToGeminiSchema(v as z.ZodTypeAny)
        if (!(v as z.ZodTypeAny).isOptional()) required.push(k)
      }
      return { type: "OBJECT", properties, required }
    }
    case "ZodString":
      return { type: "STRING" }
    case "ZodNumber":
      return { type: "NUMBER" }
    case "ZodBoolean":
      return { type: "BOOLEAN" }
    case "ZodArray":
      return {
        type: "ARRAY",
        items: zodToGeminiSchema((schema as z.ZodArray<z.ZodTypeAny>).element),
      }
    case "ZodEnum":
      return {
        type: "STRING",
        enum: (schema as z.ZodEnum<[string, ...string[]]>).options,
      }
    case "ZodOptional":
      return zodToGeminiSchema((schema as z.ZodOptional<z.ZodTypeAny>).unwrap())
    case "ZodNullable":
      return zodToGeminiSchema((schema as z.ZodNullable<z.ZodTypeAny>).unwrap())
    default:
      return { type: "STRING" }
  }
}
