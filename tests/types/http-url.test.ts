import { assertEquals } from "@std/assert"
import { isValidHttpUrl, parseHttpUrl } from "../../src/domain/value-object/http-url.ts"

interface HttpUrlVectors {
  readonly vectors: ReadonlyArray<readonly [string, string | null]>
}

const VECTORS: HttpUrlVectors = JSON.parse(await Deno.readTextFile(new URL("./http-url-vectors.json", import.meta.url)))

Deno.test("parseHttpUrl - gives every shared vector the form the PHP HttpUrl gives it", () => {
  const disagreements = VECTORS.vectors.filter(([input, expected]) => parseHttpUrl(input) !== expected)
  assertEquals(disagreements, [])
})

Deno.test("parseHttpUrl - resolves no dot segment", () => {
  assertEquals(parseHttpUrl("https://x.example/a/../b"), "https://x.example/a/../b")
})

Deno.test("parseHttpUrl - keeps an empty query apart from no query", () => {
  assertEquals([parseHttpUrl("https://x.example/a?"), parseHttpUrl("https://x.example/a")], [
    "https://x.example/a?",
    "https://x.example/a",
  ])
})

Deno.test("parseHttpUrl - percent-encodes nothing and decodes nothing", () => {
  assertEquals([parseHttpUrl("https://x.example/a b"), parseHttpUrl("https://x.example/%7e")], [
    "https://x.example/a b",
    "https://x.example/%7e",
  ])
})

Deno.test("parseHttpUrl - refuses a scheme other than http or https", () => {
  assertEquals(parseHttpUrl("ftp://x.example/a"), null)
})

Deno.test("parseHttpUrl - an IP literal with an IPv4 address before its :: is no IPv6 address", () => {
  assertEquals(parseHttpUrl("https://[1.2.3.4::]/"), null)
})

Deno.test("parseHttpUrl - is null for a value that is not a string", () => {
  assertEquals(parseHttpUrl(42), null)
})

Deno.test("isValidHttpUrl - is true for a URL already in its canonical form", () => {
  assertEquals(isValidHttpUrl("https://x.example/a?b"), true)
})

Deno.test("isValidHttpUrl - is false for a URL whose canonical form differs", () => {
  assertEquals(isValidHttpUrl("HTTPS://x.example:443/a"), false)
})
