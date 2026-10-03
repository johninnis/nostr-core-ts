import { assertEquals } from "@std/assert"
import { formatHex, parseHex } from "../../src/domain/service/hex.ts"

Deno.test("parseHex - decodes lowercase hex into a Uint8Array", () => {
  assertEquals(parseHex("0011aaff"), new Uint8Array([0x00, 0x11, 0xaa, 0xff]))
})

Deno.test("parseHex - decodes the empty string to no bytes", () => {
  assertEquals(parseHex(""), new Uint8Array())
})

Deno.test("parseHex - returns null for odd-length input", () => {
  assertEquals(parseHex("abc"), null)
})

Deno.test("parseHex - returns null for non-hex characters", () => {
  assertEquals(parseHex("zz"), null)
})

Deno.test("parseHex - returns null for upper-case hex, whose canonical form is lower-case", () => {
  assertEquals(parseHex("AB"), null)
})

Deno.test("formatHex - encodes bytes to lowercase hex", () => {
  assertEquals(formatHex(new Uint8Array([0x00, 0x11, 0xaa, 0xff])), "0011aaff")
})

Deno.test("formatHex - returns empty string for empty input", () => {
  assertEquals(formatHex(new Uint8Array()), "")
})

Deno.test("parseHex / formatHex - round-trip a 32-byte key", () => {
  const original = "0123456789abcdef".repeat(4)
  const bytes = parseHex(original)
  assertEquals(bytes === null ? null : formatHex(bytes), original)
})
