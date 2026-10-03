import { assertEquals } from "@std/assert"
import { parseDecimalInteger } from "../../src/domain/service/decimal.ts"

Deno.test("parseDecimalInteger - reads a string of decimal digits", () => {
  assertEquals([parseDecimalInteger("0"), parseDecimalInteger("1700000000")], [0, 1700000000])
})

Deno.test("parseDecimalInteger - refuses a sign, exponent, hex, space, fraction or empty string", () => {
  assertEquals(["-1", "+1", "1e3", "0x10", " 12", "1.5", ""].map(parseDecimalInteger), [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ])
})

Deno.test("parseDecimalInteger - refuses a number beyond the safe integer range", () => {
  assertEquals(parseDecimalInteger("9007199254740993"), null)
})

Deno.test("parseDecimalInteger - refuses a leading zero, which writes no canonical decimal (shared ADR-0096)", () => {
  assertEquals(["007", "00", "0000000001"].map(parseDecimalInteger), [null, null, null])
})
