import { assertEquals } from "@std/assert"
import { isValidEventId, parseEventId } from "../../src/domain/value-object/event-id.ts"

const SAMPLES: ReadonlyArray<string> = ["b".repeat(64), "B".repeat(64), "b".repeat(65), "z".repeat(64), ""]

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
  assertEquals<string | null>(id, VALID_HEX)
})

Deno.test("parseEventId - rejects upper-case hex (NIP-01 requires lowercase)", () => {
  assertEquals(parseEventId("B".repeat(64)), null)
})

Deno.test("parseEventId - rejects mixed-case hex", () => {
  assertEquals(parseEventId("AbCdEf" + "0".repeat(58)), null)
})

Deno.test("parseEventId - returns null for invalid input", () => {
  assertEquals(parseEventId("not-valid"), null)
})

Deno.test("parseEventId - returns null for empty string", () => {
  assertEquals(parseEventId(""), null)
})

Deno.test("parseEventId - returns null for non-string input", () => {
  assertEquals(parseEventId(42), null)
  assertEquals(parseEventId(null), null)
  assertEquals(parseEventId(undefined), null)
})

Deno.test("isValidEventId - holds exactly when parseEventId returns its input unchanged", () => {
  for (const raw of SAMPLES) assertEquals(isValidEventId(raw), parseEventId(raw) === raw, raw)
})
