import { assertEquals } from "@std/assert"
import { decryptPrivateEntries } from "../../src/application/service/private-list.ts"
import { createLocalSigner } from "../../src/infrastructure/crypto/local-signer.ts"
import type { Signer } from "../../src/domain/service/signer.ts"
import { KIND_MUTE_LIST } from "../../src/domain/value-object/kinds.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"
import { createStubSigner, sigFixture } from "../../testing.ts"
import type { StubSignerCipherFn } from "../../testing.ts"
import { keyPairOf } from "../support/keys.ts"

const author = keyPairOf(7)

const signedList = async (content: string): Promise<NostrEvent> => {
  const signed = await createLocalSigner(author.sk).signEvent({
    kind: KIND_MUTE_LIST,
    created_at: 1700000000,
    tags: [],
    content,
  })
  if (!signed.success) throw new Error(signed.error.message)
  return signed.value
}

const cipherDecrypting = (nip44Decrypt: StubSignerCipherFn): Signer =>
  createStubSigner({ pubkey: author.pk, nip44Decrypt })

const decryptsTo = (plaintext: string): Signer => cipherDecrypting(() => ok(plaintext))

const mustNotDecrypt = (): ReturnType<StubSignerCipherFn> =>
  failure({ type: "decrypt-failed", message: "must not be called" })

Deno.test("decryptPrivateEntries - an empty content is an empty list without decrypting", async () => {
  assertEquals(await decryptPrivateEntries(cipherDecrypting(mustNotDecrypt), await signedList("")), ok([]))
})

Deno.test("decryptPrivateEntries - returns the decrypted tags, dropping malformed rows", async () => {
  const result = await decryptPrivateEntries(
    decryptsTo('[["p","abc"],[1],["t","secret"]]'),
    await signedList("ciphertext"),
  )
  assertEquals(result, ok([["p", "abc"], ["t", "secret"]]))
})

Deno.test("decryptPrivateEntries - decrypts the list's content with NIP-44 from the list's author", async () => {
  const seen: Array<string> = []
  const cipher = cipherDecrypting((pubkey, ciphertext) => {
    seen.push(`${pubkey}:${ciphertext}`)
    return ok("[]")
  })
  await decryptPrivateEntries(cipher, await signedList("ciphertext"))
  assertEquals(seen, [`${author.pk}:ciphertext`])
})

Deno.test("decryptPrivateEntries - refuses a list whose signature does not verify, before decrypting (NIP-44)", async () => {
  const forged = { ...await signedList("ciphertext"), sig: sigFixture("c".repeat(128)) }
  const result = await decryptPrivateEntries(cipherDecrypting(mustNotDecrypt), forged)
  assertEquals(result, failure({ type: "signature-invalid" }))
})

const LEGACY_CIPHERTEXT = "TJob1dQrf2ndsmdbeGU+05HT5GMnBSx3fx8QdDY/g3M=?iv=S3rFeFr1gsYqmQA7bNnNTQ=="

Deno.test("decryptPrivateEntries - decrypts legacy content carrying ?iv= with NIP-04 (NIP-51 backward compatibility)", async () => {
  const cipher = createStubSigner({
    pubkey: author.pk,
    nip04Decrypt: (_pubkey, ciphertext) => ok(ciphertext === LEGACY_CIPHERTEXT ? '[["t","legacy"]]' : "[]"),
    nip44Decrypt: mustNotDecrypt,
  })
  assertEquals(await decryptPrivateEntries(cipher, await signedList(LEGACY_CIPHERTEXT)), ok([["t", "legacy"]]))
})

Deno.test("decryptPrivateEntries - reads NIP-44 content that happens to hold the letters iv with NIP-44", async () => {
  const cipher = createStubSigner({
    pubkey: author.pk,
    nip04Decrypt: mustNotDecrypt,
    nip44Decrypt: () => ok('[["t","modern"]]'),
  })
  assertEquals(await decryptPrivateEntries(cipher, await signedList("AgivAbCd==")), ok([["t", "modern"]]))
})

Deno.test("decryptPrivateEntries - fails with signer-failed when decryption fails", async () => {
  const result = await decryptPrivateEntries(
    cipherDecrypting(() => failure({ type: "decrypt-failed", message: "no" })),
    await signedList("ciphertext"),
  )
  assertEquals(result.success ? null : result.error.type, "signer-failed")
})

Deno.test("decryptPrivateEntries - fails with json-parse-failed for invalid JSON", async () => {
  const result = await decryptPrivateEntries(decryptsTo("not json"), await signedList("ciphertext"))
  assertEquals(result.success ? null : result.error.type, "json-parse-failed")
})

Deno.test("decryptPrivateEntries - fails with json-shape-mismatch for JSON that is not an array", async () => {
  const result = await decryptPrivateEntries(decryptsTo('{"not":"array"}'), await signedList("ciphertext"))
  assertEquals(result.success ? null : result.error.type, "json-shape-mismatch")
})

Deno.test("decryptPrivateEntries - fails with json-shape-mismatch for the JSON null", async () => {
  const result = await decryptPrivateEntries(decryptsTo("null"), await signedList("ciphertext"))
  assertEquals(result.success ? null : result.error.type, "json-shape-mismatch")
})
