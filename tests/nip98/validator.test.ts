import { assertEquals } from "@std/assert"
import { base64 } from "@scure/base"
import { schnorr } from "@noble/curves/secp256k1"
import { bytesToHex } from "@noble/hashes/utils"
import { sha256Hex } from "../../src/domain/service/sha256.ts"
import { KIND_HTTP_AUTH, KIND_TEXT_NOTE } from "../../src/domain/value-object/kinds.ts"
import { createLocalSigner, defaultLocalSignerTools } from "../../src/infrastructure/crypto/local-signer.ts"
import type { Signer } from "../../src/domain/service/signer.ts"
import type { NostrEvent, UnsignedEvent } from "../../src/domain/value-object/nostr-event.ts"
import type { EventId } from "../../src/domain/value-object/event-id.ts"
import {
  createNip98Validator,
  DEFAULT_TIMESTAMP_TOLERANCE_SECONDS,
} from "../../src/application/service/nip98-validator.ts"
import { parseAuthHeader } from "../../src/domain/service/auth-header.ts"
import type { Nip98ReplayGuard } from "../../src/application/port/nip98-replay-guard.ts"
import type { Nip98ValidationFailure } from "../../src/domain/failure/nip98-validation-failure.ts"
import type { AuthHeaderDecodeFailure } from "../../src/domain/failure/auth-header-decode-failure.ts"
import { failure } from "../../src/domain/value-object/result.ts"
import { httpUrlFixture, publicKeyFixture, sigFixture } from "../../testing.ts"
import { secretKeyOf } from "../support/keys.ts"

const RELAY_URL = httpUrlFixture("https://relay.example/")
const MANAGEMENT_URL = httpUrlFixture("https://relay.example/management")

const NOW = 1800000000

const sign = async (signer: Signer, template: UnsignedEvent): Promise<NostrEvent> => {
  const signed = await signer.signEvent(template)
  if (!signed.success) throw new Error(`local signer failed: ${signed.error.message}`)
  return signed.value
}

const makeKeypair = () => {
  const sk = secretKeyOf(0x11)
  const pubkey = publicKeyFixture(bytesToHex(schnorr.getPublicKey(sk)))
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
  opts: { url: string; method: string; payloadHash?: string; createdAt?: number; expirations?: ReadonlyArray<string> },
) => {
  const tags: Array<[string, ...string[]]> = [
    ["u", opts.url],
    ["method", opts.method],
  ]
  if (opts.payloadHash !== undefined) tags.push(["payload", opts.payloadHash])
  for (const expiration of opts.expirations ?? []) tags.push(["expiration", expiration])
  return await sign(signer, {
    kind: KIND_HTTP_AUTH,
    created_at: opts.createdAt ?? NOW,
    tags,
    content: "",
  })
}

Deno.test("validate - accepts a fresh, well-formed kind 27235 event", async () => {
  const { signer, pubkey } = makeKeypair()
  const guard = makeReplayGuard()
  const validator = createNip98Validator(guard, DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const event = await signAuth(signer, { url: "https://relay.example/management", method: "POST" })

  const result = await validator.validate({ event, url: MANAGEMENT_URL, method: "POST" })
  assertEquals(result.success, true)
  if (result.success) assertEquals(result.value, pubkey)
})

Deno.test("validate - rejects wrong kind", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const event = await sign(signer, {
    kind: KIND_TEXT_NOTE,
    created_at: NOW,
    tags: [["u", "https://relay.example"], ["method", "POST"]],
    content: "",
  })

  const result = await validator.validate({ event, url: RELAY_URL, method: "POST" })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error, "kind")
})

Deno.test("validate - rejects timestamp outside tolerance", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), 60, () => NOW)
  const event = await signAuth(signer, {
    url: RELAY_URL,
    method: "POST",
    createdAt: NOW - 600,
  })

  const result = await validator.validate({ event, url: RELAY_URL, method: "POST" })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error, "timestamp")
})

Deno.test("validate - without a timestampTolerance accepts an event 60 seconds old and refuses one 61 seconds old (shared ADR-0097)", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => 1700000000)
  const at = async (createdAt: number) =>
    (await validator.validate({
      event: await signAuth(signer, { url: RELAY_URL, method: "POST", createdAt }),
      url: RELAY_URL,
      method: "POST",
    })).success
  const tolerance = DEFAULT_TIMESTAMP_TOLERANCE_SECONDS
  assertEquals([tolerance, await at(1700000000 - tolerance), await at(1700000000 - tolerance - 1)], [60, true, false])
})

Deno.test("validate - rejects missing u tag", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const event = await sign(signer, {
    kind: KIND_HTTP_AUTH,
    created_at: NOW,
    tags: [["method", "POST"]],
    content: "",
  })

  const result = await validator.validate({ event, url: RELAY_URL, method: "POST" })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error, "u-missing")
})

Deno.test("validate - rejects u tag URL mismatch", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const event = await signAuth(signer, { url: "https://different.example", method: "POST" })

  const result = await validator.validate({ event, url: RELAY_URL, method: "POST" })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error, "u-mismatch")
})

Deno.test("validate - accepts equivalent URLs with default-port normalisation", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const event = await signAuth(signer, { url: "https://relay.example:443/path", method: "POST" })

  const result = await validator.validate({ event, url: httpUrlFixture("https://relay.example/path"), method: "POST" })
  assertEquals(result.success, true)
})

Deno.test("validate - rejects missing method tag", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const event = await sign(signer, {
    kind: KIND_HTTP_AUTH,
    created_at: NOW,
    tags: [["u", "https://relay.example"]],
    content: "",
  })

  const result = await validator.validate({ event, url: RELAY_URL, method: "POST" })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error, "method-missing")
})

Deno.test('validate - refuses a method tag in another case, since RFC 9110 says "The method token is case-sensitive"', async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const event = await signAuth(signer, { url: RELAY_URL, method: "post" })

  const result = await validator.validate({ event, url: RELAY_URL, method: "POST" })
  assertEquals(result, failure("method-mismatch"))
})

Deno.test("validate - rejects payload tag when no body hash provided", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const bodyHash = sha256Hex("hello")
  const event = await signAuth(signer, {
    url: RELAY_URL,
    method: "POST",
    payloadHash: bodyHash,
  })

  const result = await validator.validate({ event, url: RELAY_URL, method: "POST" })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error, "payload-unexpected")
})

Deno.test("validate - rejects missing payload tag when body hash is provided", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const event = await signAuth(signer, { url: RELAY_URL, method: "POST" })
  const bodyHash = sha256Hex("hello")

  const result = await validator.validate({ event, url: RELAY_URL, method: "POST", bodyHash })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error, "payload-missing")
})

Deno.test("validate - accepts matching payload hash", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const body = '{"jsonrpc":"2.0","method":"getstats"}'
  const bodyHash = sha256Hex(body)
  const event = await signAuth(signer, {
    url: RELAY_URL,
    method: "POST",
    payloadHash: bodyHash,
  })

  const result = await validator.validate({ event, url: RELAY_URL, method: "POST", bodyHash })
  assertEquals(result.success, true)
})

Deno.test("validate - rejects payload hash mismatch", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const eventBodyHash = sha256Hex("event body")
  const event = await signAuth(signer, {
    url: RELAY_URL,
    method: "POST",
    payloadHash: eventBodyHash,
  })
  const requestBodyHash = sha256Hex("different body")

  const result = await validator.validate({ event, url: RELAY_URL, method: "POST", bodyHash: requestBodyHash })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error, "payload-mismatch")
})

Deno.test("validate - rejects a payload tag whose hex is upper-case, since NIP-98 states the hash as lowercase hex", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const bodyHash = sha256Hex('{"a":1}')
  const event = await signAuth(signer, {
    url: RELAY_URL,
    method: "POST",
    payloadHash: bodyHash.toUpperCase(),
  })

  const result = await validator.validate({ event, url: RELAY_URL, method: "POST", bodyHash })
  assertEquals(!result.success && result.error, "payload-mismatch")
})

Deno.test("validateAuthHeader - rejects a payload tag whose hex is upper-case", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const body = '{"a":1}'
  const event = await signAuth(signer, {
    url: RELAY_URL,
    method: "POST",
    payloadHash: sha256Hex(body).toUpperCase(),
  })
  const header = "Nostr " + base64.encode(new TextEncoder().encode(JSON.stringify(event)))

  const result = await validator.validateAuthHeader({ authHeader: header, url: RELAY_URL, method: "POST", body })
  assertEquals(!result.success && result.error, "payload-mismatch")
})

Deno.test("validate - rejects tampered signature", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const event = await signAuth(signer, { url: RELAY_URL, method: "POST" })
  const tampered = { ...event, sig: sigFixture("0".repeat(128)) }

  const result = await validator.validate({ event: tampered, url: RELAY_URL, method: "POST" })
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error, "signature")
})

Deno.test("validate - rejects replay (same event id seen twice)", async () => {
  const { signer } = makeKeypair()
  const guard = makeReplayGuard()
  const validator = createNip98Validator(guard, DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const event = await signAuth(signer, { url: RELAY_URL, method: "POST" })

  const first = await validator.validate({ event, url: RELAY_URL, method: "POST" })
  assertEquals(first.success, true)
  const second = await validator.validate({ event, url: RELAY_URL, method: "POST" })
  assertEquals(second.success, false)
  if (!second.success) assertEquals(second.error, "replay")
})

Deno.test("validateAuthHeader - round-trips a signed event through the Authorization header", async () => {
  const { signer, pubkey } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const event = await signAuth(signer, { url: RELAY_URL, method: "POST" })
  const header = "Nostr " + base64.encode(new TextEncoder().encode(JSON.stringify(event)))

  const result = await validator.validateAuthHeader({ authHeader: header, url: RELAY_URL, method: "POST", body: "" })
  assertEquals(result.success, true)
  if (result.success) assertEquals(result.value, pubkey)
})

Deno.test("validateAuthHeader - hashes the body and matches the payload tag", async () => {
  const { signer, pubkey } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const body = '{"a":1}'
  const bodyHash = sha256Hex(body)
  const event = await signAuth(signer, {
    url: RELAY_URL,
    method: "POST",
    payloadHash: bodyHash,
  })
  const header = "Nostr " + base64.encode(new TextEncoder().encode(JSON.stringify(event)))

  const result = await validator.validateAuthHeader({ authHeader: header, url: RELAY_URL, method: "POST", body })
  assertEquals(result.success, true)
  if (result.success) assertEquals(result.value, pubkey)
})

const headerFor = (event: NostrEvent, scheme = "Nostr"): string =>
  `${scheme} ${base64.encode(new TextEncoder().encode(JSON.stringify(event)))}`

Deno.test("parseAuthHeader - matches the Nostr scheme token without regard to case (RFC 9110 §11.1)", async () => {
  const { signer } = makeKeypair()
  const event = await signAuth(signer, { url: RELAY_URL, method: "GET" })
  for (const scheme of ["Nostr", "nostr", "NOSTR", "nOsTr"]) {
    assertEquals(parseAuthHeader(headerFor(event, scheme)), { success: true, value: event }, scheme)
  }
})

Deno.test("parseAuthHeader - reads the credentials after the scheme exactly", async () => {
  const { signer } = makeKeypair()
  const event = await signAuth(signer, { url: RELAY_URL, method: "GET" })
  assertEquals(parseAuthHeader(headerFor(event, "Nostr ")), { success: false, error: "header-bad-base64" })
})

Deno.test("validateAuthHeader - reports a decode failure and a validation failure from their own vocabularies", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const decode = await validator.validateAuthHeader({
    authHeader: "Bearer x",
    url: httpUrlFixture("https://a.example"),
    method: "GET",
    body: "",
  })
  const event = await signAuth(signer, { url: RELAY_URL, method: "GET" })
  const validation = await validator.validateAuthHeader({
    authHeader: headerFor(event),
    url: RELAY_URL,
    method: "POST",
    body: "",
  })
  const expected: Array<AuthHeaderDecodeFailure | Nip98ValidationFailure | null> = [
    "header-bad-prefix",
    "method-mismatch",
  ]
  assertEquals([decode, validation].map((r) => r.success ? null : r.error), expected)
})

Deno.test("validate - refuses an event once any of its expiration tags has passed (NIP-40)", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const current = NOW
  const event = await signAuth(signer, {
    url: RELAY_URL,
    method: "GET",
    expirations: [String(current + 600), String(current - 1)],
  })
  const result = await validator.validate({ event, url: RELAY_URL, method: "GET" })
  assertEquals(result.success ? null : result.error, "expired")
})

Deno.test("validate - ignores an expiration value that is not a timestamp", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const event = await signAuth(signer, {
    url: RELAY_URL,
    method: "GET",
    expirations: ["soon"],
  })
  const result = await validator.validate({ event, url: RELAY_URL, method: "GET" })
  assertEquals(result.success, true)
})

Deno.test("validateAuthHeader - rejects a payload tag carrying the empty-string hash on an empty body", async () => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const event = await signAuth(signer, {
    url: RELAY_URL,
    method: "POST",
    payloadHash: sha256Hex(""),
  })
  const header = "Nostr " + base64.encode(new TextEncoder().encode(JSON.stringify(event)))

  const result = await validator.validateAuthHeader({ authHeader: header, url: RELAY_URL, method: "POST", body: "" })
  assertEquals(!result.success && result.error, "payload-unexpected")
})

const validateTags = async (
  tags: Array<[string, ...string[]]>,
  bodyHash?: string,
): Promise<string | true> => {
  const { signer } = makeKeypair()
  const validator = createNip98Validator(makeReplayGuard(), DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => NOW)
  const event = await sign(signer, { kind: KIND_HTTP_AUTH, created_at: NOW, tags, content: "" })
  const result = await validator.validate({
    event,
    url: httpUrlFixture("https://relay.example/x"),
    method: "POST",
    bodyHash,
  })
  return result.success ? true : result.error
}

Deno.test("validate - reads repeated identical u, method and payload tags as one claim each (shared ADR-0014)", async () => {
  const hash = sha256Hex("body")
  const tags: Array<[string, ...string[]]> = [
    ["u", "https://relay.example/x"],
    ["u", "https://relay.example/x"],
    ["method", "POST"],
    ["method", "POST"],
    ["payload", hash],
    ["payload", hash],
  ]
  assertEquals(await validateTags(tags, hash), true)
})

Deno.test("validate - refuses u tags that state different values", async () => {
  assertEquals(
    await validateTags([["u", "https://relay.example/x"], ["u", "https://relay.example/y"], ["method", "POST"]]),
    "u-disagreeing",
  )
})

Deno.test("validate - refuses method tags that state different values, even when they differ only in case", async () => {
  assertEquals(
    await validateTags([["u", "https://relay.example/x"], ["method", "POST"], ["method", "post"]]),
    "method-disagreeing",
  )
})

Deno.test("validate - refuses payload tags that state different values", async () => {
  const hash = sha256Hex("body")
  assertEquals(
    await validateTags([["u", "https://relay.example/x"], ["method", "POST"], ["payload", hash], [
      "payload",
      sha256Hex("other"),
    ]], hash),
    "payload-disagreeing",
  )
})

Deno.test("validate - an empty payload tag is still a payload tag, so it is refused without a body", async () => {
  assertEquals(
    await validateTags([["u", "https://relay.example/x"], ["method", "POST"], ["payload", ""]]),
    "payload-unexpected",
  )
})

Deno.test("validate - the empty body's hash is no body, so it admits no payload tag (shared ADR-0024)", async () => {
  const emptyBodyHash = sha256Hex("")
  assertEquals(
    await validateTags(
      [["u", "https://relay.example/x"], ["method", "POST"], ["payload", emptyBodyHash]],
      emptyBodyHash,
    ),
    "payload-unexpected",
  )
})

Deno.test("validate - the empty body's hash is no body, so it demands no payload tag (shared ADR-0024)", async () => {
  assertEquals(await validateTags([["u", "https://relay.example/x"], ["method", "POST"]], sha256Hex("")), true)
})
