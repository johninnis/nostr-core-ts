import { assertEquals, assertThrows } from "@std/assert"
import { InvalidEventIdError, isValidEventId, parseEventId } from "../../src/domain/value-object/event-id.ts"

const VALID_HEX = "b".repeat(64)
const VALID_HEX_MIXED = "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b"

Deno.test("isValidEventId - returns true for valid 64-char lowercase hex", () => {
  assertEquals(isValidEventId(VALID_HEX), true)
})

Deno.test("isValidEventId - returns true for mixed hex characters", () => {
  assertEquals(isValidEventId(VALID_HEX_MIXED), true)
})

Deno.test("isValidEventId - returns false for uppercase hex", () => {
  assertEquals(isValidEventId("B".repeat(64)), false)
})

Deno.test("isValidEventId - returns false for wrong length", () => {
  assertEquals(isValidEventId("b".repeat(63)), false)
})

Deno.test("isValidEventId - returns false for empty string", () => {
  assertEquals(isValidEventId(""), false)
})

Deno.test("isValidEventId - returns false for non-hex characters", () => {
  assertEquals(isValidEventId("z".repeat(64)), false)
})

Deno.test("parseEventId - returns branded EventId for valid hex", () => {
  const id = parseEventId(VALID_HEX)
  assertEquals<string>(id, VALID_HEX)
})

Deno.test("parseEventId - lowercases uppercase hex input", () => {
  const id = parseEventId("B".repeat(64))
  assertEquals<string>(id, "b".repeat(64))
})

Deno.test("parseEventId - lowercases mixed-case hex input", () => {
  const id = parseEventId("AbCdEf" + "0".repeat(58))
  assertEquals<string>(id, "abcdef" + "0".repeat(58))
})

Deno.test("parseEventId - throws InvalidEventIdError for invalid input", () => {
  assertThrows(
    () => parseEventId("not-valid"),
    InvalidEventIdError,
    "Invalid event ID: not-valid",
  )
})

Deno.test("parseEventId - throws InvalidEventIdError for empty string", () => {
  assertThrows(
    () => parseEventId(""),
    InvalidEventIdError,
  )
})

Deno.test("InvalidEventIdError - stores the invalid raw value", () => {
  const err = new InvalidEventIdError("bad")
  assertEquals(err.raw, "bad")
})

Deno.test("InvalidEventIdError - has correct error name", () => {
  const err = new InvalidEventIdError("bad")
  assertEquals(err.name, "InvalidEventIdError")
})
