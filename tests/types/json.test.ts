import { assertEquals } from "@std/assert"
import { sourceFilesMatching } from "../support/source-files.ts"
import { parseJson } from "../../src/domain/service/json.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"

Deno.test("parseJson - parses a JSON object", () => {
  assertEquals(parseJson('{"a":1}'), ok({ a: 1 }))
})

Deno.test("parseJson - parses a JSON array", () => {
  assertEquals(parseJson("[1,2,3]"), ok([1, 2, 3]))
})

Deno.test("parseJson - parses a JSON string", () => {
  assertEquals(parseJson('"hello"'), ok("hello"))
})

Deno.test("parseJson - parses the literal JSON value null as a success", () => {
  assertEquals(parseJson("null"), ok(null))
})

Deno.test("parseJson - fails with malformed-json for malformed JSON", () => {
  assertEquals(parseJson("{not json"), failure("malformed-json"))
})

Deno.test("parseJson - fails with malformed-json for an empty string", () => {
  assertEquals(parseJson(""), failure("malformed-json"))
})

Deno.test("parseJson - reads an escaped surrogate pair as the one character it encodes", () => {
  assertEquals(parseJson('"\\ud83d\\ude00"'), ok("\u{1f600}"))
})

for (
  const [scenario, text] of [
    ["an escaped high surrogate with no low surrogate after it", '"\\ud800"'],
    ["an escaped low surrogate with no high surrogate before it", '["a", "\\udc00b"]'],
    ["an escaped lone surrogate in an object key", '{"\\udbff": 1}'],
    ["an escaped lone surrogate deep in nested values", '{"a": [{"b": ["\\ud83d"]}]}'],
    ["a raw lone surrogate in the text itself", '"\ud800"'],
  ] as const
) {
  Deno.test(`parseJson - fails with malformed-json for ${scenario} (shared ADR-0104)`, () => {
    assertEquals(parseJson(text), failure("malformed-json"))
  })
}

Deno.test("parseJson - keeps an escaped backslash followed by u-d-8 as text, not a surrogate", () => {
  assertEquals(parseJson('"\\\\ud800"'), ok("\\ud800"))
})

for (
  const [scenario, text] of [
    ["an object key that is only an escaped NUL", '{"\\u0000": 1}'],
    ["an object key that starts with an escaped NUL", '{"\\u0000a": 1}'],
    ["a nested object key that starts with an escaped NUL", '[{"a": {"\\u0000b": 1}}]'],
  ] as const
) {
  Deno.test(`parseJson - fails with malformed-json for ${scenario} (shared ADR-0104)`, () => {
    assertEquals(parseJson(text), failure("malformed-json"))
  })
}

Deno.test("parseJson - reads an object key holding NUL after its first character", () => {
  assertEquals(parseJson('{"a\\u0000": 1}'), ok({ "a\0": 1 }))
})

Deno.test("parseJson - reads a string value that starts with NUL", () => {
  assertEquals(parseJson('{"a": "\\u0000b"}'), ok({ a: "\0b" }))
})

Deno.test("parseJson - keeps an escaped backslash followed by u-0-0-0-0 in a key as text, not a NUL", () => {
  assertEquals(parseJson('{"\\\\u0000": 1}'), ok({ "\\u0000": 1 }))
})

Deno.test("parseJson - is the one reader of JSON text in the source (ADR-0004)", async () => {
  assertEquals(await sourceFilesMatching(/JSON\.parse\(/), ["domain/service/json.ts"])
})
