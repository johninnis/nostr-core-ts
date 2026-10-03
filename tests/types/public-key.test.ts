import { assertEquals } from "@std/assert"
import { isValidPublicKey, parsePublicKey } from "../../src/domain/value-object/public-key.ts"

const SAMPLES: ReadonlyArray<string> = ["a".repeat(64), "A".repeat(64), "a".repeat(63), "g".repeat(64), ""]

const VALID_HEX = "a".repeat(64)
const VALID_HEX_MIXED = "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"

Deno.test("isValidPublicKey - returns true for valid 64-char lowercase hex", () => {
  assertEquals(isValidPublicKey(VALID_HEX), true)
})

Deno.test("isValidPublicKey - returns true for mixed hex characters", () => {
  assertEquals(isValidPublicKey(VALID_HEX_MIXED), true)
})

Deno.test("isValidPublicKey - returns false for uppercase hex", () => {
  assertEquals(isValidPublicKey("A".repeat(64)), false)
})

Deno.test("isValidPublicKey - returns false for 63-char hex", () => {
  assertEquals(isValidPublicKey("a".repeat(63)), false)
})

Deno.test("isValidPublicKey - returns false for 65-char hex", () => {
  assertEquals(isValidPublicKey("a".repeat(65)), false)
})

Deno.test("isValidPublicKey - returns false for empty string", () => {
  assertEquals(isValidPublicKey(""), false)
})

Deno.test("isValidPublicKey - returns false for non-hex characters", () => {
  assertEquals(isValidPublicKey("g".repeat(64)), false)
})

Deno.test("parsePublicKey - returns branded PublicKey for valid hex", () => {
  const pk = parsePublicKey(VALID_HEX)
  assertEquals<string | null>(pk, VALID_HEX)
})

Deno.test("parsePublicKey - rejects upper-case hex (NIP-01 requires lowercase)", () => {
  assertEquals(parsePublicKey("A".repeat(64)), null)
})

Deno.test("parsePublicKey - rejects mixed-case hex", () => {
  assertEquals(parsePublicKey("AbCdEf" + "0".repeat(58)), null)
})

Deno.test("parsePublicKey - returns null for invalid hex", () => {
  assertEquals(parsePublicKey("not-a-key"), null)
})

Deno.test("parsePublicKey - returns null for empty string", () => {
  assertEquals(parsePublicKey(""), null)
})

Deno.test("parsePublicKey - returns null for non-string input", () => {
  assertEquals(parsePublicKey(42), null)
  assertEquals(parsePublicKey(null), null)
  assertEquals(parsePublicKey(undefined), null)
})

Deno.test("isValidPublicKey - holds exactly when parsePublicKey returns its input unchanged", () => {
  for (const raw of SAMPLES) assertEquals(isValidPublicKey(raw), parsePublicKey(raw) === raw, raw)
})
