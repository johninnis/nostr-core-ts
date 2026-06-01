import { assertEquals, assertThrows } from "@std/assert"
import {
  InvalidPublicKeyError,
  isValidPublicKey,
  parsePublicKey,
  tryParsePublicKey,
} from "../../src/domain/value-object/public-key.ts"

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
  assertEquals<string>(pk, VALID_HEX)
})

Deno.test("parsePublicKey - lowercases uppercase hex input", () => {
  const pk = parsePublicKey("A".repeat(64))
  assertEquals<string>(pk, "a".repeat(64))
})

Deno.test("parsePublicKey - lowercases mixed-case hex input", () => {
  const pk = parsePublicKey("AbCdEf" + "0".repeat(58))
  assertEquals<string>(pk, "abcdef" + "0".repeat(58))
})

Deno.test("parsePublicKey - throws InvalidPublicKeyError for invalid hex", () => {
  assertThrows(
    () => parsePublicKey("not-a-key"),
    InvalidPublicKeyError,
    "Invalid public key: not-a-key",
  )
})

Deno.test("parsePublicKey - throws InvalidPublicKeyError for empty string", () => {
  assertThrows(
    () => parsePublicKey(""),
    InvalidPublicKeyError,
  )
})

Deno.test("tryParsePublicKey - returns branded PublicKey for valid hex", () => {
  const pk = tryParsePublicKey(VALID_HEX)
  assertEquals<string | null>(pk, VALID_HEX)
})

Deno.test("tryParsePublicKey - lowercases uppercase hex input", () => {
  const pk = tryParsePublicKey("A".repeat(64))
  assertEquals<string | null>(pk, "a".repeat(64))
})

Deno.test("tryParsePublicKey - returns null for invalid hex", () => {
  assertEquals(tryParsePublicKey("not-a-key"), null)
})

Deno.test("tryParsePublicKey - returns null for empty string", () => {
  assertEquals(tryParsePublicKey(""), null)
})

Deno.test("tryParsePublicKey - returns null for null", () => {
  assertEquals(tryParsePublicKey(null), null)
})

Deno.test("tryParsePublicKey - returns null for undefined", () => {
  assertEquals(tryParsePublicKey(undefined), null)
})

Deno.test("InvalidPublicKeyError - stores the invalid raw value", () => {
  const err = new InvalidPublicKeyError("bad")
  assertEquals(err.raw, "bad")
})

Deno.test("InvalidPublicKeyError - has correct error name", () => {
  const err = new InvalidPublicKeyError("bad")
  assertEquals(err.name, "InvalidPublicKeyError")
})
