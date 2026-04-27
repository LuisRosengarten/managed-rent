import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema.ts"

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function db() {
  if (_db) return _db
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is required")
  const sql = neon(url)
  _db = drizzle(sql, { schema, casing: "snake_case" })
  return _db
}

export type Database = ReturnType<typeof db>
