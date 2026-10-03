import { assertEquals, assertThrows } from "@std/assert"
import { createNip98Validator } from "../../src/application/service/nip98-validator.ts"
import type { Nip98ReplayGuard } from "../../src/application/port/nip98-replay-guard.ts"
import { InvalidArgumentError } from "../../src/domain/exception/invalid-argument-error.ts"
import { KIND_HTTP_AUTH } from "../../src/domain/value-object/kinds.ts"
import type { NostrEvent } from "../../src/domain/value-object/nostr-event.ts"
import { createLocalSigner } from "../../src/infrastructure/crypto/local-signer.ts"
import { secretKeyOf } from "../support/keys.ts"
import { httpUrlFixture } from "../../testing.ts"

const AT = 1800000000

const acceptEveryEvent: Nip98ReplayGuard = { recordOnce: () => Promise.resolve(true) }

const signedAuth = async (createdAt: number): Promise<NostrEvent> => {
  const signed = await createLocalSigner(secretKeyOf(0x11)).signEvent({
    kind: KIND_HTTP_AUTH,
    created_at: createdAt,
    tags: [["u", "https://relay.example"], ["method", "POST"]],
    content: "",
  })
  if (!signed.success) throw new Error("a local signer always signs")
  return signed.value
}

for (const tolerance of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  Deno.test(`createNip98Validator - a timestampTolerance of ${tolerance}, not a safe integer >= 0, throws`, () => {
    assertThrows(() => createNip98Validator(acceptEveryEvent, tolerance, () => AT), InvalidArgumentError)
  })
}

Deno.test("validate - a timestampTolerance of 0 accepts only an event created at the clock's second", async () => {
  const validator = createNip98Validator(acceptEveryEvent, 0, () => AT)
  const accepts = async (createdAt: number): Promise<boolean> =>
    (await validator.validate({
      event: await signedAuth(createdAt),
      url: httpUrlFixture("https://relay.example"),
      method: "POST",
    }))
      .success
  assertEquals([await accepts(AT), await accepts(AT - 1), await accepts(AT + 1)], [true, false, false])
})

for (const [tolerance, window] of [[0, 1], [60, 121]]) {
  Deno.test(`validate - a timestampTolerance of ${tolerance} records each event against replay for the ${window}-second inclusive window`, async () => {
    const ttls: Array<number> = []
    const recording: Nip98ReplayGuard = {
      recordOnce: (_eventId, ttlSeconds) => {
        ttls.push(ttlSeconds)
        return Promise.resolve(true)
      },
    }
    const validator = createNip98Validator(recording, tolerance, () => AT)
    await validator.validate({
      event: await signedAuth(AT),
      url: httpUrlFixture("https://relay.example"),
      method: "POST",
    })
    assertEquals(ttls, [window])
  })
}

for (const tolerance of [0, 60]) {
  Deno.test(`validate - a timestampTolerance of ${tolerance} refuses a replay at the last second the event is in the window`, async () => {
    let clock = AT
    const expiries = new Map<string, number>()
    const expiringGuard: Nip98ReplayGuard = {
      recordOnce: (eventId, ttlSeconds) => {
        const expiry = expiries.get(eventId)
        if (expiry !== undefined && clock < expiry) return Promise.resolve(false)
        expiries.set(eventId, clock + ttlSeconds)
        return Promise.resolve(true)
      },
    }
    const validator = createNip98Validator(expiringGuard, tolerance, () => clock)
    const request = {
      event: await signedAuth(AT + tolerance),
      url: httpUrlFixture("https://relay.example"),
      method: "POST",
    }
    await validator.validate(request)
    clock = AT + 2 * tolerance
    assertEquals(await validator.validate(request), { success: false, error: "replay" })
  })
}
