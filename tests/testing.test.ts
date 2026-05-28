import { assert, assertEquals, assertNotEquals } from "@std/assert"
import { buildEventFixture, createEventFactory, createMockSigner, resetEventFixtureCounter } from "../testing.ts"
import { parsePublicKey } from "../src/domain/value-object/public-key.ts"

Deno.test("buildEventFixture - deterministic, counter-based ids", () => {
  resetEventFixtureCounter()
  const first = buildEventFixture()
  const second = buildEventFixture()
  assertNotEquals(first.id, second.id)
  assert(first.id.endsWith("1"))
  assert(second.id.endsWith("2"))
})

Deno.test("buildEventFixture - overrides every field that is provided", () => {
  resetEventFixtureCounter()
  const PK = parsePublicKey("a".repeat(64))
  const event = buildEventFixture({ kind: 7, content: "+", pubkey: PK, created_at: 42 })
  assertEquals(event.kind, 7)
  assertEquals(event.content, "+")
  assertEquals(event.pubkey, PK)
  assertEquals(event.created_at, 42)
})

Deno.test("createEventFactory - isolated from the module-global counter", () => {
  resetEventFixtureCounter()
  buildEventFixture()
  const factory = createEventFactory()
  const a = factory.build()
  const b = factory.build()
  assert(a.id.endsWith("1"))
  assert(b.id.endsWith("2"))
  // module-global counter was at 1; factory's counter is independent.
  const next = buildEventFixture()
  assert(next.id.endsWith("2"))
})

Deno.test("createEventFactory - startAt seed and reset", () => {
  const factory = createEventFactory({ startAt: 100 })
  const a = factory.build()
  assertEquals(parseInt(a.id, 16), 101)
  factory.reset()
  const after = factory.build()
  assertEquals(parseInt(after.id, 16), 101)
})

Deno.test("createMockSigner - getPublicKey resolves to the supplied pubkey", async () => {
  const PK = parsePublicKey("d".repeat(64))
  const signer = createMockSigner({ pubkey: PK })
  assertEquals(await signer.getPublicKey(), PK)
})

Deno.test("createMockSigner - unspecified nip44Encrypt returns no-signer failure", async () => {
  const PK = parsePublicKey("d".repeat(64))
  const signer = createMockSigner({ pubkey: PK })
  const result = await signer.nip44Encrypt(PK, "hi")
  assert(!result.success)
  assertEquals(result.error.tag, "no-signer")
})

Deno.test("createMockSigner - default signEvent wraps overrides into a buildEventFixture fixture", async () => {
  const PK = parsePublicKey("e".repeat(64))
  const signer = createMockSigner({ pubkey: PK })
  const event = await signer.signEvent({ kind: 1, content: "x", tags: [], created_at: 1 })
  assertEquals(event.pubkey, PK)
  assertEquals(event.content, "x")
})
