import { assertEquals } from "@std/assert"
import {
  encodeAuthHeader,
  encodeBlossomAuthHeader,
  parseAuthHeader,
  parseBlossomAuthHeader,
} from "../../src/domain/service/auth-header.ts"
import type { NostrEvent } from "../../src/domain/value-object/mod.ts"
import type { Result } from "../../src/domain/value-object/result.ts"
import type { AuthHeaderDecodeFailure } from "../../src/domain/failure/auth-header-decode-failure.ts"
import { eventIdFixture, publicKeyFixture, sigFixture } from "../../testing.ts"

interface BlossomAuthHeaderVectors {
  readonly vectors: ReadonlyArray<readonly [string, string]>
}

const VECTORS: BlossomAuthHeaderVectors = JSON.parse(
  await Deno.readTextFile(new URL("./blossom-auth-header-vectors.json", import.meta.url)),
)

const SPEC_FORM_HEADER = VECTORS.vectors[1]?.[0] ?? ""
const LEGACY_FORM_HEADER = VECTORS.vectors[2]?.[0] ?? ""

const outcomeOf = (result: Result<NostrEvent, AuthHeaderDecodeFailure>): string => {
  if (result.success) return result.value.id
  if (result.error === "header-bad-base64") return "bad-base64"
  if (result.error === "header-bad-json") return "bad-json"
  return result.error
}

const makeEvent = (content = ""): NostrEvent => ({
  kind: 24242,
  content,
  created_at: 1000,
  tags: [],
  id: eventIdFixture("a".repeat(64)),
  pubkey: publicKeyFixture("b".repeat(64)),
  sig: sigFixture("c".repeat(128)),
})

Deno.test("parseBlossomAuthHeader - gives every shared vector the outcome the PHP decodeBlossom gives it", () => {
  const disagreements = VECTORS.vectors.filter(([header, expected]) =>
    outcomeOf(parseBlossomAuthHeader(header)) !== expected
  )
  assertEquals(disagreements, [])
})

Deno.test("parseBlossomAuthHeader - the shared vectors are fully loaded", () => {
  assertEquals(VECTORS.vectors.length, 9)
})

Deno.test("encodeBlossomAuthHeader - writes the legacy form's event in the form BUD-11 writes", () => {
  const parsed = parseBlossomAuthHeader(LEGACY_FORM_HEADER)
  assertEquals(parsed.success ? encodeBlossomAuthHeader(parsed.value) : parsed.error, SPEC_FORM_HEADER)
})

Deno.test("parseAuthHeader - refuses the form BUD-11 writes, as NIP-98 is read only in padded standard base64", () => {
  assertEquals(outcomeOf(parseAuthHeader(SPEC_FORM_HEADER)), "bad-base64")
})

Deno.test("parseBlossomAuthHeader - reads the header encodeAuthHeader writes", () => {
  const event = makeEvent("Upload Blob (~10 MiB, ~3 s)")
  const parsed = parseBlossomAuthHeader(encodeAuthHeader(event) ?? "")
  assertEquals(parsed.success ? parsed.value : parsed.error, event)
})

Deno.test("parseBlossomAuthHeader - rejects a header over 4096 characters", () => {
  assertEquals(parseBlossomAuthHeader("Nostr " + "A".repeat(4096)), { success: false, error: "header-too-long" })
})

Deno.test("parseBlossomAuthHeader - rejects a header without the Nostr scheme", () => {
  assertEquals(parseBlossomAuthHeader("Bearer token"), { success: false, error: "header-bad-prefix" })
})

const MAX_HEADER_LENGTH = 4096

const contentLengthsAroundTheBound = (): readonly [number, number] => {
  let length = 0
  while ((encodeBlossomAuthHeader(makeEvent("a".repeat(length + 1)))?.length ?? Infinity) <= MAX_HEADER_LENGTH) length++
  return [length, length + 1]
}

const [longestContent, overlongContent] = contentLengthsAroundTheBound()

Deno.test("encodeBlossomAuthHeader - writes the longest header within 4096 characters, which parseBlossomAuthHeader reads", () => {
  const header = encodeBlossomAuthHeader(makeEvent("a".repeat(longestContent)))
  assertEquals(header === null ? null : parseBlossomAuthHeader(header).success, true)
})

Deno.test("encodeBlossomAuthHeader - returns null for a header longer than 4096 characters", () => {
  assertEquals(encodeBlossomAuthHeader(makeEvent("a".repeat(overlongContent))), null)
})
