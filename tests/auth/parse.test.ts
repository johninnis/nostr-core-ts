import { assertEquals } from "@std/assert"
import { base64 } from "@scure/base"
import { parseAuthHeader } from "../../src/domain/service/auth-header.ts"
import { KIND_HTTP_AUTH } from "../../src/domain/value-object/kinds.ts"
import { failure } from "../../src/domain/value-object/result.ts"
import type { AuthHeaderDecodeFailure } from "../../src/domain/failure/auth-header-decode-failure.ts"

const headerEventJson = JSON.stringify({
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1,
  kind: KIND_HTTP_AUTH,
  tags: [],
  content: "X",
  sig: "c".repeat(128),
})

const headerOf = (bytes: Uint8Array): string => "Nostr " + base64.encode(bytes)

Deno.test("parseAuthHeader - rejects credentials that are not valid UTF-8 as bad JSON, never decoding them lossily", () => {
  const bytes = new TextEncoder().encode(headerEventJson)
  bytes[bytes.indexOf(0x58)] = 0xff
  assertEquals(parseAuthHeader(headerOf(bytes)), failure("header-bad-json"))
})

Deno.test("parseAuthHeader - rejects credentials led by a byte order mark as bad JSON", () => {
  const bytes = new TextEncoder().encode("\uFEFF" + headerEventJson)
  assertEquals(parseAuthHeader(headerOf(bytes)), failure("header-bad-json"))
})

Deno.test("parseAuthHeader - reads credentials holding multi-byte UTF-8", () => {
  const bytes = new TextEncoder().encode(headerEventJson.replace('"X"', '"caf\u00e9 \ud83d\ude00"'))
  const result = parseAuthHeader(headerOf(bytes))
  assertEquals(result.success ? result.value.content : result.error, "caf\u00e9 \ud83d\ude00")
})

Deno.test("parseAuthHeader - rejects empty header", () => {
  const result = parseAuthHeader("")
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error, "header-bad-prefix")
})

Deno.test("parseAuthHeader - rejects header without 'Nostr ' prefix", () => {
  const result = parseAuthHeader("Bearer xyz")
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error, "header-bad-prefix")
})

Deno.test("parseAuthHeader - rejects oversized header", () => {
  const huge = "Nostr " + "A".repeat(8000)
  const result = parseAuthHeader(huge)
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error, "header-too-long")
})

Deno.test("parseAuthHeader - rejects malformed base64", () => {
  const result = parseAuthHeader("Nostr !!!!not-base64!!!!")
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error, "header-bad-base64")
})

Deno.test("parseAuthHeader - rejects valid base64 of invalid JSON", () => {
  const garbage = base64.encode(new TextEncoder().encode("{not json"))
  const result = parseAuthHeader("Nostr " + garbage)
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error, "header-bad-json")
})

Deno.test("parseAuthHeader - rejects valid JSON of wrong event shape", () => {
  const json = base64.encode(new TextEncoder().encode(JSON.stringify({ foo: "bar" })))
  const result = parseAuthHeader("Nostr " + json)
  assertEquals(result.success, false)
  if (!result.success) assertEquals(result.error, "header-bad-event")
})

Deno.test("AuthHeaderDecodeFailure - is the literal returned from parseAuthHeader on a bad header", () => {
  const result = parseAuthHeader("not-a-nostr-header")
  const expected: AuthHeaderDecodeFailure = "header-bad-prefix"
  assertEquals(result, { success: false, error: expected })
})
