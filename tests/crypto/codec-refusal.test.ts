import { assertEquals, assertThrows } from "@std/assert"
import { refusedAs } from "../../src/infrastructure/crypto/codec-refusal.ts"
import { Nip44CryptoError } from "../../src/domain/exception/nip44-crypto-error.ts"

const refusal = (cause: Error): Nip44CryptoError => new Nip44CryptoError(cause.message, { cause })

Deno.test("refusedAs - returns the step's value when it does not throw", () => {
  assertEquals(refusedAs(() => 42, refusal), 42)
})

Deno.test("refusedAs - rethrows a plain Error, the primitives' refusal of an input, as the codec's error", () => {
  assertThrows(
    () =>
      refusedAs(() => {
        throw new Error("invalid MAC")
      }, refusal),
    Nip44CryptoError,
    "invalid MAC",
  )
})

Deno.test("refusedAs - lets any other throw, such as a bug's TypeError, propagate unchanged", () => {
  const error = assertThrows(() =>
    refusedAs(() => {
      throw new TypeError("bug")
    }, refusal)
  )
  assertEquals(error instanceof TypeError && !(error instanceof Nip44CryptoError), true)
})
