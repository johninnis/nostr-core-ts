import { assertEquals, assertThrows } from "@std/assert"
import { formatHex, hexRegex, parseHex } from "../../src/domain/value-object/hex.ts"

Deno.test("hexRegex(64) - true for 64 lowercase hex chars", () => {
  assertEquals(hexRegex(64).test("a".repeat(64)), true)
  assertEquals(hexRegex(64).test("0123456789abcdef".repeat(4)), true)
})

Deno.test("hexRegex(64) - false for uppercase hex (canonical form is lowercase)", () => {
  assertEquals(hexRegex(64).test("A".repeat(64)), false)
  assertEquals(hexRegex(64).test("ABCDEF".repeat(10) + "0123"), false)
})

Deno.test("hexRegex(64) - false for non-hex characters", () => {
  assertEquals(hexRegex(64).test("g".repeat(64)), false)
  assertEquals(hexRegex(64).test("z".repeat(64)), false)
})

Deno.test("hexRegex(64) - false for wrong length", () => {
  assertEquals(hexRegex(64).test("a".repeat(63)), false)
  assertEquals(hexRegex(64).test("a".repeat(65)), false)
  assertEquals(hexRegex(64).test(""), false)
})

Deno.test("hexRegex(64) - false when surrounded by whitespace", () => {
  assertEquals(hexRegex(64).test(" " + "a".repeat(64)), false)
  assertEquals(hexRegex(64).test("a".repeat(64) + "\n"), false)
})

Deno.test("hexRegex - parameterised over length: 128 matches Schnorr signature shape", () => {
  assertEquals(hexRegex(128).test("a".repeat(128)), true)
  assertEquals(hexRegex(128).test("a".repeat(127)), false)
})

Deno.test("parseHex - decodes lowercase hex into a Uint8Array", () => {
  const bytes = parseHex("0011aaff")
  assertEquals(bytes, new Uint8Array([0x00, 0x11, 0xaa, 0xff]))
})

Deno.test("parseHex - throws on odd-length input", () => {
  assertThrows(() => parseHex("abc"))
})

Deno.test("parseHex - throws on non-hex characters", () => {
  assertThrows(() => parseHex("zz"))
})

Deno.test("formatHex - encodes bytes to lowercase hex", () => {
  assertEquals(formatHex(new Uint8Array([0x00, 0x11, 0xaa, 0xff])), "0011aaff")
})

Deno.test("formatHex - returns empty string for empty input", () => {
  assertEquals(formatHex(new Uint8Array()), "")
})

Deno.test("parseHex / formatHex - round-trip a 32-byte key", () => {
  const original = "0123456789abcdef".repeat(4)
  assertEquals(formatHex(parseHex(original)), original)
})
