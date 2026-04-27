import test from "node:test"
import assert from "node:assert/strict"
import { resolveAssignment } from "./assignment.ts"
import { shouldApplyAiStatus } from "./listing-utils.ts"

test("resolveAssignment prefers hard matches over ai output", () => {
  const resolved = resolveAssignment({
    hardMatch: { type: "application", id: "app_1", reason: "conversation_key_match" },
    aiDecision: {
      target: "create_new",
      confidence: 0.99,
    },
    hasEnoughIdentity: true,
  })

  assert.deepEqual(resolved, {
    type: "application",
    id: "app_1",
    reason: "conversation_key_match",
  })
})

test("resolveAssignment falls back to unassigned without identity", () => {
  const resolved = resolveAssignment({
    hardMatch: null,
    aiDecision: {
      target: "unassigned",
      confidence: 0.2,
    },
    hasEnoughIdentity: false,
  })

  assert.deepEqual(resolved, {
    type: "unassigned",
    reason: "insufficient_identity",
  })
})

test("manual terminal statuses block ai overwrite", () => {
  assert.equal(
    shouldApplyAiStatus({ currentStatus: "rejected", statusSource: "manual" }),
    false
  )
  assert.equal(
    shouldApplyAiStatus({ currentStatus: "contacted", statusSource: "manual" }),
    true
  )
  assert.equal(
    shouldApplyAiStatus({ currentStatus: "accepted", statusSource: "ai" }),
    true
  )
})
