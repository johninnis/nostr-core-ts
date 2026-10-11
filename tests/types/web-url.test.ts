import { assertEquals } from "@std/assert"
import { isValidWebUrl, parseWebUrl } from "../../src/domain/value-object/web-url.ts"

Deno.test("parseWebUrl - keeps a URL with an HttpUrl form exactly as written (shared ADR-0079, shared ADR-0090)", () => {
  assertEquals(parseWebUrl("HTTPS://Example.com:443/a.png#x"), "HTTPS://Example.com:443/a.png#x")
})

Deno.test("parseWebUrl - keeps a URL without a path without one", () => {
  assertEquals(parseWebUrl("https://x.example"), "https://x.example")
})

Deno.test("parseWebUrl - keeps a hash route as written", () => {
  assertEquals(parseWebUrl("https://x.example/#/post/1?a=B"), "https://x.example/#/post/1?a=B")
})

for (
  const url of [
    "",
    "ftp://example.com/a.png",
    "wss://relay.example.com/",
    "javascript:alert(1)#top",
    "constructor://example.com/a.png",
    "https://user@example.com/a.png",
    "https://example.com/a\u0085.png",
    "https://x.example/a#\u0085",
  ]
) {
  Deno.test(`parseWebUrl - ${JSON.stringify(url)} has no HttpUrl form, so it is no web URL`, () => {
    assertEquals(parseWebUrl(url), null)
  })
}

Deno.test("parseWebUrl - a value that is not a string is no web URL", () => {
  assertEquals(parseWebUrl(42), null)
})

Deno.test("isValidWebUrl - true for any URL with an HttpUrl form, however written", () => {
  assertEquals(isValidWebUrl("HTTPS://Example.com:443/a.png"), true)
})

Deno.test("isValidWebUrl - false for a URL with no HttpUrl form", () => {
  assertEquals(isValidWebUrl("data:image/png;base64,AAAA"), false)
})
