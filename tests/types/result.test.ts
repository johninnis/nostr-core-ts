import { assertEquals } from "@std/assert"
import { failure, isFailure, isOk, ok } from "../../src/domain/value-object/result.ts"

Deno.test("ok - creates a Success with the given value", () => {
  const result = ok(42)
  assertEquals(result.success, true)
  assertEquals(result.value, 42)
})

Deno.test("ok - works with string values", () => {
  const result = ok("hello")
  assertEquals(result.value, "hello")
})

Deno.test("ok - works with null value", () => {
  const result = ok(null)
  assertEquals(result.success, true)
  assertEquals(result.value, null)
})

Deno.test("failure - creates a Failure with the given error", () => {
  const error = new Error("something went wrong")
  const result = failure(error)
  assertEquals(result.success, false)
  assertEquals(result.error, error)
})

Deno.test("failure - works with string errors", () => {
  const result = failure("bad input")
  assertEquals(result.success, false)
  assertEquals(result.error, "bad input")
})

Deno.test("isOk - returns true for Success", () => {
  assertEquals(isOk(ok("value")), true)
})

Deno.test("isOk - returns false for Failure", () => {
  assertEquals(isOk(failure("error")), false)
})

Deno.test("isFailure - returns true for Failure", () => {
  assertEquals(isFailure(failure("error")), true)
})

Deno.test("isFailure - returns false for Success", () => {
  assertEquals(isFailure(ok("value")), false)
})

Deno.test("isOk - narrows in Array#filter", () => {
  const results = [ok(1), failure("nope"), ok(2)] as const
  const okValues = results.filter(isOk).map((r) => r.value)
  assertEquals(okValues, [1, 2])
})

Deno.test("isFailure - narrows in Array#filter", () => {
  const results = [ok(1), failure("nope"), ok(2)] as const
  const failErrors = results.filter(isFailure).map((r) => r.error)
  assertEquals(failErrors, ["nope"])
})
