import { assertEquals, assertInstanceOf } from "@std/assert"
import { Nip04CryptoError, Nip44CryptoError } from "../../mod.ts"

Deno.test("Nip04CryptoError - is a named Error carrying the message", () => {
  const err = new Nip04CryptoError("missing ?iv= separator")
  assertInstanceOf(err, Error)
  assertEquals(err.name, "Nip04CryptoError")
  assertEquals(err.message, "missing ?iv= separator")
})

Deno.test("Nip44CryptoError - is a named Error carrying the message and cause", () => {
  const cause = new Error("invalid MAC")
  const err = new Nip44CryptoError("invalid MAC", { cause })
  assertInstanceOf(err, Error)
  assertEquals(err.name, "Nip44CryptoError")
  assertEquals(err.message, "invalid MAC")
  assertEquals(err.cause, cause)
})
