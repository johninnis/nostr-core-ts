import { assertEquals } from "@std/assert"
import { isValidNip05Id, parseNip05Id } from "../../src/domain/value-object/nip05-id.ts"

const SAMPLES: ReadonlyArray<string> = [
  "alice@example.com",
  "Alice@example.com",
  "alice@Example.com",
  " alice@example.com",
  "nope",
  "",
]

Deno.test("isValidNip05Id - true for standard lowercase user@domain.com", () => {
  assertEquals(isValidNip05Id("alice@example.com"), true)
})

Deno.test("isValidNip05Id - true for the root underscore identifier", () => {
  assertEquals(isValidNip05Id("_@example.com"), true)
})

Deno.test("isValidNip05Id - true for dots and hyphens in the local part", () => {
  assertEquals(isValidNip05Id("first.last-name@example.co.uk"), true)
})

Deno.test("isValidNip05Id - false for uppercase letters (canonical form is lowercase)", () => {
  assertEquals(isValidNip05Id("Alice@example.com"), false)
})

Deno.test("isValidNip05Id - false for plus in local part (not in NIP-05 spec)", () => {
  assertEquals(isValidNip05Id("user+tag@example.com"), false)
})

Deno.test("isValidNip05Id - false when surrounded by whitespace", () => {
  assertEquals(isValidNip05Id("  alice@example.com  "), false)
})

Deno.test("isValidNip05Id - false for missing @", () => {
  assertEquals(isValidNip05Id("aliceexample.com"), false)
})

Deno.test("isValidNip05Id - false for missing TLD", () => {
  assertEquals(isValidNip05Id("alice@example"), false)
})

Deno.test("isValidNip05Id - true for a single-character top-level label, which DNS allows", () => {
  assertEquals(isValidNip05Id("alice@example.x"), true)
})

Deno.test("isValidNip05Id - false for double @", () => {
  assertEquals(isValidNip05Id("alice@@example.com"), false)
})

Deno.test("isValidNip05Id - false for empty string", () => {
  assertEquals(isValidNip05Id(""), false)
})

Deno.test("parseNip05Id - returns branded Nip05Id for valid identifier", () => {
  const id = parseNip05Id("alice@example.com")
  assertEquals<string | null>(id, "alice@example.com")
})

Deno.test("parseNip05Id - refuses an upper-case local part rather than lower-casing it (NIP-05: a-z0-9-_.)", () => {
  assertEquals(parseNip05Id("Alice@example.com"), null)
})

Deno.test("parseNip05Id - lower-cases the domain, which DNS compares without regard to case", () => {
  assertEquals<string | null>(parseNip05Id("alice@Example.COM"), "alice@example.com")
})

Deno.test("parseNip05Id - refuses a local part holding a character outside a-z0-9-_.", () => {
  assertEquals(["al ice@example.com", "al@ice@example.com", "älice@example.com"].map(parseNip05Id), [null, null, null])
})

Deno.test("parseNip05Id - refuses a domain label that starts or ends with a hyphen", () => {
  assertEquals(["alice@-example.com", "alice@example-.com", "alice@example..com"].map(parseNip05Id), [
    null,
    null,
    null,
  ])
})

Deno.test("parseNip05Id - refuses a non-ASCII domain character even when it lower-cases into ASCII", () => {
  assertEquals(["alice@\u212Aey.example.com", "alice@\u0130.example.com"].map(parseNip05Id), [null, null])
})

Deno.test("parseNip05Id - accepts an internationalised domain written as punycode", () => {
  assertEquals<string | null>(parseNip05Id("alice@xn--nxasmq6b.example.com"), "alice@xn--nxasmq6b.example.com")
})

Deno.test("parseNip05Id - refuses an IPv4 address as the domain", () => {
  assertEquals(parseNip05Id("alice@192.168.0.1"), null)
})

Deno.test("parseNip05Id - refuses a domain whose last label is decimal, which a URL parser reads as an IPv4 address", () => {
  assertEquals(parseNip05Id("a@127.1"), null)
})

Deno.test("parseNip05Id - refuses a domain whose last label is hexadecimal, which a URL parser reads as an IPv4 address", () => {
  assertEquals(parseNip05Id("a@0x7f.0x1"), null)
})

Deno.test("parseNip05Id - refuses a domain ending in a numeric label after a name, which is no DNS name", () => {
  assertEquals(parseNip05Id("a@example.1"), null)
})

Deno.test("parseNip05Id - accepts a numeric label before a name in the domain", () => {
  assertEquals<string | null>(parseNip05Id("a@1.example.com"), "a@1.example.com")
})

Deno.test("parseNip05Id - accepts a last label that only starts with a digit", () => {
  assertEquals<string | null>(parseNip05Id("a@example.1a"), "a@example.1a")
})

Deno.test("parseNip05Id - trims surrounding whitespace", () => {
  const id = parseNip05Id("  alice@example.com  ")
  assertEquals<string | null>(id, "alice@example.com")
})

Deno.test("parseNip05Id - trims surrounding tabs and line breaks from the whole input", () => {
  assertEquals<string | null>(parseNip05Id("\t\nalice@example.com\r\n"), "alice@example.com")
})

Deno.test("parseNip05Id - refuses whitespace inside the identifier, on either side of the @", () => {
  assertEquals(
    ["alice @example.com", "alice@ example.com", "alice @ example.com", "alice@example .com"].map(parseNip05Id),
    [null, null, null, null],
  )
})

Deno.test("parseNip05Id - returns null for missing @", () => {
  assertEquals(parseNip05Id("nope"), null)
})

Deno.test("parseNip05Id - returns null for plus in local part", () => {
  assertEquals(parseNip05Id("user+tag@example.com"), null)
})

Deno.test("parseNip05Id - returns null for empty string", () => {
  assertEquals(parseNip05Id(""), null)
})

Deno.test("parseNip05Id - returns null for non-string input", () => {
  assertEquals(parseNip05Id(42), null)
  assertEquals(parseNip05Id(null), null)
  assertEquals(parseNip05Id(undefined), null)
})

Deno.test("isValidNip05Id - holds exactly when parseNip05Id returns its input unchanged", () => {
  for (const raw of SAMPLES) assertEquals(isValidNip05Id(raw), parseNip05Id(raw) === raw, raw)
})
