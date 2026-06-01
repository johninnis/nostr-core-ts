import { assertEquals } from "@std/assert"
import { constantTimeEqual } from "../../src/domain/service/constant-time-equal.ts"

Deno.test("constantTimeEqual - true for identical strings", () => {
  assertEquals(constantTimeEqual("supersecret", "supersecret"), true)
})

Deno.test("constantTimeEqual - true for two empty strings", () => {
  assertEquals(constantTimeEqual("", ""), true)
})

Deno.test("constantTimeEqual - false for same-length strings differing in one character", () => {
  assertEquals(constantTimeEqual("supersecret", "supersecreT"), false)
})

Deno.test("constantTimeEqual - false for strings of different lengths", () => {
  assertEquals(constantTimeEqual("abc", "abcd"), false)
})
