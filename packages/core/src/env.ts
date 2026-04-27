import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  APP_ENCRYPTION_KEY: z.string().min(44), // base64(32 bytes) ≈ 44 chars
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().optional(),
  UPLOADTHING_TOKEN: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_REDIRECT_URI: z.string().url().optional(),
  DEFAULT_AI_PROVIDER: z.enum(["anthropic", "openai", "google"]).optional(),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function env(): Env {
  if (cached) return cached
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(
      `Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`
    )
  }
  cached = parsed.data
  return cached
}
