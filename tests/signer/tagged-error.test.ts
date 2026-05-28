import { assertEquals, assertInstanceOf } from "@std/assert"
import {
  EncryptionError,
  InvalidBrandError,
  JsonCryptoError,
  Nip04DecryptError,
  Nip44CryptoError,
  SignerError,
  SignerRejectedError,
  TaggedError,
} from "../../mod.ts"

const sampleJsonCryptoError = (): JsonCryptoError => new JsonCryptoError("json-stringify-failed", "boom")

Deno.test("TaggedError - every concrete subclass extends TaggedError", () => {
  assertInstanceOf(new EncryptionError("x", sampleJsonCryptoError()), TaggedError)
  assertInstanceOf(new SignerError("no-signer", "x"), TaggedError)
  assertInstanceOf(new SignerRejectedError(), TaggedError)
  assertInstanceOf(new Nip04DecryptError("x"), TaggedError)
  assertInstanceOf(new Nip44CryptoError("x"), TaggedError)
  assertInstanceOf(new InvalidBrandError("Tag", "msg", "raw"), TaggedError)
})

Deno.test("TaggedError - cause is preserved through wrap and narrowable via instanceof", () => {
  const inner = new SignerError("decrypt-failed", "bad")
  const outer = new JsonCryptoError("signer-failed", "wrap", inner)
  assertEquals(outer.cause, inner)
  assertEquals(outer.cause instanceof SignerError, true)
  if (outer.cause instanceof SignerError) assertEquals(outer.cause.tag, "decrypt-failed")
})

Deno.test("TaggedError - instance .name matches the constructor name", () => {
  assertEquals(new EncryptionError("x", sampleJsonCryptoError()).name, "EncryptionError")
  assertEquals(new SignerError("no-signer", "x").name, "SignerError")
  assertEquals(new Nip44CryptoError("x").name, "Nip44CryptoError")
})

Deno.test("Nip04DecryptError - is its own tag and carries the message", () => {
  const err = new Nip04DecryptError("missing ?iv= separator")
  assertEquals(err.tag, "Nip04DecryptError")
  assertEquals(err.message, "missing ?iv= separator")
})

Deno.test("Nip44CryptoError - is its own tag and carries the message", () => {
  const err = new Nip44CryptoError("invalid MAC")
  assertEquals(err.tag, "Nip44CryptoError")
  assertEquals(err.message, "invalid MAC")
})

Deno.test("EncryptionError - narrows its cause to JsonCryptoError", () => {
  const inner = new JsonCryptoError("signer-failed", "bad", new SignerError("encrypt-failed", "boom"))
  const outer = new EncryptionError("DM cache encrypt failed", inner)
  assertEquals(outer.cause, inner)
  assertEquals(outer.cause instanceof JsonCryptoError, true)
})
