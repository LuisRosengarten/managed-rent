import { UTApi, UTFile } from "uploadthing/server"

let _api: UTApi | null = null

export function utApi() {
  if (_api) return _api
  const token = process.env.UPLOADTHING_TOKEN
  if (!token) throw new Error("UPLOADTHING_TOKEN is required")
  _api = new UTApi({ token })
  return _api
}

export async function uploadBuffer(
  buffer: Uint8Array,
  filename: string,
  mimeType: string
): Promise<{ key: string; url: string; size: number }> {
  const file = new UTFile([buffer as BufferSource], filename, { type: mimeType })
  const res = await utApi().uploadFiles([file])
  const first = res[0]
  if (!first || first.error || !first.data) {
    throw new Error(
      `Uploadthing upload failed: ${first?.error?.message ?? "unknown"}`
    )
  }
  return {
    key: first.data.key,
    url: first.data.ufsUrl,
    size: first.data.size,
  }
}

export async function deleteFile(key: string) {
  return utApi().deleteFiles([key])
}
