import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@workspace/auth"

export async function getSessionOrNull() {
  return auth().api.getSession({ headers: await headers() })
}

export async function requireSession() {
  const session = await getSessionOrNull()
  if (!session?.user) redirect("/login")
  return session
}
