import { assertEquals } from "@std/assert"
import { errorMessage, reportUnhandledError } from "../src/domain/service/error-utils.ts"

Deno.test("errorMessage - returns the message of an Error instance", () => {
  assertEquals(errorMessage(new Error("boom")), "boom")
})

Deno.test("errorMessage - returns the message of a custom Error subclass", () => {
  class MyErr extends Error {}
  assertEquals(errorMessage(new MyErr("subclass message")), "subclass message")
})

Deno.test("errorMessage - stringifies non-Error values", () => {
  assertEquals(errorMessage("string thrown"), "string thrown")
  assertEquals(errorMessage(42), "42")
  assertEquals(errorMessage(null), "null")
  assertEquals(errorMessage(undefined), "undefined")
  assertEquals(errorMessage({ shape: "object" }), "[object Object]")
})

// reportUnhandledError's whole job is to escape the current frame and surface
// as an unhandled error. Running the real throw would failure the test runner —
// the contract under test is "scheduled via queueMicrotask, the scheduled
// callback throws the original error". Spy on queueMicrotask to inspect that
// contract without ever letting the throw propagate.
const withQueueMicrotaskSpy = (fn: (calls: Array<() => void>) => void): void => {
  const original = globalThis.queueMicrotask
  const calls: Array<() => void> = []
  globalThis.queueMicrotask = (callback: () => void): void => {
    calls.push(callback)
  }
  try {
    fn(calls)
  } finally {
    globalThis.queueMicrotask = original
  }
}

Deno.test("reportUnhandledError - schedules a microtask synchronously", () => {
  withQueueMicrotaskSpy((calls) => {
    reportUnhandledError(new Error("captured"))
    assertEquals(calls.length, 1)
  })
})

Deno.test("reportUnhandledError - the scheduled microtask throws the original error", () => {
  withQueueMicrotaskSpy((calls) => {
    const sentinel = new Error("captured")
    reportUnhandledError(sentinel)
    const scheduled = calls[0]
    if (!scheduled) throw new Error("expected one queued callback")
    let thrown: unknown = null
    try {
      scheduled()
    } catch (e) {
      thrown = e
    }
    assertEquals(thrown, sentinel)
  })
})
