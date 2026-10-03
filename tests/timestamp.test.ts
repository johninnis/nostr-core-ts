import { assertEquals } from "@std/assert"
import { now } from "../src/domain/service/timestamp.ts"
import { sourceFilesMatching } from "./support/source-files.ts"

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

Deno.test("now - is the one place the package reads the wall clock (ADR-0007)", async () => {
  assertEquals(await sourceFilesMatching(/Date\.now\(/), ["domain/service/timestamp.ts"])
})
