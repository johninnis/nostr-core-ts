import { assertEquals, assertRejects } from "@std/assert"
import { cipherSchemeOf } from "../../src/domain/service/cipher-scheme.ts"
import { createJsonCipher } from "../../src/application/service/json-crypto.ts"
import type { Signer } from "../../src/domain/service/signer.ts"
import { failure, isFailure, isOk, ok } from "../../src/domain/value-object/result.ts"
import { isRecord } from "../../src/domain/service/guards.ts"
import type { SignerFailure } from "../../src/domain/failure/signer-failure.ts"
import type { JsonDecryptFailure } from "../../src/application/failure/json-decrypt-failure.ts"
import { publicKeyFixture } from "../../testing.ts"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"

const PUB = publicKeyFixture("a".repeat(64))

const makeSigner = (overrides: Partial<Signer> = {}): Signer => ({
  kind: "local",
  getPublicKey: () => Promise.resolve(ok(PUB)),
  signEvent: () => Promise.resolve(failure({ type: "no-signer", message: "not exercised" })),
  nip04Encrypt: () => Promise.resolve(ok("")),
  nip04Decrypt: () => Promise.resolve(ok("")),
  nip44Encrypt: (_pubkey, plaintext) => Promise.resolve(ok(`enc:${plaintext}`)),
  nip44Decrypt: (_pubkey, ciphertext) => Promise.resolve(ok(ciphertext.replace(/^enc:/, ""))),
  ...overrides,
})

Deno.test("createJsonCipher - encrypt stringifies the value before encrypting", async () => {
  const result = await createJsonCipher(makeSigner()).encrypt(PUB, { a: 1 })
  assertEquals(isOk(result) && result.value, 'enc:{"a":1}')
})

Deno.test("createJsonCipher - decrypt parses the decrypted payload", async () => {
  const result = await createJsonCipher(makeSigner()).decrypt(PUB, 'enc:{"a":1}')
  assertEquals(isOk(result) && isRecord(result.value) && result.value.a, 1)
})

Deno.test("createJsonCipher - encrypt throws for a bigint, which JSON.stringify refuses, a programmer fault", async () => {
  // @ts-expect-error: a bigint is no JSON value
  await assertRejects(() => createJsonCipher(makeSigner()).encrypt(PUB, 1n), TypeError)
})

Deno.test("createJsonCipher - encrypt refuses undefined, for which JSON.stringify writes nothing", async () => {
  // @ts-expect-error: undefined is no JSON value
  await assertRejects(() => createJsonCipher(makeSigner()).encrypt(PUB, undefined), InvalidArgumentError)
})

Deno.test("createJsonCipher - encrypt refuses a function, for which JSON.stringify writes nothing", async () => {
  let encrypted = false
  const signer = makeSigner({ nip44Encrypt: () => (encrypted = true, Promise.resolve(ok(""))) })
  // @ts-expect-error: a function is no JSON value
  await assertRejects(() => createJsonCipher(signer).encrypt(PUB, () => 1), InvalidArgumentError)
  assertEquals(encrypted, false)
})

Deno.test("createJsonCipher - encrypt refuses an unknown value at compile time and an object with a method", async () => {
  const unchecked: unknown = { a: 1 }
  // @ts-expect-error: an unknown value has to be narrowed to a JSON value first
  await createJsonCipher(makeSigner()).encrypt(PUB, unchecked)
  // @ts-expect-error: a method is no JSON value
  await createJsonCipher(makeSigner()).encrypt(PUB, { a: 1, run: () => 1 })
})

Deno.test("createJsonCipher - encrypt accepts an interface, a tuple and an omitted optional field", async () => {
  interface Entry {
    readonly tag: readonly [string, ...ReadonlyArray<string>]
    readonly note?: string | undefined
  }
  const entry: Entry = { tag: ["t", "x"], note: undefined }
  const result = await createJsonCipher(makeSigner()).encrypt(PUB, [entry])
  assertEquals(isOk(result) && result.value, 'enc:[{"tag":["t","x"]}]')
})

Deno.test("createJsonCipher - the nip04 scheme encrypt stringifies the value and routes through nip04, not nip44", async () => {
  const signer = makeSigner({
    nip04Encrypt: (_pubkey, plaintext) => Promise.resolve(ok(`nip04:${plaintext}`)),
  })
  const result = await createJsonCipher(signer, "nip04").encrypt(PUB, { a: 1 })
  assertEquals(isOk(result) && result.value, 'nip04:{"a":1}')
})

Deno.test("createJsonCipher - the nip04 scheme decrypt decrypts over nip04 and parses the payload", async () => {
  const signer = makeSigner({
    nip04Decrypt: (_pubkey, ciphertext) => Promise.resolve(ok(ciphertext.replace(/^nip04:/, ""))),
  })
  const result = await createJsonCipher(signer, "nip04").decrypt(PUB, 'nip04:{"a":1}')
  assertEquals(isOk(result) && isRecord(result.value) && result.value.a, 1)
})

Deno.test("createJsonCipher - the nip04 scheme decrypt surfaces a signer-failed JsonDecryptFailure when the signer fails", async () => {
  const signer = makeSigner({
    nip04Decrypt: () => Promise.resolve(failure({ type: "decrypt-failed", message: "nope" })),
  })
  const result = await createJsonCipher(signer, "nip04").decrypt(PUB, "nip04:whatever")
  assertEquals(isFailure(result) && result.error.type, "signer-failed")
})

Deno.test("createJsonCipher - encrypt then decrypt round-trips a value", async () => {
  const signer = makeSigner()
  const value = { name: "alice", tags: [1, 2, 3] }
  const encrypted = await createJsonCipher(signer).encrypt(PUB, value)
  assertEquals(isOk(encrypted), true)
  if (!isOk(encrypted)) return
  const decrypted = await createJsonCipher(signer).decrypt(PUB, encrypted.value)
  assertEquals(isOk(decrypted) && decrypted.value, value)
})

Deno.test("createJsonCipher - decrypt fails with 'empty-ciphertext' for empty ciphertext", async () => {
  const result = await createJsonCipher(makeSigner()).decrypt(PUB, "")
  assertEquals(isFailure(result) && result.error.type, "empty-ciphertext")
})

Deno.test("createJsonCipher - decrypt wraps a signer failure as 'signer-failed' with the SignerFailure as cause", async () => {
  const signerFailure: SignerFailure = { type: "decrypt-failed", message: "ciphertext rejected by signer" }
  const signer = makeSigner({
    nip44Decrypt: () => Promise.resolve(failure(signerFailure)),
  })
  const result = await createJsonCipher(signer).decrypt(PUB, "enc:whatever")
  assertEquals(isFailure(result) && result.error, { type: "signer-failed", cause: signerFailure })
})

Deno.test("createJsonCipher - decrypt fails with 'json-parse-failed' when the plaintext is not JSON", async () => {
  const signer = makeSigner({
    nip44Decrypt: () => Promise.resolve(ok("not json at all")),
  })
  const result = await createJsonCipher(signer).decrypt(PUB, "enc:not json at all")
  assertEquals(isFailure(result) && result.error.type, "json-parse-failed")
})

Deno.test("createJsonCipher - decrypt succeeds with null for a payload that is the JSON null", async () => {
  assertEquals(await createJsonCipher(makeSigner()).decrypt(PUB, "enc:null"), ok(null))
})

Deno.test("createJsonCipher - encrypt fails when nip44 fails instead of falling back to nip04", async () => {
  let nip04Calls = 0
  const signer = makeSigner({
    nip44Encrypt: () => Promise.resolve(failure({ type: "encrypt-failed", message: "no nip44" })),
    nip04Encrypt: (_pubkey, plaintext) => {
      nip04Calls++
      return Promise.resolve(ok(`nip04:${plaintext}`))
    },
  })
  const result = await createJsonCipher(signer).encrypt(PUB, { a: 1 })
  assertEquals({ type: isFailure(result) && result.error.type, nip04Calls }, { type: "encrypt-failed", nip04Calls: 0 })
})

Deno.test("cipherSchemeOf - a payload carrying NIP-04's ?iv= separator was written under NIP-04", () => {
  assertEquals(cipherSchemeOf("Y2lwaGVy?iv=aXZpdml2aXZpdml2aXZpdg=="), "nip04")
})

Deno.test("cipherSchemeOf - any other payload was written under NIP-44", () => {
  assertEquals(cipherSchemeOf("AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), "nip44")
})

Deno.test("createJsonCipher - encrypt fails with the signer's own SignerFailure, the one way encrypting fails", async () => {
  const signerFailure: SignerFailure = { type: "rejected", message: "user rejected the request" }
  const signer = makeSigner({ nip44Encrypt: () => Promise.resolve(failure(signerFailure)) })
  assertEquals(await createJsonCipher(signer).encrypt(PUB, { a: 1 }), failure(signerFailure))
})

Deno.test("JsonDecryptFailure - decrypting JSON never reads its shape, which only its caller knows", () => {
  // @ts-expect-error: a payload's shape is checked by decryptPrivateEntries, never by the JSON cipher
  const shapeFailure: JsonDecryptFailure = { type: "json-shape-mismatch" }
  assertEquals(shapeFailure.type, "json-shape-mismatch")
})
