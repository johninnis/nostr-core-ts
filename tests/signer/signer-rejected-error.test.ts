import { assertEquals } from "@std/assert"
import { isUserRejection, SignerRejectedError } from "../../src/domain/exception/signer-rejected-error.ts"

Deno.test("SignerRejectedError - default message", () => {
  const err = new SignerRejectedError()
  assertEquals(err.message, "User rejected the request")
  assertEquals(err.name, "SignerRejectedError")
  assertEquals(err.tag, "SignerRejectedError")
})

Deno.test("SignerRejectedError - accepts custom message", () => {
  const err = new SignerRejectedError("nope")
  assertEquals(err.message, "nope")
})

Deno.test("isUserRejection - true for SignerRejectedError instance", () => {
  assertEquals(isUserRejection(new SignerRejectedError()), true)
})

Deno.test("isUserRejection - true for Error whose message contains 'rejected'", () => {
  assertEquals(isUserRejection(new Error("request was rejected by user")), true)
})

Deno.test("isUserRejection - true for Error whose message contains 'denied' (case-insensitive)", () => {
  assertEquals(isUserRejection(new Error("Permission DENIED")), true)
})

Deno.test("isUserRejection - true for Error whose message contains 'cancel'", () => {
  assertEquals(isUserRejection(new Error("user cancelled the prompt")), true)
})

Deno.test("isUserRejection - false for Error with unrelated message", () => {
  assertEquals(isUserRejection(new Error("timeout")), false)
})

Deno.test("isUserRejection - false for non-Error throwable (string)", () => {
  assertEquals(isUserRejection("rejected"), false)
})

Deno.test("isUserRejection - false for null and undefined", () => {
  assertEquals(isUserRejection(null), false)
  assertEquals(isUserRejection(undefined), false)
})

Deno.test("isUserRejection - false for plain object even with matching shape", () => {
  assertEquals(isUserRejection({ message: "rejected" }), false)
})
