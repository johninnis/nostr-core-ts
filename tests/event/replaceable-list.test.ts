import { assert, assertEquals, assertRejects } from "@std/assert"
import { buildNewListEvent, buildReplaceableListEvent } from "../../src/application/service/replaceable-list.ts"
import type { Signer } from "../../src/domain/service/signer.ts"
import { failure, isFailure, isOk, ok } from "../../src/domain/value-object/result.ts"
import { now } from "../../src/domain/service/timestamp.ts"
import type { Tag } from "../../src/domain/value-object/nostr-event.ts"
import { publicKeyFixture } from "../../testing.ts"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"

const AUTHOR = publicKeyFixture("a".repeat(64))
const TARGET = "b".repeat(64)
const OTHER = "c".repeat(64)

const makeSigner = (): Signer => ({
  kind: "local",
  getPublicKey: () => Promise.resolve(ok(AUTHOR)),
  signEvent: () => Promise.resolve(failure({ type: "no-signer", message: "not exercised" })),
  nip04Encrypt: () => Promise.resolve(ok("")),
  nip04Decrypt: () => Promise.resolve(ok("")),
  nip44Encrypt: (_pubkey, plaintext) => Promise.resolve(ok(`enc:${plaintext}`)),
  nip44Decrypt: (_pubkey, ciphertext) => Promise.resolve(ok(ciphertext.replace(/^enc:/, ""))),
})

Deno.test("public write on replaceable kind - adds pubkey, preserves opaque content", async () => {
  const result = await buildReplaceableListEvent({
    kind: 10000,
    visibility: "public",
    current: { publicTags: [["p", OTHER]], privateTags: [["p", "hidden"]], content: "enc:pre-existing-blob" },
    modifyTags: (tags) => [...tags, ["p", TARGET]],
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result) && result.value.type === "changed")
  assertEquals(result.value.template.kind, 10000)
  assertEquals(result.value.template.tags, [["p", OTHER], ["p", TARGET]])
  assertEquals(result.value.template.content, "enc:pre-existing-blob")
  assertEquals(result.value.nextPrivateTags, [["p", "hidden"]])
})

Deno.test("public write reports unchanged when modifyTags returns same array", async () => {
  const result = await buildReplaceableListEvent({
    kind: 10000,
    visibility: "public",
    current: { publicTags: [["p", OTHER]], privateTags: [], content: "" },
    modifyTags: (tags) => tags,
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result))
  assertEquals(result.value, { type: "unchanged" })
})

Deno.test("public write reports unchanged when modifyTags returns a copy holding the same tags", async () => {
  const result = await buildReplaceableListEvent({
    kind: 10000,
    visibility: "public",
    current: { publicTags: [["p", OTHER], ["t", "x"]], privateTags: [], content: "" },
    modifyTags: (tags) => tags.map((tag): Tag => [...tag]),
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
  })

  assertEquals(result, ok({ type: "unchanged" }))
})

Deno.test("private write reports changed when modifyTags reorders the tags, since a list is ordered (NIP-51)", async () => {
  const result = await buildReplaceableListEvent({
    kind: 10000,
    visibility: "private",
    current: { publicTags: [], privateTags: [["p", OTHER], ["p", TARGET]], content: "" },
    modifyTags: (tags) => tags.toReversed(),
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
  })

  assert(isOk(result))
  assertEquals(result.value.type, "changed")
})

Deno.test("stamps created_at with the clock when no createdAt is given (ADR-0007)", async () => {
  const before = now()
  const result = await buildNewListEvent({
    kind: 10000,
    visibility: "public",
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
  })

  assert(isOk(result))
  assert(result.value.template.created_at >= before && result.value.template.created_at <= now())
})

Deno.test("private write of a list held under legacy NIP-04 encryption writes NIP-44 (NIP-51)", async () => {
  const result = await buildReplaceableListEvent({
    kind: 10000,
    visibility: "private",
    current: { publicTags: [], privateTags: [["p", OTHER]], content: "legacy?iv=abc" },
    modifyTags: (tags) => [...tags, ["p", TARGET]],
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result) && result.value.type === "changed")
  assertEquals(result.value.template.content, `enc:${JSON.stringify([["p", OTHER], ["p", TARGET]])}`)
})

Deno.test("private write - encrypts new private tags, preserves public tags", async () => {
  const result = await buildReplaceableListEvent({
    kind: 10000,
    visibility: "private",
    current: { publicTags: [["p", OTHER]], privateTags: [], content: "" },
    modifyTags: (tags) => [...tags, ["p", TARGET]],
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result) && result.value.type === "changed")
  assertEquals(result.value.template.tags, [["p", OTHER]])
  assertEquals(result.value.template.content, `enc:[["p","${TARGET}"]]`)
  assertEquals(result.value.nextPrivateTags, [["p", TARGET]])
})

Deno.test("private write reports unchanged when modifyTags returns same array", async () => {
  const result = await buildReplaceableListEvent({
    kind: 10000,
    visibility: "private",
    current: { publicTags: [], privateTags: [["p", TARGET]], content: "enc:existing" },
    modifyTags: (tags) => tags,
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result))
  assertEquals(result.value, { type: "unchanged" })
})

Deno.test("public write on addressable kind - ensures d-tag in published event", async () => {
  const result = await buildReplaceableListEvent({
    kind: 30000,
    dTag: "close-friends",
    visibility: "public",
    current: { publicTags: [["d", "close-friends"]], privateTags: [], content: "" },
    modifyTags: (tags) => [...tags, ["p", TARGET]],
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result) && result.value.type === "changed")
  assert(result.value.template.tags.some((t) => t[0] === "d" && t[1] === "close-friends"))
  assert(result.value.template.tags.some((t) => t[0] === "p" && t[1] === TARGET))
})

Deno.test("public write re-adds d-tag if modifyTags strips it", async () => {
  const result = await buildReplaceableListEvent({
    kind: 30000,
    dTag: "my-list",
    visibility: "public",
    current: { publicTags: [["d", "my-list"], ["p", OTHER]], privateTags: [], content: "" },
    modifyTags: (tags) => tags.filter((t) => t[0] !== "d"),
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result) && result.value.type === "changed")
  assertEquals(result.value.template.tags[0], ["d", "my-list"])
})

Deno.test("public write writes the target's d tag in place of a disagreeing one modifyTags kept", async () => {
  const result = await buildReplaceableListEvent({
    kind: 30000,
    dTag: "my-list",
    visibility: "public",
    current: { publicTags: [["p", OTHER], ["d", "other-list"], ["d", "my-list"]], privateTags: [], content: "" },
    modifyTags: (tags) => [...tags, ["p", TARGET]],
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result) && result.value.type === "changed")
  assertEquals(result.value.template.tags, [["d", "my-list"], ["p", OTHER], ["p", TARGET]])
})

Deno.test("private write on addressable kind - encrypts content, keeps d-tag public", async () => {
  const result = await buildReplaceableListEvent({
    kind: 30000,
    dTag: "secret-list",
    visibility: "private",
    current: { publicTags: [["d", "secret-list"]], privateTags: [], content: "" },
    modifyTags: (tags) => [...tags, ["p", TARGET]],
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result) && result.value.type === "changed")
  assertEquals(result.value.template.tags, [["d", "secret-list"]])
  assertEquals(result.value.template.content, `enc:[["p","${TARGET}"]]`)
  assertEquals(result.value.nextPrivateTags, [["p", TARGET]])
})

Deno.test("private write returns the signer's own SignerFailure when nip44Encrypt fails", async () => {
  const failingSigner: Signer = {
    kind: "local",
    getPublicKey: () => Promise.resolve(ok(AUTHOR)),
    signEvent: () => Promise.resolve(failure({ type: "no-signer", message: "not exercised" })),
    nip04Encrypt: () => Promise.resolve(ok("")),
    nip04Decrypt: () => Promise.resolve(ok("")),
    nip44Encrypt: () => Promise.resolve(failure({ type: "encrypt-failed", message: "underlying signer refused" })),
    nip44Decrypt: () => Promise.resolve(ok("")),
  }
  const result = await buildReplaceableListEvent({
    kind: 10000,
    visibility: "private",
    current: { publicTags: [], privateTags: [], content: "" },
    modifyTags: (tags) => [...tags, ["p", TARGET]],
    cipher: failingSigner,
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isFailure(result))
  assertEquals(result.error, { type: "encrypt-failed", message: "underlying signer refused" })
})

Deno.test("buildNewListEvent - empty public list carries just the d-tag and empty content", async () => {
  const result = await buildNewListEvent({
    kind: 30000,
    dTag: "friends",
    visibility: "public",
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result))
  assertEquals(result.value.template.tags, [["d", "friends"]])
  assertEquals(result.value.template.content, "")
  assertEquals(result.value.privateTags, [])
})

Deno.test("buildNewListEvent - empty private list encrypts empty entries", async () => {
  const result = await buildNewListEvent({
    kind: 30000,
    dTag: "secret",
    visibility: "private",
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result))
  assertEquals(result.value.template.tags, [["d", "secret"]])
  assertEquals(result.value.template.content, "enc:[]")
  assertEquals(result.value.privateTags, [])
})

Deno.test("buildNewListEvent - public entries go in tags alongside the d-tag", async () => {
  const result = await buildNewListEvent({
    kind: 30000,
    dTag: "friends",
    visibility: "public",
    entries: [["p", TARGET]],
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result))
  assertEquals(result.value.template.tags, [["d", "friends"], ["p", TARGET]])
  assertEquals(result.value.template.content, "")
  assertEquals(result.value.privateTags, [])
})

Deno.test("buildNewListEvent - private entries are encrypted, only d-tag stays public", async () => {
  const result = await buildNewListEvent({
    kind: 30000,
    dTag: "secret",
    visibility: "private",
    entries: [["p", TARGET]],
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result))
  assertEquals(result.value.template.tags, [["d", "secret"]])
  assertEquals(result.value.template.content, `enc:[["p","${TARGET}"]]`)
  assertEquals(result.value.privateTags, [["p", TARGET]])
})

Deno.test("buildNewListEvent - returns the signer's own SignerFailure when nip44Encrypt fails", async () => {
  const failingSigner: Signer = {
    kind: "local",
    getPublicKey: () => Promise.resolve(ok(AUTHOR)),
    signEvent: () => Promise.resolve(failure({ type: "no-signer", message: "not exercised" })),
    nip04Encrypt: () => Promise.resolve(ok("")),
    nip04Decrypt: () => Promise.resolve(ok("")),
    nip44Encrypt: () => Promise.resolve(failure({ type: "encrypt-failed", message: "underlying signer refused" })),
    nip44Decrypt: () => Promise.resolve(ok("")),
  }
  const result = await buildNewListEvent({
    kind: 30000,
    dTag: "secret",
    visibility: "private",
    cipher: failingSigner,
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isFailure(result))
  assertEquals(result.error.type, "encrypt-failed")
})

Deno.test("createdAt is set on the template", async () => {
  const result = await buildReplaceableListEvent({
    kind: 10000,
    visibility: "public",
    current: { publicTags: [], privateTags: [], content: "" },
    modifyTags: (tags) => [...tags, ["p", TARGET]],
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000042,
  })

  assert(isOk(result) && result.value.type === "changed")
  assertEquals(result.value.template.created_at, 1700000042)
})

Deno.test("buildNewListEvent - an addressable list with no identifier still writes an empty d tag (NIP-01)", async () => {
  const result = await buildNewListEvent({
    kind: 30000,
    visibility: "public",
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result))
  assertEquals(result.value.template.tags, [["d", ""]])
})

Deno.test("public write on an addressable kind with an empty d tag writes the empty d tag", async () => {
  const result = await buildReplaceableListEvent({
    kind: 30000,
    dTag: "",
    visibility: "public",
    current: { publicTags: [], privateTags: [], content: "" },
    modifyTags: (tags) => [...tags, ["p", TARGET]],
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result) && result.value.type === "changed")
  assertEquals(result.value.template.tags, [["d", ""], ["p", TARGET]])
})

Deno.test("buildNewListEvent - a d tag on a replaceable kind throws rather than overwrite the author's one list", async () => {
  await assertRejects(
    () =>
      buildNewListEvent({
        kind: 10000,
        dTag: "work",
        visibility: "public",
        cipher: makeSigner(),
        authorPubkey: AUTHOR,
      }),
    InvalidArgumentError,
  )
})

Deno.test("buildNewListEvent - a regular kind is not a list and throws", async () => {
  await assertRejects(
    () => buildNewListEvent({ kind: 1, visibility: "public", cipher: makeSigner(), authorPubkey: AUTHOR }),
    InvalidArgumentError,
  )
})

Deno.test("buildNewListEvent - a replaceable list writes no d tag", async () => {
  const result = await buildNewListEvent({
    kind: 10000,
    dTag: "",
    visibility: "public",
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result))
  assertEquals(result.value.template.tags, [])
})

Deno.test("buildReplaceableListEvent - a d tag on a replaceable kind throws", async () => {
  await assertRejects(
    () =>
      buildReplaceableListEvent({
        kind: 10000,
        dTag: "work",
        visibility: "public",
        current: { publicTags: [], privateTags: [], content: "" },
        modifyTags: (tags) => [...tags, ["p", TARGET]],
        cipher: makeSigner(),
        authorPubkey: AUTHOR,
      }),
    InvalidArgumentError,
  )
})

Deno.test("buildNewListEvent - a d tag among public entries gives way to the target's", async () => {
  const result = await buildNewListEvent({
    kind: 30000,
    dTag: "friends",
    visibility: "public",
    entries: [["p", TARGET], ["d", "enemies"]],
    cipher: makeSigner(),
    authorPubkey: AUTHOR,
    createdAt: 1700000000,
  })

  assert(isOk(result))
  assertEquals(result.value.template.tags, [["d", "friends"], ["p", TARGET]])
})
