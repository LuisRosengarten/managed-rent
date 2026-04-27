export { runSync } from "./pipeline.ts"
export type { SyncStats } from "./pipeline.ts"
export {
  buildGmailAuthUrl,
  exchangeGmailCode,
  createGmailAdapter,
} from "./adapters/gmail.ts"
export {
  buildOutlookAuthUrl,
  exchangeOutlookCode,
  createOutlookAdapter,
} from "./adapters/outlook.ts"
export { createImapAdapter } from "./adapters/imap.ts"
