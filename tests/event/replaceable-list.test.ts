import { assert, assertEquals } from "@std/assert"
import { buildReplaceableListEvent } from "../../src/domain/service/replaceable-list.ts"
import { EncryptionError } from "../../src/domain/exception/encryption-error.ts"
import type { Signer } from "../../src/domain/service/signer.ts"
import { failure, isFailure, isOk, ok } from "../../src/domain/value-object/result.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"
import { SignerError } from "../../src/domain/exception/signer-error.ts"

const AUTHOR = parsePublicKey("a".repeat(64))
const TARGET = "b".repeat(64)
const OTHER = "c".repeat(64)

const makeSigner = (): Signer => ({
  kind: "local",
  getPublicKey: () => Promise.resolve(AUTHOR),
  signEvent: () => Promise.reject(new Error("not exercised")),
  nip04Encrypt: () => Promise.resolve(ok("")),
  nip04Decrypt: () => Promise.resolve(ok("")),
  nip44Encrypt: (_pubkey, plaintext) => Promise.resolve(ok(`enc:${plaintext}`)),
  nip44Decrypt: (_pubkey, ciphertext) => Promise.resolve(ok(ciphertext.replace(/^enc:/, ""))),
})

Deno.test("public write on replaceable kind - adds pubkey, preserves opaque content", async () => {
  const result = await buildReplaceableListEvent({
    kind: 10000,
    visibility: "public",
    currentPublicTags: [["p", OTHER]],
    currentPrivateTags: [["p", "hidden"]],
    currentContent: "enc:pre-existing-blob",
    modifyTags: (tags) => [...tags, ["p", TARGET]],
    signer: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result) && result.value !== null)
  assertEquals(result.value.template.kind, 10000)
  assertEquals(result.value.template.tags, [["p", OTHER], ["p", TARGET]])
  assertEquals(result.value.template.content, "enc:pre-existing-blob")
  assertEquals(result.value.nextPrivateTags, [["p", "hidden"]])
})

Deno.test("public write returns ok(null) when modifyTags returns same array", async () => {
  const result = await buildReplaceableListEvent({
    kind: 10000,
    visibility: "public",
    currentPublicTags: [["p", OTHER]],
    currentPrivateTags: [],
    currentContent: "",
    modifyTags: (tags) => tags,
    signer: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result))
  assertEquals(result.value, null)
})

Deno.test("private write - encrypts new private tags, preserves public tags", async () => {
  const result = await buildReplaceableListEvent({
    kind: 10000,
    visibility: "private",
    currentPublicTags: [["p", OTHER]],
    currentPrivateTags: [],
    currentContent: "",
    modifyTags: (tags) => [...tags, ["p", TARGET]],
    signer: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result) && result.value !== null)
  assertEquals(result.value.template.tags, [["p", OTHER]])
  assertEquals(result.value.template.content, `enc:[["p","${TARGET}"]]`)
  assertEquals(result.value.nextPrivateTags, [["p", TARGET]])
})

Deno.test("private write returns ok(null) when modifyTags returns same array", async () => {
  const result = await buildReplaceableListEvent({
    kind: 10000,
    visibility: "private",
    currentPublicTags: [],
    currentPrivateTags: [["p", TARGET]],
    currentContent: "enc:existing",
    modifyTags: (tags) => tags,
    signer: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result))
  assertEquals(result.value, null)
})

Deno.test("public write on addressable kind - ensures d-tag in published event", async () => {
  const result = await buildReplaceableListEvent({
    kind: 30000,
    dTag: "close-friends",
    visibility: "public",
    currentPublicTags: [["d", "close-friends"]],
    currentPrivateTags: [],
    currentContent: "",
    modifyTags: (tags) => [...tags, ["p", TARGET]],
    signer: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result) && result.value !== null)
  assert(result.value.template.tags.some((t) => t[0] === "d" && t[1] === "close-friends"))
  assert(result.value.template.tags.some((t) => t[0] === "p" && t[1] === TARGET))
})

Deno.test("public write re-adds d-tag if modifyTags strips it", async () => {
  const result = await buildReplaceableListEvent({
    kind: 30000,
    dTag: "my-list",
    visibility: "public",
    currentPublicTags: [["d", "my-list"], ["p", OTHER]],
    currentPrivateTags: [],
    currentContent: "",
    modifyTags: (tags) => tags.filter((t) => t[0] !== "d"),
    signer: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result) && result.value !== null)
  assertEquals(result.value.template.tags[0], ["d", "my-list"])
})

Deno.test("private write on addressable kind - encrypts content, keeps d-tag public", async () => {
  const result = await buildReplaceableListEvent({
    kind: 30000,
    dTag: "secret-list",
    visibility: "private",
    currentPublicTags: [["d", "secret-list"]],
    currentPrivateTags: [],
    currentContent: "",
    modifyTags: (tags) => [...tags, ["p", TARGET]],
    signer: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result) && result.value !== null)
  assertEquals(result.value.template.tags, [["d", "secret-list"]])
  assertEquals(result.value.template.content, `enc:[["p","${TARGET}"]]`)
  assertEquals(result.value.nextPrivateTags, [["p", TARGET]])
})

Deno.test("private write returns Failure(EncryptionError) when nip44Encrypt fails", async () => {
  const failingSigner: Signer = {
    kind: "local",
    getPublicKey: () => Promise.resolve(AUTHOR),
    signEvent: () => Promise.reject(new Error("not exercised")),
    nip04Encrypt: () => Promise.resolve(ok("")),
    nip04Decrypt: () => Promise.resolve(ok("")),
    nip44Encrypt: () => Promise.resolve(failure(new SignerError("encrypt-failed", "underlying signer refused"))),
    nip44Decrypt: () => Promise.resolve(ok("")),
  }
  const result = await buildReplaceableListEvent({
    kind: 10000,
    visibility: "private",
    currentPublicTags: [],
    currentPrivateTags: [],
    currentContent: "",
    modifyTags: (tags) => [...tags, ["p", TARGET]],
    signer: failingSigner,
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isFailure(result))
  assert(result.error instanceof EncryptionError)
  assertEquals(result.error.cause?.tag, "signer-failed")
  assertEquals(result.error.message.startsWith("buildReplaceableListEvent: signer-failed:"), true)
})

Deno.test("createdAt is set on the template", async () => {
  const result = await buildReplaceableListEvent({
    kind: 10000,
    visibility: "public",
    currentPublicTags: [],
    currentPrivateTags: [],
    currentContent: "",
    modifyTags: (tags) => [...tags, ["p", TARGET]],
    signer: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000042,
  })

  assert(isOk(result) && result.value !== null)
  assertEquals(result.value.template.created_at, 1700000042)
})
