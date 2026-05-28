import { assertEquals } from "@std/assert"
import { base64 } from "@scure/base"
import { schnorr } from "@noble/curves/secp256k1"
import { bytesToHex } from "@noble/hashes/utils"
import { sha256Hex } from "../../src/domain/service/sha256.ts"
import { KIND_HTTP_AUTH, KIND_SHORT_NOTE } from "../../src/domain/value-object/kinds.ts"
import { defaultLocalSignerTools, generateSecretKey } from "../../src/infrastructure/adapter/local-signer-adapter.ts"
import { createLocalSigner } from "../../src/infrastructure/adapter/local-signer-adapter.ts"
import type { Signer } from "../../src/domain/service/signer.ts"
import type { NostrEvent, UnsignedEvent } from "../../src/domain/value-object/nostr-event.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"
import { parseSig } from "../../src/domain/value-object/sig.ts"
import type { EventId } from "../../src/domain/value-object/event-id.ts"
import { now } from "../../src/domain/value-object/timestamp.ts"
import { createNip98Validator, parseAuthHeader } from "../../src/domain/service/nip98-validator.ts"
import type { Nip98ReplayGuard } from "../../src/domain/service/nip98-validator.ts"
import { Nip98ValidationError } from "../../src/domain/exception/nip98-validation-error.ts"

const sign = (signer: Signer, template: UnsignedEvent): Promise<NostrEvent> => signer.signEvent(template)

const makeKeypair = () => {
  const sk = generateSecretKey()
  const pubkey = parsePublicKey(bytesToHex(schnorr.getPublicKey(sk)))
  const signer = createLocalSigner(sk, defaultLocalSignerTools)
  return { sk, pubkey, signer }
}

const makeReplayGuard = (): Nip98ReplayGuard & { seen: Set<string> } => {
  const seen = new Set<string>()
  return {
    seen,
    recordOnce: (eventId: EventId): Promise<boolean> => {
      if (seen.has(eventId)) return Promise.resolve(false)
      seen.add(eventId)
      return Promise.resolve(true)
    },
  }
}

const signAuth = async (
  signer: Signer,
  opts: { url: string; method: string; payloadHash?: string; createdAt?: number },
) => {
  const tags: Array<[string, ...string[]]> = [
    ["u", opts.url],
    ["method", opts.method],
  ]
  if (opts.payloadHash !== undefined) tags.push(["payload", opts.payloadHash])
  return await sign(signer, {
    kind: KIND_HTTP_AUTH,
    created_at: opts.createdAt ?? now(),
    tags,
    content: "",
  })
}

Deno.test("validate - accepts a fresh, well-formed kind 27235 event", async () => {
  const { signer, pubkey } = makeKeypair()
  const guard = makeReplayGuard()
  const validator = createNip98Validator({ replayGuard: guard })
  const event = await signAuth(signer, { url: "https://relay.example/management", method: "POST" })

  const result = await validator.validate({ event, url: "https://relay.example/management", method: "POST" })
  assertEquals(result.success, true)
  if (result.success) assertEquals(result.value, pubkey)
})

Deno.test("validate - rejects wrong kind", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator({ replayGuard: makeReplayGuard() })
  const event = await sign(signer, {
    kind: KIND_SHORT_NOTE,
    created_at: now(),
    tags: [["u", "https://relay.example"], ["method", "POST"]],
    content: "",
  })

  const result = await validator.validate({ event, url: "https://relay.example", method: "POST" })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "kind")
})

Deno.test("validate - rejects timestamp outside tolerance", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator({ replayGuard: makeReplayGuard(), timestampTolerance: 60 })
  const event = await signAuth(signer, {
    url: "https://relay.example",
    method: "POST",
    createdAt: now() - 600,
  })

  const result = await validator.validate({ event, url: "https://relay.example", method: "POST" })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "timestamp")
})

Deno.test("validate - rejects missing u tag", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator({ replayGuard: makeReplayGuard() })
  const event = await sign(signer, {
    kind: KIND_HTTP_AUTH,
    created_at: now(),
    tags: [["method", "POST"]],
    content: "",
  })

  const result = await validator.validate({ event, url: "https://relay.example", method: "POST" })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "u-missing")
})

Deno.test("validate - rejects u tag URL mismatch", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator({ replayGuard: makeReplayGuard() })
  const event = await signAuth(signer, { url: "https://different.example", method: "POST" })

  const result = await validator.validate({ event, url: "https://relay.example", method: "POST" })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "u-mismatch")
})

Deno.test("validate - accepts equivalent URLs with default-port normalisation", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator({ replayGuard: makeReplayGuard() })
  const event = await signAuth(signer, { url: "https://relay.example/path", method: "POST" })

  const result = await validator.validate({ event, url: "https://relay.example:443/path", method: "POST" })
  assertEquals(result.success, true)
})

Deno.test("validate - rejects missing method tag", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator({ replayGuard: makeReplayGuard() })
  const event = await sign(signer, {
    kind: KIND_HTTP_AUTH,
    created_at: now(),
    tags: [["u", "https://relay.example"]],
    content: "",
  })

  const result = await validator.validate({ event, url: "https://relay.example", method: "POST" })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "method-missing")
})

Deno.test("validate - method match is case-insensitive", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator({ replayGuard: makeReplayGuard() })
  const event = await signAuth(signer, { url: "https://relay.example", method: "post" })

  const result = await validator.validate({ event, url: "https://relay.example", method: "POST" })
  assertEquals(result.success, true)
})

Deno.test("validate - rejects payload tag when no body hash provided", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator({ replayGuard: makeReplayGuard() })
  const bodyHash = await sha256Hex("hello")
  const event = await signAuth(signer, { url: "https://relay.example", method: "POST", payloadHash: bodyHash })

  const result = await validator.validate({ event, url: "https://relay.example", method: "POST" })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "payload-unexpected")
})

Deno.test("validate - rejects missing payload tag when body hash is provided", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator({ replayGuard: makeReplayGuard() })
  const event = await signAuth(signer, { url: "https://relay.example", method: "POST" })
  const bodyHash = await sha256Hex("hello")

  const result = await validator.validate({ event, url: "https://relay.example", method: "POST", bodyHash })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "payload-missing")
})

Deno.test("validate - accepts matching payload hash", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator({ replayGuard: makeReplayGuard() })
  const body = '{"jsonrpc":"2.0","method":"getstats"}'
  const bodyHash = await sha256Hex(body)
  const event = await signAuth(signer, { url: "https://relay.example", method: "POST", payloadHash: bodyHash })

  const result = await validator.validate({ event, url: "https://relay.example", method: "POST", bodyHash })
  assertEquals(result.success, true)
})

Deno.test("validate - rejects payload hash mismatch", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator({ replayGuard: makeReplayGuard() })
  const eventBodyHash = await sha256Hex("event body")
  const event = await signAuth(signer, {
    url: "https://relay.example",
    method: "POST",
    payloadHash: eventBodyHash,
  })
  const requestBodyHash = await sha256Hex("different body")

  const result = await validator.validate({
    event,
    url: "https://relay.example",
    method: "POST",
    bodyHash: requestBodyHash,
  })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "payload-mismatch")
})

Deno.test("validate - rejects tampered signature", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator({ replayGuard: makeReplayGuard() })
  const event = await signAuth(signer, { url: "https://relay.example", method: "POST" })
  const tampered = { ...event, sig: parseSig("0".repeat(128)) }

  const result = await validator.validate({ event: tampered, url: "https://relay.example", method: "POST" })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "signature")
})

Deno.test("validate - rejects replay (same event id seen twice)", async () => {
  const { signer } = makeKeypair()
  const guard = makeReplayGuard()
  const validator = createNip98Validator({ replayGuard: guard })
  const event = await signAuth(signer, { url: "https://relay.example", method: "POST" })

  const first = await validator.validate({ event, url: "https://relay.example", method: "POST" })
  assertEquals(first.success, true)
  const second = await validator.validate({ event, url: "https://relay.example", method: "POST" })
  assertEquals(second.success, false)
  if (!second.success) assertEquals(second.error.tag, "replay")
})

Deno.test("validateAuthHeader - round-trips a signed event through the Authorization header", async () => {
  const { signer, pubkey } = makeKeypair()
  const validator = createNip98Validator({ replayGuard: makeReplayGuard() })
  const event = await signAuth(signer, { url: "https://relay.example", method: "POST" })
  const header = "Nostr " + base64.encode(new TextEncoder().encode(JSON.stringify(event)))

  const result = await validator.validateAuthHeader({
    authHeader: header,
    url: "https://relay.example",
    method: "POST",
    body: "",
  })
  assertEquals(result.success, true)
  if (result.success) assertEquals(result.value, pubkey)
})

Deno.test("validateAuthHeader - hashes the body and matches the payload tag", async () => {
  const { signer, pubkey } = makeKeypair()
  const validator = createNip98Validator({ replayGuard: makeReplayGuard() })
  const body = '{"a":1}'
  const bodyHash = await sha256Hex(body)
  const event = await signAuth(signer, { url: "https://relay.example", method: "POST", payloadHash: bodyHash })
  const header = "Nostr " + base64.encode(new TextEncoder().encode(JSON.stringify(event)))

  const result = await validator.validateAuthHeader({
    authHeader: header,
    url: "https://relay.example",
    method: "POST",
    body,
  })
  assertEquals(result.success, true)
  if (result.success) assertEquals(result.value, pubkey)
})

Deno.test("parseAuthHeader - rejects empty header", () => {
  const result = parseAuthHeader("")
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "header-bad-prefix")
})

Deno.test("parseAuthHeader - rejects header without 'Nostr ' prefix", () => {
  const result = parseAuthHeader("Bearer xyz")
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "header-bad-prefix")
})

Deno.test("parseAuthHeader - rejects oversized header", () => {
  const huge = "Nostr " + "A".repeat(8000)
  const result = parseAuthHeader(huge)
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "header-too-long")
})

Deno.test("parseAuthHeader - rejects malformed base64", () => {
  const result = parseAuthHeader("Nostr !!!!not-base64!!!!")
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "header-bad-base64")
})

Deno.test("parseAuthHeader - rejects valid base64 of invalid JSON", () => {
  const garbage = base64.encode(new TextEncoder().encode("{not json"))
  const result = parseAuthHeader("Nostr " + garbage)
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "header-bad-json")
})

Deno.test("parseAuthHeader - rejects valid JSON of wrong event shape", () => {
  const json = base64.encode(new TextEncoder().encode(JSON.stringify({ foo: "bar" })))
  const result = parseAuthHeader("Nostr " + json)
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error.tag, "header-bad-event")
})

Deno.test("Nip98ValidationError - is the error class returned from parseAuthHeader on a bad header", () => {
  const result = parseAuthHeader("not-a-nostr-header")
  assertEquals(result.success, false)
  if (!result.success) {
    assertEquals(result.error instanceof Nip98ValidationError, true)
    assertEquals(result.error.tag, "header-bad-prefix")
  }
})
