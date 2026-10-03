import { assertEquals } from "@std/assert"
import {
  type Brand,
  type BrandTools,
  createBrand,
  createHexBrand,
  isLowercaseHex,
} from "../../src/domain/value-object/mod.ts"

declare const fooBrand: unique symbol
type Foo = Brand<typeof fooBrand>

const fooTools: BrandTools<Foo> = createBrand({
  canonicalise: (raw) => {
    const lowered = raw.trim().toLowerCase()
    return lowered.startsWith("foo:") ? lowered : null
  },
})

Deno.test("createBrand - parse returns the canonical form of valid input", () => {
  assertEquals<string | null>(fooTools.parse("  FOO:Bar "), "foo:bar")
})

Deno.test("createBrand - parse returns null for input that has no canonical form", () => {
  assertEquals(fooTools.parse("nope"), null)
})

Deno.test("createBrand - parse returns null for non-string input", () => {
  assertEquals(fooTools.parse(42), null)
  assertEquals(fooTools.parse(null), null)
  assertEquals(fooTools.parse(undefined), null)
})

Deno.test("createBrand - is accepts only the canonical form", () => {
  assertEquals(fooTools.is("foo:bar"), true)
  assertEquals(fooTools.is("FOO:bar"), false)
  assertEquals(fooTools.is(42), false)
})

Deno.test("createBrand - is holds exactly when parse returns its input unchanged", () => {
  for (const raw of ["foo:bar", "FOO:bar", " foo:bar", "nope", ""]) {
    assertEquals(fooTools.is(raw), fooTools.parse(raw) === raw, raw)
  }
})

Deno.test("createBrand - parse rejects a canonicaliser output that is not a fixed point", () => {
  const unstable = createBrand<Foo>({ canonicalise: (raw) => `${raw}!` })
  assertEquals(unstable.parse("a"), null)
})

Deno.test("createHexBrand - parse accepts a lowercase hex string of the given length", () => {
  assertEquals<string | null>(createHexBrand<Foo>(8).parse("deadbeef"), "deadbeef")
})

Deno.test("createHexBrand - parse rejects upper-case hex", () => {
  assertEquals(createHexBrand<Foo>(8).parse("DEADBEEF"), null)
})

Deno.test("createHexBrand - parse rejects wrong length and non-hex", () => {
  const tools = createHexBrand<Foo>(8)
  assertEquals(tools.parse("deadbee"), null)
  assertEquals(tools.parse("zzzzzzzz"), null)
})

Deno.test("createHexBrand - is rejects uppercase hex", () => {
  const tools = createHexBrand<Foo>(8)
  assertEquals(tools.is("DEADBEEF"), false)
  assertEquals(tools.is("deadbeef"), true)
})

Deno.test("isLowercaseHex - true for 64 lowercase hex chars", () => {
  assertEquals(isLowercaseHex("0123456789abcdef".repeat(4), 64), true)
})

Deno.test("isLowercaseHex - false for uppercase hex (canonical form is lowercase)", () => {
  assertEquals(isLowercaseHex("A".repeat(64), 64), false)
})

Deno.test("isLowercaseHex - false for non-hex characters or wrong length", () => {
  assertEquals(isLowercaseHex("g".repeat(64), 64), false)
  assertEquals(isLowercaseHex("a".repeat(63), 64), false)
  assertEquals(isLowercaseHex(" " + "a".repeat(64), 64), false)
})

Deno.test("isLowercaseHex - checks any length: 128 matches Schnorr signature shape", () => {
  assertEquals(isLowercaseHex("a".repeat(128), 128), true)
  assertEquals(isLowercaseHex("a".repeat(127), 128), false)
})
