import { assertEquals } from "@std/assert"
import { tryParseJson } from "../../src/domain/value-object/json.ts"

Deno.test("tryParseJson - parses a JSON object", () => {
  assertEquals(tryParseJson('{"a":1}'), { a: 1 })
})

Deno.test("tryParseJson - parses a JSON array", () => {
  assertEquals(tryParseJson("[1,2,3]"), [1, 2, 3])
})

Deno.test("tryParseJson - returns null for malformed JSON", () => {
  assertEquals(tryParseJson("{not json"), null)
})

Deno.test("tryParseJson - returns null for empty string", () => {
  assertEquals(tryParseJson(""), null)
})

Deno.test("tryParseJson - parses a JSON string", () => {
  assertEquals(tryParseJson('"hello"'), "hello")
})

Deno.test("tryParseJson - returns null for the literal JSON value null (intentional collision: callers treat null as a parse failure)", () => {
  // This is a documented quirk: a successfully-parsed `null` is indistinguishable from a parse
  // failure. Callers that handle JSON envelopes never expect bare `null` payloads, so the
  // simpler signature is preferred over a `Result`-shaped helper.
  assertEquals(tryParseJson("null"), null)
})
