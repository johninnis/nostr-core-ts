import { assertEquals } from "@std/assert"
import { isValidSig, parseSig } from "../../src/domain/value-object/sig.ts"

const SAMPLES: ReadonlyArray<string> = ["a".repeat(128), "A".repeat(128), "a".repeat(127), "not a sig", ""]

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

Deno.test("parseSig - rejects mixed-case input (NIP-01 requires lowercase)", () => {
  assertEquals(parseSig("A".repeat(64) + "b".repeat(64)), null)
})

Deno.test("parseSig - returns null for malformed input", () => {
  assertEquals(parseSig("not a sig"), null)
  assertEquals(parseSig(""), null)
})

Deno.test("parseSig - returns null for non-string input", () => {
  assertEquals(parseSig(42), null)
  assertEquals(parseSig(null), null)
  assertEquals(parseSig(undefined), null)
})

Deno.test("isValidSig - holds exactly when parseSig returns its input unchanged", () => {
  for (const raw of SAMPLES) assertEquals(isValidSig(raw), parseSig(raw) === raw, raw)
})
