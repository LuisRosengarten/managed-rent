import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import type { AiProviderAdapter, ProviderConfig } from "./types.ts"

export function createAnthropicAdapter(cfg: ProviderConfig): AiProviderAdapter {
  const client = new Anthropic({ apiKey: cfg.apiKey })

  return {
    async generateJson({ system, user, schema, schemaName }) {
      // Use tool-use to enforce structured output
      const jsonSchema = zodToJsonSchema(schema)
      const res = await client.messages.create({
        model: cfg.model,
        max_tokens: 2048,
        system,
        tools: [
          {
            name: schemaName,
            description: `Return result as ${schemaName}`,
            input_schema: jsonSchema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: schemaName },
        messages: [{ role: "user", content: user }],
      })
      const toolUse = res.content.find((c) => c.type === "tool_use")
      if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error("Anthropic did not return tool_use block")
      }
      const parsed = schema.parse(toolUse.input)
      return {
        data: parsed,
        completion: {
          raw: res,
          text: JSON.stringify(toolUse.input),
          usage: {
            promptTokens: res.usage.input_tokens,
            completionTokens: res.usage.output_tokens,
          },
        },
      }
    },
    async ping() {
      try {
        await client.messages.create({
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

// Minimal Zod → JSON Schema for object schemas used by classify/extract prompts.
// Kept inline to avoid heavy zod-to-json-schema dep.
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return convert(schema)
}

function convert(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def
  const t = def.typeName
  switch (t) {
    case "ZodObject": {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape
      const properties: Record<string, unknown> = {}
      const required: string[] = []
      for (const [k, v] of Object.entries(shape)) {
        properties[k] = convert(v as z.ZodTypeAny)
        if (!(v as z.ZodTypeAny).isOptional()) required.push(k)
      }
      return { type: "object", properties, required, additionalProperties: false }
    }
    case "ZodString":
      return { type: "string" }
    case "ZodNumber":
      return { type: "number" }
    case "ZodBoolean":
      return { type: "boolean" }
    case "ZodArray":
      return {
        type: "array",
        items: convert((schema as z.ZodArray<z.ZodTypeAny>).element),
      }
    case "ZodEnum":
      return {
        type: "string",
        enum: (schema as z.ZodEnum<[string, ...string[]]>).options,
      }
    case "ZodOptional":
      return convert((schema as z.ZodOptional<z.ZodTypeAny>).unwrap())
    case "ZodNullable":
      return convert((schema as z.ZodNullable<z.ZodTypeAny>).unwrap())
    case "ZodUnion": {
      const opts = (schema as z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]>)
        .options
      return { anyOf: opts.map((o) => convert(o)) }
    }
    case "ZodRecord":
      return { type: "object", additionalProperties: true }
    case "ZodAny":
    case "ZodUnknown":
      return {}
    default:
      return {}
  }
}
