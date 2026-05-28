import { assertEquals, assertThrows } from "@std/assert"
import {
  InvalidRelayUrlError,
  isValidRelayUrl,
  parseRelayUrl,
  toRelayUrls,
} from "../../src/domain/value-object/relay-url.ts"

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
  assertEquals<string>(url, "wss://relay.damus.io")
})

Deno.test("parseRelayUrl - lowercases scheme and host", () => {
  const url = parseRelayUrl("WSS://Relay.DAMUS.io")
  assertEquals<string>(url, "wss://relay.damus.io")
})

Deno.test("parseRelayUrl - strips trailing slash", () => {
  const url = parseRelayUrl("wss://relay.damus.io/")
  assertEquals<string>(url, "wss://relay.damus.io")
})

Deno.test("parseRelayUrl - throws InvalidRelayUrlError for invalid URL", () => {
  assertThrows(
    () => parseRelayUrl("not-a-url"),
    InvalidRelayUrlError,
    "Invalid relay URL: not-a-url",
  )
})

Deno.test("parseRelayUrl - throws InvalidRelayUrlError for empty string", () => {
  assertThrows(
    () => parseRelayUrl(""),
    InvalidRelayUrlError,
  )
})

Deno.test("InvalidRelayUrlError - stores the invalid raw value", () => {
  const err = new InvalidRelayUrlError("bad")
  assertEquals(err.raw, "bad")
})

Deno.test("InvalidRelayUrlError - has correct error name", () => {
  const err = new InvalidRelayUrlError("bad")
  assertEquals(err.name, "InvalidRelayUrlError")
})

Deno.test("toRelayUrls - removes exact duplicates", () => {
  const out = toRelayUrls(["wss://a.example", "wss://a.example"])
  assertEquals<ReadonlyArray<string>>(out, ["wss://a.example"])
})

Deno.test("toRelayUrls - collapses trailing slash and case variants via normaliseRelayUrl", () => {
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
