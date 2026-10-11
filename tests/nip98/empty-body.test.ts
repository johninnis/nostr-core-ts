import { assertEquals } from "@std/assert"
import { base64 } from "@scure/base"
import {
  createNip98Validator,
  DEFAULT_TIMESTAMP_TOLERANCE_SECONDS,
} from "../../src/application/service/nip98-validator.ts"
import type { Nip98ReplayGuard } from "../../src/application/port/nip98-replay-guard.ts"
import type { Nip98ValidationFailure } from "../../src/domain/failure/nip98-validation-failure.ts"
import { sha256Hex } from "../../src/domain/service/sha256.ts"
import { KIND_HTTP_AUTH } from "../../src/domain/value-object/kinds.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import { createLocalSigner } from "../../src/infrastructure/crypto/local-signer.ts"
import { secretKeyOf } from "../support/keys.ts"
import { httpUrlFixture } from "../../testing.ts"

const AT = 1800000000

const REQUEST_URL = httpUrlFixture("https://relay.example/x")

const EMPTY_BODY_HASH = sha256Hex("")

const acceptEveryEvent: Nip98ReplayGuard = { recordOnce: () => Promise.resolve(true) }

const validator = createNip98Validator(acceptEveryEvent, DEFAULT_TIMESTAMP_TOLERANCE_SECONDS, () => AT)

const signedAuth = async (payload?: string): Promise<NostrEvent> => {
  const binding: ReadonlyArray<readonly [string, string]> = [["u", REQUEST_URL], ["method", "POST"]]
  const signed = await createLocalSigner(secretKeyOf(0x11)).signEvent({
    kind: KIND_HTTP_AUTH,
    created_at: AT,
    tags: payload === undefined ? binding : [...binding, ["payload", payload]],
    content: "",
  })
  if (!signed.success) throw new Error("a local signer always signs")
  return signed.value
}

const outcome = async (payload?: string, bodyHash?: string): Promise<Nip98ValidationFailure | "accepted"> => {
  const result = await validator.validate({
    event: await signedAuth(payload),
    url: REQUEST_URL,
    method: "POST",
    bodyHash,
  })
  return result.success ? "accepted" : result.error
}

Deno.test("validate - the empty body's hash is no body, so it demands no payload tag (shared ADR-0024)", async () => {
  assertEquals(await outcome(undefined, EMPTY_BODY_HASH), "accepted")
})

Deno.test("validate - an empty body admits a payload tag holding the empty body's hash (shared ADR-0024)", async () => {
  assertEquals(await outcome(EMPTY_BODY_HASH, EMPTY_BODY_HASH), "accepted")
})

Deno.test("validate - no body admits a payload tag holding the empty body's hash (shared ADR-0024)", async () => {
  assertEquals(await outcome(EMPTY_BODY_HASH), "accepted")
})

Deno.test("validateAuthHeader - admits a payload tag carrying the empty-string hash on an empty body (shared ADR-0024)", async () => {
  const header = "Nostr " + base64.encode(new TextEncoder().encode(JSON.stringify(await signedAuth(EMPTY_BODY_HASH))))

  const result = await validator.validateAuthHeader({ authHeader: header, url: REQUEST_URL, method: "POST", body: "" })
  assertEquals(result.success, true)
})

Deno.test("validate - refuses a payload tag naming another body's hash without a body as a mismatch (shared ADR-0024)", async () => {
  assertEquals(await outcome(sha256Hex("hello")), "payload-mismatch")
})

Deno.test("validate - refuses a payload tag naming another body's hash on an empty body as a mismatch (shared ADR-0024)", async () => {
  assertEquals(await outcome(sha256Hex("hello"), EMPTY_BODY_HASH), "payload-mismatch")
})

Deno.test("validate - an empty payload tag is still a payload tag, so it is a mismatch without a body", async () => {
  assertEquals(await outcome(""), "payload-mismatch")
})

Deno.test("validate - an empty body refuses the empty body's hash in upper case as a mismatch (shared ADR-0024)", async () => {
  assertEquals(await outcome(EMPTY_BODY_HASH.toUpperCase()), "payload-mismatch")
})

Deno.test("Nip98ValidationFailure - has no failure of its own for a payload tag on an empty body (shared ADR-0024)", () => {
  // @ts-expect-error: a payload tag on an empty body is matched against the empty body's hash like any other
  const refusal: Nip98ValidationFailure = "payload-unexpected"
  assertEquals(refusal, "payload-unexpected")
})
