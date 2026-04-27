import { createRouteHandler } from "uploadthing/next"
import { appFileRouter } from "@workspace/storage/router"

export const runtime = "nodejs"

export const { GET, POST } = createRouteHandler({ router: appFileRouter })
