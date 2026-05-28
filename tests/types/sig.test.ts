import { assertEquals, assertThrows } from "@std/assert"
import { InvalidSigError, isValidSig, parseSig } from "../../src/domain/value-object/sig.ts"

const VALID_SIG = "a".repeat(128)

Deno.test("isValidSig - true for 128 lowercase hex chars", () => {
  assertEquals(isValidSig(VALID_SIG), true)
  assertEquals(isValidSig("0123456789abcdef".repeat(8)), true)
})

Deno.test("isValidSig - false for uppercase hex (canonical form is lowercase)", () => {
  assertEquals(isValidSig("A".repeat(128)), false)
})

Deno.test("isValidSig - false for non-hex characters", () => {
  assertEquals(isValidSig("g".repeat(128)), false)
})

Deno.test("isValidSig - false for wrong length", () => {
  assertEquals(isValidSig("a".repeat(127)), false)
  assertEquals(isValidSig("a".repeat(129)), false)
  assertEquals(isValidSig(""), false)
})

Deno.test("isValidSig - false for non-string input", () => {
  assertEquals(isValidSig(0), false)
  assertEquals(isValidSig(null), false)
  assertEquals(isValidSig(undefined), false)
})

Deno.test("parseSig - returns branded Sig for valid hex", () => {
  assertEquals(parseSig(VALID_SIG), VALID_SIG)
})

Deno.test("parseSig - lowercases mixed-case input", () => {
  const mixed = "A".repeat(64) + "b".repeat(64)
  assertEquals(parseSig(mixed), mixed.toLowerCase())
})

Deno.test("parseSig - throws InvalidSigError for malformed input", () => {
  assertThrows(() => parseSig("not a sig"), InvalidSigError)
  assertThrows(() => parseSig(""), InvalidSigError)
})

Deno.test("InvalidSigError - retains the raw input for diagnostics", () => {
  const raw = "not a sig"
  try {
    parseSig(raw)
  } catch (err) {
    assertEquals(err instanceof InvalidSigError, true)
    if (err instanceof InvalidSigError) assertEquals(err.raw, raw)
    return
  }
  throw new Error("expected throw")
})

Deno.test("InvalidSigError - has the configured tag name", () => {
  const err = new InvalidSigError("bad")
  assertEquals(err.name, "InvalidSigError")
  assertEquals(err.tag, "InvalidSigError")
})
