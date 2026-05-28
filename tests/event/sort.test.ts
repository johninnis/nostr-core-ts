import { assertEquals } from "@std/assert"
import { byCreatedAtAsc, byCreatedAtDesc } from "../../src/domain/service/sort.ts"

Deno.test("byCreatedAtDesc - returns negative when a is newer than b", () => {
  const result = byCreatedAtDesc({ created_at: 200 }, { created_at: 100 })
  assertEquals(result < 0, true)
})

Deno.test("byCreatedAtDesc - returns positive when a is older than b", () => {
  const result = byCreatedAtDesc({ created_at: 100 }, { created_at: 200 })
  assertEquals(result > 0, true)
})

Deno.test("byCreatedAtDesc - returns 0 when timestamps are equal", () => {
  assertEquals(byCreatedAtDesc({ created_at: 100 }, { created_at: 100 }), 0)
})

Deno.test("byCreatedAtDesc - sorts an array newest-first", () => {
  const events = [
    { created_at: 100 },
    { created_at: 300 },
    { created_at: 200 },
  ]
  const sorted = [...events].sort(byCreatedAtDesc)
  assertEquals(sorted.map((e) => e.created_at), [300, 200, 100])
})

Deno.test("byCreatedAtAsc - sorts an array oldest-first", () => {
  const events = [
    { created_at: 200 },
    { created_at: 100 },
    { created_at: 300 },
  ]
  const sorted = [...events].sort(byCreatedAtAsc)
  assertEquals(sorted.map((e) => e.created_at), [100, 200, 300])
})

Deno.test("byCreatedAtAsc - returns 0 when timestamps are equal", () => {
  assertEquals(byCreatedAtAsc({ created_at: 100 }, { created_at: 100 }), 0)
})
