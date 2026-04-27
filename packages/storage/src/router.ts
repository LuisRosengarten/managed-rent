import { createUploadthing, type FileRouter } from "uploadthing/next"
import { UploadThingError } from "uploadthing/server"
import { auth } from "@workspace/auth"
import { headers } from "next/headers"

const f = createUploadthing()

export const appFileRouter = {
  // Profile documents: Schufa, income proof, ID, Mieterselbstauskunft etc.
  profileDocument: f({
    pdf: { maxFileSize: "16MB", maxFileCount: 10 },
    image: { maxFileSize: "8MB", maxFileCount: 10 },
  })
    .middleware(async () => {
      const session = await auth().api.getSession({ headers: await headers() })
      if (!session?.user) throw new UploadThingError("Unauthorized")
      return { userId: session.user.id }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return {
        uploadedBy: metadata.userId,
        key: file.key,
        url: file.ufsUrl,
      }
    }),
} satisfies FileRouter

export type AppFileRouter = typeof appFileRouter
