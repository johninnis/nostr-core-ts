import { assertEquals, assertNotEquals } from "@std/assert"
import { randomBytes, randomUint32 } from "../../src/domain/service/random.ts"

Deno.test("randomBytes - returns a Uint8Array of the requested length", () => {
  const bytes = randomBytes(32)
  assertEquals(bytes instanceof Uint8Array, true)
  assertEquals(bytes.length, 32)
})

Deno.test("randomBytes - returns zero-length array for length 0", () => {
  assertEquals(randomBytes(0).length, 0)
})

Deno.test("randomBytes - independent calls produce different output (statistically)", () => {
  const a = randomBytes(32)
  const b = randomBytes(32)
  assertNotEquals(a.toString(), b.toString())
})

Deno.test("randomUint32 - returns a finite integer in [0, 2^32)", () => {
  const value = randomUint32()
  assertEquals(Number.isInteger(value), true)
  assertEquals(value >= 0 && value < 0x1_0000_0000, true)
})

Deno.test("randomUint32 - independent calls produce different output (statistically)", () => {
  const values = new Set<number>()
  for (let i = 0; i < 8; i++) values.add(randomUint32())
  assertEquals(values.size > 1, true)
})
