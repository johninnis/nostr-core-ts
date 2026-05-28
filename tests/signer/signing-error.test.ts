import { assertEquals } from "@std/assert"
import { SigningError } from "../../src/domain/exception/signing-error.ts"

Deno.test("SigningError - uses the constructor argument as its message", () => {
  const err = new SigningError("no signer available")
  assertEquals(err.message, "no signer available")
})

Deno.test("SigningError - has correct name and tag", () => {
  const err = new SigningError("x")
  assertEquals(err.name, "SigningError")
  assertEquals(err.tag, "SigningError")
})

Deno.test("SigningError - is an Error instance", () => {
  const err = new SigningError("x")
  assertEquals(err instanceof Error, true)
  assertEquals(err instanceof SigningError, true)
})
