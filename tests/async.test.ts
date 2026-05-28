import { assertEquals } from "@std/assert"
import { coalesce, debounce } from "../src/domain/service/timers.ts"

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

Deno.test("debounce - fires once after the last call when calls are within window", async () => {
  let count = 0
  const fn = debounce((n: number) => {
    count = n
  }, 30)
  fn(1)
  fn(2)
  fn(3)
  assertEquals(count, 0)
  await wait(60)
  assertEquals(count, 3)
})

Deno.test("debounce - cancel prevents pending fire", async () => {
  let count = 0
  const fn = debounce(() => {
    count++
  }, 30)
  fn()
  fn.cancel()
  await wait(60)
  assertEquals(count, 0)
})

Deno.test("coalesce - first call schedules, subsequent calls drop until fired", async () => {
  let count = 0
  const fn = coalesce(() => {
    count++
  }, 30)
  fn()
  fn()
  fn()
  assertEquals(count, 0)
  await wait(60)
  assertEquals(count, 1)
  fn()
  await wait(60)
  assertEquals(count, 2)
})

Deno.test("coalesce - cancel prevents pending fire", async () => {
  let count = 0
  const fn = coalesce(() => {
    count++
  }, 30)
  fn()
  fn.cancel()
  await wait(60)
  assertEquals(count, 0)
})
