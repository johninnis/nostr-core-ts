import { assertEquals, assertRejects } from "@std/assert"
import { createLocalSigner, type LocalSignerTools } from "../../src/infrastructure/adapter/local-signer-adapter.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"
import { isFailure, isOk } from "../../src/domain/value-object/result.ts"
import { parseSig } from "../../src/domain/value-object/sig.ts"

const pubkey = parsePublicKey("a".repeat(64))
const secretKey = new Uint8Array(32)
const TEST_SIG = parseSig("c".repeat(128))

const baseTools: LocalSignerTools = {
  getPublicKey: () => pubkey,
  schnorrSign: () => TEST_SIG,
  getNip44ConversationKey: () => new Uint8Array(32),
  nip44Encrypt: (_ck, plaintext) => `n44:${plaintext}`,
  nip44Decrypt: (_ck, payload) => payload.replace(/^n44:/, ""),
  nip04Encrypt: (_sk, _pk, plaintext) => Promise.resolve(`n04:${plaintext}`),
  nip04Decrypt: (_sk, _pk, ciphertext) => Promise.resolve(ciphertext.replace(/^n04:/, "")),
}

Deno.test("createLocalSigner - derives the public key from the secret via tools.getPublicKey", async () => {
  const signer = createLocalSigner(secretKey, baseTools)
  assertEquals(await signer.getPublicKey(), pubkey)
})

Deno.test("createLocalSigner - signEvent computes id, signs, and assembles the NostrEvent", async () => {
  const signer = createLocalSigner(secretKey, baseTools)
  const event = await signer.signEvent({ kind: 1, content: "hi", tags: [], created_at: 1 })
  assertEquals(event.content, "hi")
  assertEquals(event.pubkey, pubkey)
  assertEquals(event.sig, TEST_SIG)
  assertEquals(event.id.length, 64)
})

Deno.test("createLocalSigner - nip44Encrypt returns ok with the ciphertext", async () => {
  const signer = createLocalSigner(secretKey, baseTools)
  const result = await signer.nip44Encrypt(pubkey, "hello")
  assertEquals(isOk(result) && result.value, "n44:hello")
})

Deno.test("createLocalSigner - nip44 round-trips plaintext", async () => {
  const signer = createLocalSigner(secretKey, baseTools)
  const encrypted = await signer.nip44Encrypt(pubkey, "secret")
  assertEquals(isOk(encrypted), true)
  if (!isOk(encrypted)) return
  const decrypted = await signer.nip44Decrypt(pubkey, encrypted.value)
  assertEquals(isOk(decrypted) && decrypted.value, "secret")
})

Deno.test("createLocalSigner - nip44Encrypt maps a thrown error to a failure", async () => {
  const signer = createLocalSigner(secretKey, {
    ...baseTools,
    nip44Encrypt: () => {
      throw new Error("bad key")
    },
  })
  const result = await signer.nip44Encrypt(pubkey, "hello")
  assertEquals(isFailure(result) && result.error.tag, "encrypt-failed")
})

Deno.test("createLocalSigner - nip44Decrypt maps a thrown error to a failure", async () => {
  const signer = createLocalSigner(secretKey, {
    ...baseTools,
    nip44Decrypt: () => {
      throw new Error("corrupt")
    },
  })
  const result = await signer.nip44Decrypt(pubkey, "n44:x")
  assertEquals(isFailure(result) && result.error.tag, "decrypt-failed")
})

Deno.test("createLocalSigner - nip04 round-trips plaintext", async () => {
  const signer = createLocalSigner(secretKey, baseTools)
  const encrypted = await signer.nip04Encrypt(pubkey, "legacy")
  assertEquals(isOk(encrypted), true)
  if (!isOk(encrypted)) return
  const decrypted = await signer.nip04Decrypt(pubkey, encrypted.value)
  assertEquals(isOk(decrypted) && decrypted.value, "legacy")
})

Deno.test("createLocalSigner - nip04Encrypt maps a rejected promise to a failure", async () => {
  const signer = createLocalSigner(secretKey, {
    ...baseTools,
    nip04Encrypt: () => Promise.reject(new Error("no nip04")),
  })
  const result = await signer.nip04Encrypt(pubkey, "hello")
  assertEquals(isFailure(result) && result.error.tag, "encrypt-failed")
})

Deno.test("createLocalSigner - omitting tools uses defaultLocalSignerTools", async () => {
  const signer = createLocalSigner(new Uint8Array(32).fill(1))
  const derived = await signer.getPublicKey()
  assertEquals(derived.length, 64)
})

Deno.test("createLocalSigner - signEvent surfaces a thrown schnorr failure as a thrown Error", async () => {
  const signer = createLocalSigner(secretKey, {
    ...baseTools,
    schnorrSign: () => {
      throw new Error("bad sig")
    },
  })
  await assertRejects(() => signer.signEvent({ kind: 1, content: "x", tags: [], created_at: 1 }), Error, "bad sig")
})
