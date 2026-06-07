import { assertEquals } from "@std/assert"
import { isNumberArray, isRecord, isStringArray } from "../../src/domain/value-object/guards.ts"
import { isValidTag } from "../../src/domain/value-object/nostr-event.ts"

Deno.test("isRecord - true for plain objects", () => {
  assertEquals(isRecord({}), true)
  assertEquals(isRecord({ a: 1 }), true)
})

Deno.test("isRecord - false for null", () => {
  assertEquals(isRecord(null), false)
})

Deno.test("isRecord - false for arrays", () => {
  assertEquals(isRecord([]), false)
  assertEquals(isRecord([1, 2, 3]), false)
})

Deno.test("isRecord - false for primitives", () => {
  assertEquals(isRecord("string"), false)
  assertEquals(isRecord(42), false)
  assertEquals(isRecord(true), false)
  assertEquals(isRecord(undefined), false)
})

Deno.test("isStringArray - true for an all-string array and empty array", () => {
  assertEquals(isStringArray([]), true)
  assertEquals(isStringArray(["a", "b"]), true)
})

Deno.test("isStringArray - false when any element is not a string, or value is not an array", () => {
  assertEquals(isStringArray(["a", 1]), false)
  assertEquals(isStringArray("a"), false)
  assertEquals(isStringArray(null), false)
})

Deno.test("isNumberArray - true for an all-number array and empty array", () => {
  assertEquals(isNumberArray([]), true)
  assertEquals(isNumberArray([1, 2]), true)
})

Deno.test("isNumberArray - false when any element is not a number, or value is not an array", () => {
  assertEquals(isNumberArray([1, "2"]), false)
  assertEquals(isNumberArray(42), false)
  assertEquals(isNumberArray(null), false)
})

Deno.test("isValidTag - true for a single-string tag", () => {
  assertEquals(isValidTag(["x"]), true)
})

Deno.test("isValidTag - true for a multi-string tag", () => {
  assertEquals(isValidTag(["p", "abcd"]), true)
})

Deno.test("isValidTag - false for empty array", () => {
  assertEquals(isValidTag([]), false)
})

Deno.test("isValidTag - false when any cell is not a string", () => {
  assertEquals(isValidTag(["p", 1]), false)
})

Deno.test("isValidTag - false for non-array root", () => {
  assertEquals(isValidTag("nope"), false)
  assertEquals(isValidTag(null), false)
  assertEquals(isValidTag({ 0: "p" }), false)
})
