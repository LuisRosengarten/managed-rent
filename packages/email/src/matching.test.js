import test from "node:test"
import assert from "node:assert/strict"
import {
  isHardAliasMatch,
  scoreMatchCandidate,
  shouldAutoLink,
  shouldCreateReview,
} from "./matching.ts"
import { mergeIdentityWithHeuristics, normalizeTitleFingerprint } from "./identity-utils.ts"

test("hard alias match uses exact portal listing id", () => {
  const result = isHardAliasMatch({
    messageIdentity: {
      portalListingId: "abc-123",
      confidence: 1,
    },
    aliasIdentity: {
      portalListingId: "abc-123",
    },
  })

  assert.equal(result.matched, true)
  assert.equal(result.reason, "portal_listing_id")
})

test("weighted score enters review band for plausible but not exact match", () => {
  const score = scoreMatchCandidate({
    listingId: "listing-1",
    applicationId: "app-1",
    messageIdentity: {
      street: "Hauptstrasse 12",
      city: "Berlin",
      rentWarm: 1200,
      sizeSqm: 72,
      rooms: 2.5,
      confidence: 1,
    },
    candidateIdentity: {
      street: "Hauptstrasse 12",
      city: "Berlin",
      rentWarm: 1215,
      sizeSqm: 73,
      rooms: 2.5,
    },
  })

  assert.equal(shouldCreateReview(score.score), true)
  assert.equal(shouldAutoLink(score.score), false)
  assert.match(score.reasons.join(","), /address/)
})

test("matching auto-links when relay email and canonical url align", () => {
  const score = scoreMatchCandidate({
    listingId: "listing-2",
    applicationId: "app-2",
    messageIdentity: {
      canonicalListingUrl: "portal.example/listing/42",
      relayEmail: "listing-42@relay.portal.example",
      confidence: 1,
    },
    candidateIdentity: {
      canonicalListingUrl: "portal.example/listing/42",
      relayEmail: "listing-42@relay.portal.example",
    },
  })

  assert.equal(shouldAutoLink(score.score), false)
  const hard = isHardAliasMatch({
    messageIdentity: {
      canonicalListingUrl: "portal.example/listing/42",
      relayEmail: "listing-42@relay.portal.example",
      confidence: 1,
    },
    aliasIdentity: {
      canonicalListingUrl: "portal.example/listing/42",
      relayEmail: "listing-42@relay.portal.example",
    },
  })
  assert.equal(hard.matched, true)
})

test("identity heuristics normalize reply-to and sender details", () => {
  const merged = mergeIdentityWithHeuristics({
    extracted: {
      confidence: 0.4,
    },
    fromAddr: "vermieter@haus.de",
    rawHeaders: {
      "reply-to": "Kontakt <listing+42@reply.portal.de>",
      "delivered-to": "listing+42@relay.portal.de",
    },
  })

  assert.equal(merged.senderEmail, "vermieter@haus.de")
  assert.equal(merged.replyToEmail, "listing+42@reply.portal.de")
  assert.equal(merged.relayEmail, "listing+42@relay.portal.de")
})

test("title fingerprints are normalized aggressively", () => {
  assert.equal(
    normalizeTitleFingerprint("  Schoene 2-Zimmer-Wohnung!!  Berlin  "),
    "schoene 2 zimmer wohnung berlin"
  )
})
