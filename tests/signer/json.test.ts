import { assertEquals } from "@std/assert"
import { decryptJson, encryptJson } from "../../src/domain/service/json-crypto.ts"
import type { Signer } from "../../src/domain/service/signer.ts"
import { failure, isFailure, isOk, ok } from "../../src/domain/value-object/result.ts"
import { isRecord } from "../../src/domain/value-object/guards.ts"
import { JsonCryptoError } from "../../src/domain/exception/json-crypto-error.ts"
import { SignerError } from "../../src/domain/exception/signer-error.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"

const PUB = parsePublicKey("a".repeat(64))

const makeSigner = (overrides: Partial<Signer> = {}): Signer => ({
  kind: "local",
  getPublicKey: () => Promise.resolve(PUB),
  signEvent: () => Promise.reject(new Error("not exercised")),
  nip04Encrypt: () => Promise.resolve(ok("")),
  nip04Decrypt: () => Promise.resolve(ok("")),
  nip44Encrypt: (_pubkey, plaintext) => Promise.resolve(ok(`enc:${plaintext}`)),
  nip44Decrypt: (_pubkey, ciphertext) => Promise.resolve(ok(ciphertext.replace(/^enc:/, ""))),
  ...overrides,
})

Deno.test("encryptJson - stringifies the value before encrypting", async () => {
  const result = await encryptJson(makeSigner(), PUB, { a: 1 })
  assertEquals(isOk(result) && result.value, 'enc:{"a":1}')
})

Deno.test("decryptJson - parses the decrypted payload", async () => {
  const result = await decryptJson(makeSigner(), PUB, 'enc:{"a":1}')
  assertEquals(isOk(result) && isRecord(result.value) && result.value.a, 1)
})

Deno.test("encryptJson then decryptJson - round-trips a value", async () => {
  const signer = makeSigner()
  const value = { name: "alice", tags: [1, 2, 3] }
  const encrypted = await encryptJson(signer, PUB, value)
  assertEquals(isOk(encrypted), true)
  if (!isOk(encrypted)) return
  const decrypted = await decryptJson(signer, PUB, encrypted.value)
  assertEquals(isOk(decrypted) && decrypted.value, value)
})

Deno.test("decryptJson - fails with 'empty-ciphertext' for empty ciphertext", async () => {
  const result = await decryptJson(makeSigner(), PUB, "")
  assertEquals(isFailure(result) && result.error.tag, "empty-ciphertext")
})

Deno.test("decryptJson - wraps a signer failure as 'signer-failed' with the SignerError as cause", async () => {
  const signerError = new SignerError("decrypt-failed", "ciphertext rejected by signer")
  const signer = makeSigner({
    nip44Decrypt: () => Promise.resolve(failure(signerError)),
  })
  const result = await decryptJson(signer, PUB, "enc:whatever")
  assertEquals(isFailure(result) && result.error.tag, "signer-failed")
  assertEquals(isFailure(result) && result.error.cause, signerError)
})

Deno.test("decryptJson - fails with 'json-parse-failed' when the plaintext is not JSON", async () => {
  const signer = makeSigner({
    nip44Decrypt: () => Promise.resolve(ok("not json at all")),
  })
  const result = await decryptJson(signer, PUB, "enc:not json at all")
  assertEquals(isFailure(result) && result.error.tag, "json-parse-failed")
})

Deno.test("decryptJson - failure carries a JsonCryptoError instance", async () => {
  const result = await decryptJson(makeSigner(), PUB, "")
  assertEquals(isFailure(result) && result.error instanceof JsonCryptoError, true)
})
