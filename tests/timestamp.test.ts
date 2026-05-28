import { assertEquals } from "@std/assert"
import { now } from "../src/domain/value-object/timestamp.ts"

Deno.test("now - returns the current unix timestamp in seconds", () => {
  const before = Math.floor(Date.now() / 1000)
  const result = now()
  const after = Math.floor(Date.now() / 1000)
  assertEquals(result >= before, true)
  assertEquals(result <= after, true)
})

Deno.test("now - returns an integer", () => {
  const result = now()
  assertEquals(Number.isInteger(result), true)
})

Deno.test("now - returns seconds, not milliseconds", () => {
  const result = now()
  const nowMs = Date.now()
  assertEquals(result < nowMs / 100, true)
})
