import { assert, assertEquals, assertNotEquals, assertRejects, assertThrows } from "@std/assert"
import {
  buildEventFixture,
  buildSignedEventFixture,
  createStubSigner,
  httpUrlFixture,
  lightningAddressFixture,
  lnurlFixture,
  publicKeyFixture,
} from "../testing.ts"
import { InvalidArgumentError } from "../src/domain/exception/invalid-argument-error.ts"
import { computeEventId } from "../src/domain/service/event-id.ts"
import { verifyEventSignature } from "../src/domain/service/verify.ts"
import { keyPairOf } from "./support/keys.ts"

import { failure, ok } from "../src/domain/value-object/result.ts"
Deno.test("buildEventFixture - the same overrides build the same event, whatever was built before", () => {
  assertEquals(buildEventFixture({ content: "a" }), buildEventFixture({ content: "a" }))
})

Deno.test("buildEventFixture - its id is the NIP-01 id of its fields, so events that differ have different ids", () => {
  const event = buildEventFixture({ content: "a" })
  assertEquals(event.id, computeEventId(event))
  assertNotEquals(event.id, buildEventFixture({ content: "b" }).id)
})

Deno.test("buildEventFixture - overrides every field that is provided", () => {
  const PK = publicKeyFixture("a".repeat(64))
  const event = buildEventFixture({ kind: 7, content: "+", pubkey: PK, created_at: 42 })
  assertEquals(event.kind, 7)
  assertEquals(event.content, "+")
  assertEquals(event.pubkey, PK)
  assertEquals(event.created_at, 42)
})

Deno.test("buildEventFixture - keeps an overridden id rather than computing one", () => {
  assertEquals(buildEventFixture({ id: "f".repeat(64) }).id, "f".repeat(64))
})

Deno.test("createStubSigner - getPublicKey resolves to the supplied pubkey", async () => {
  const PK = publicKeyFixture("d".repeat(64))
  const signer = createStubSigner({ pubkey: PK })
  assertEquals(await signer.getPublicKey(), ok(PK))
})

Deno.test("createStubSigner - unspecified nip44Encrypt returns no-signer failure", async () => {
  const PK = publicKeyFixture("d".repeat(64))
  const signer = createStubSigner({ pubkey: PK })
  const result = await signer.nip44Encrypt(PK, "hi")
  assert(!result.success)
  assertEquals(result.error.type, "no-signer")
})

Deno.test("createStubSigner - default signEvent wraps overrides into a buildEventFixture fixture", async () => {
  const PK = publicKeyFixture("e".repeat(64))
  const signer = createStubSigner({ pubkey: PK })
  const signed = await signer.signEvent({ kind: 1, content: "x", tags: [], created_at: 1 })
  assert(signed.success)
  assertEquals(signed.value.pubkey, PK)
  assertEquals(signed.value.content, "x")
})

Deno.test("createStubSigner - signEvent returns the failure its override returns", async () => {
  const PK = publicKeyFixture("e".repeat(64))
  const declined = failure({ type: "rejected" as const, message: "user rejected" })
  const signer = createStubSigner({ pubkey: PK, signEvent: () => declined })
  assertEquals(await signer.signEvent({ kind: 1, content: "x", tags: [], created_at: 1 }), declined)
})

Deno.test("createStubSigner - an override that throws rejects the returned promise rather than throwing", async () => {
  const PK = publicKeyFixture("e".repeat(64))
  const fault = new Error("stub fault")
  const raise = (): never => {
    throw fault
  }
  const signer = createStubSigner({ pubkey: PK, signEvent: raise, nip44Decrypt: raise })
  const signing = signer.signEvent({ kind: 1, content: "x", tags: [], created_at: 1 })
  const decrypting = signer.nip44Decrypt(PK, "x")
  await assertRejects(() => signing, Error, "stub fault")
  await assertRejects(() => decrypting, Error, "stub fault")
})

Deno.test("lightningAddressFixture - brands a LUD-16 address", () => {
  assertEquals(lightningAddressFixture("alice+tip@wallet.example"), "alice+tip@wallet.example")
})

Deno.test("lightningAddressFixture - throws for a value that is not one", () => {
  assertThrows(() => lightningAddressFixture("alice"), InvalidArgumentError)
})

Deno.test("lnurlFixture - brands a LUD-01 LNURL in its lowercase form", () => {
  const lnurl =
    "lnurl1dp68gurn8ghj7um9wfmxjcm99e3k7mf0v9cxj0m385ekvcenxc6r2c35xvukxefcv5mkvv34x5ekzd3ev56nyd3hxqurzepexejxxepnxscrvwfnv9nxzcn9xq6xyefhvgcxxcmyxymnserxfq5fns"
  assertEquals(lnurlFixture(lnurl.toUpperCase()), lnurl)
})

Deno.test("lnurlFixture - throws for a value that is not one", () => {
  assertThrows(() => lnurlFixture("lnurl1"), InvalidArgumentError)
})

Deno.test("buildSignedEventFixture - signs the fixture by the key, so its signature verifies", () => {
  assertEquals(verifyEventSignature(buildSignedEventFixture(keyPairOf(3).sk, { kind: 10000, content: "ct" })), true)
})

Deno.test("buildSignedEventFixture - its pubkey is the signing key's", () => {
  assertEquals(buildSignedEventFixture(keyPairOf(3).sk).pubkey, keyPairOf(3).pk)
})

Deno.test("buildSignedEventFixture - keeps the overridden fields", () => {
  const event = buildSignedEventFixture(keyPairOf(3).sk, { kind: 3, created_at: 5, tags: [["p", "x"]], content: "c" })
  assertEquals([event.kind, event.created_at, event.tags, event.content], [3, 5, [["p", "x"]], "c"])
})

Deno.test("httpUrlFixture - brands a known-good URL in its canonical form", () => {
  assertEquals<string>(httpUrlFixture("HTTPS://Example.COM/a"), "https://example.com/a")
})

Deno.test("httpUrlFixture - throws for a value that is not an http or https URL", () => {
  assertThrows(() => httpUrlFixture("ftp://example.com/a"), InvalidArgumentError)
})
