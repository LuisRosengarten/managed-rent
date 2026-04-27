import test from "node:test"
import assert from "node:assert/strict"
import { buildConversationKey } from "./parser.ts"
import { enrichMessageContent } from "./enrichment.ts"

test("enrichMessageContent includes email links and iframe content in analysis text", async () => {
  const html = `
    <html>
      <body>
        <p>Neue Wohnung</p>
        <a href="https://example.com/listing">Zur Anzeige</a>
        <iframe src="https://example.com/embed"></iframe>
      </body>
    </html>
  `

  const fetchImpl = async (url) =>
    new Response(
      url.includes("embed")
        ? "<html><body>Iframe Details 85m²</body></html>"
        : "<html><body>Portal Titel 3 Zimmer Berlin</body></html>",
      {
        status: 200,
        headers: { "content-type": "text/html" },
      }
    )

  const enriched = await enrichMessageContent(
    { bodyText: "Mail Vorschau", bodyHtml: html },
    {
      fetchImpl,
      resolveHostname: async () => [{ address: "93.184.216.34", family: 4 }],
    }
  )

  assert.equal(enriched.links.length, 1)
  assert.equal(enriched.iframes.length, 1)
  assert.match(enriched.analysisText, /Portal Titel 3 Zimmer Berlin/)
  assert.match(enriched.analysisText, /Iframe Details 85m²/)
})

test("buildConversationKey prefers thread id and falls back to references", () => {
  const withThread = buildConversationKey(
    { headers: new Map([["references", "<abc@example.com>"]]) },
    "provider-thread"
  )
  assert.equal(withThread, "thread:provider-thread")

  const byReferences = buildConversationKey(
    { headers: new Map([["references", "<abc@example.com> <def@example.com>"]]) },
    null
  )
  assert.equal(byReferences, "refs:abc@example.com|def@example.com")
})
