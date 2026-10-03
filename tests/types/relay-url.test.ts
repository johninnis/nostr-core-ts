import { assertEquals } from "@std/assert"
import { isValidRelayUrl, parseRelayUrl, toRelayUrls } from "../../src/domain/value-object/relay-url.ts"

Deno.test("isValidRelayUrl - returns true for wss URL", () => {
  assertEquals(isValidRelayUrl("wss://relay.damus.io"), true)
})

Deno.test("isValidRelayUrl - returns true for ws URL", () => {
  assertEquals(isValidRelayUrl("ws://localhost:8080"), true)
})

Deno.test("isValidRelayUrl - returns false for https URL", () => {
  assertEquals(isValidRelayUrl("https://relay.damus.io"), false)
})

Deno.test("isValidRelayUrl - returns false for empty string", () => {
  assertEquals(isValidRelayUrl(""), false)
})

Deno.test("isValidRelayUrl - returns false for plain string", () => {
  assertEquals(isValidRelayUrl("relay.damus.io"), false)
})

Deno.test("isValidRelayUrl - returns false for wss with no host", () => {
  assertEquals(isValidRelayUrl("wss://"), false)
})

Deno.test("parseRelayUrl - returns branded RelayUrl for valid wss URL", () => {
  const url = parseRelayUrl("wss://relay.damus.io")
  assertEquals<string | null>(url, "wss://relay.damus.io")
})

Deno.test("parseRelayUrl - lowercases scheme and host", () => {
  const url = parseRelayUrl("WSS://Relay.DAMUS.io")
  assertEquals<string | null>(url, "wss://relay.damus.io")
})

Deno.test("parseRelayUrl - strips trailing slash", () => {
  const url = parseRelayUrl("wss://relay.damus.io/")
  assertEquals<string | null>(url, "wss://relay.damus.io")
})

Deno.test("parseRelayUrl - returns null for invalid URL", () => {
  assertEquals(parseRelayUrl("not-a-url"), null)
})

Deno.test("parseRelayUrl - returns null for empty string", () => {
  assertEquals(parseRelayUrl(""), null)
})

Deno.test("toRelayUrls - removes exact duplicates", () => {
  const out = toRelayUrls(["wss://a.example", "wss://a.example"])
  assertEquals<ReadonlyArray<string>>(out, ["wss://a.example"])
})

Deno.test("toRelayUrls - collapses trailing slash and case variants via parseRelayUrl", () => {
  const out = toRelayUrls(["wss://Relay.Example/", "wss://relay.example"])
  assertEquals<ReadonlyArray<string>>(out, ["wss://relay.example"])
})

Deno.test("toRelayUrls - filters out invalid URLs", () => {
  const out = toRelayUrls(["wss://ok.example", "not-a-url", "", null, undefined, "https://nope.example"])
  assertEquals<ReadonlyArray<string>>(out, ["wss://ok.example"])
})

Deno.test("toRelayUrls - preserves first-seen order", () => {
  const out = toRelayUrls(["wss://b.example", "wss://a.example", "wss://b.example"])
  assertEquals<ReadonlyArray<string>>(out, ["wss://b.example", "wss://a.example"])
})

Deno.test("toRelayUrls - returns empty array for empty input", () => {
  assertEquals<ReadonlyArray<string>>(toRelayUrls([]), [])
})

interface NormaliseVector {
  readonly name: string
  readonly input: string | null
  readonly expected: string | null
}

const VECTORS: ReadonlyArray<NormaliseVector> = JSON.parse(
  await Deno.readTextFile(new URL("./relay-url-vectors.json", import.meta.url)),
)

for (const v of VECTORS) {
  Deno.test(`parseRelayUrl - corpus: ${v.name}`, () => {
    assertEquals<string | null>(parseRelayUrl(v.input), v.expected)
  })
}

Deno.test("parseRelayUrl - is idempotent for every accepted corpus vector", () => {
  for (const v of VECTORS) {
    if (v.expected === null) continue
    assertEquals<string | null>(parseRelayUrl(v.expected), v.expected, v.name)
  }
})

Deno.test("isValidRelayUrl - accepts every canonical corpus output", () => {
  for (const v of VECTORS) {
    if (v.expected !== null) assertEquals(isValidRelayUrl(v.expected), true, v.name)
  }
})

Deno.test("isValidRelayUrl - returns false for a URL with a space in the host", () => {
  assertEquals(isValidRelayUrl("wss://relay example.com"), false)
})

Deno.test("isValidRelayUrl - returns false for a non-canonical URL", () => {
  assertEquals(isValidRelayUrl("wss://relay.damus.io/"), false)
})

Deno.test("parseRelayUrl - returns null for a URL with a space in the host", () => {
  assertEquals(parseRelayUrl("wss://relay example.com"), null)
})

Deno.test("parseRelayUrl - trims surrounding whitespace", () => {
  assertEquals<string | null>(parseRelayUrl("  wss://relay.damus.io  "), "wss://relay.damus.io")
})

Deno.test("parseRelayUrl - drops the slash before a query", () => {
  assertEquals<string | null>(
    parseRelayUrl("wss://relay.example.com/?auth=token"),
    "wss://relay.example.com?auth=token",
  )
})

Deno.test("parseRelayUrl - rejects a second URL in the query", () => {
  assertEquals(parseRelayUrl("wss://relay.example.com?next=wss://other.example"), null)
})

Deno.test("toRelayUrls - drops URLs that can't be canonicalised", () => {
  const out = toRelayUrls(["wss://relay example.com", "wss://ok.example/#top", "wss://ok.example"])
  assertEquals<ReadonlyArray<string>>(out, ["wss://ok.example"])
})
