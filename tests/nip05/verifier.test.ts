import { assertEquals } from "@std/assert"
import type { HttpClient, HttpResponse } from "../../src/application/port/http.ts"
import type { NoAnswerFailure } from "../../src/application/failure/json-fetch-failure.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"
import { createNip05Verifier } from "../../src/application/service/nip05-verifier.ts"
import type { PublicKey } from "../../src/domain/value-object/public-key.ts"
import { nip05IdFixture, publicKeyFixture } from "../../testing.ts"

const PUBKEY = publicKeyFixture("a".repeat(64))
const OTHER = publicKeyFixture("b".repeat(64))

const documentResponse = (names: Record<string, string>): HttpResponse => ({
  status: 200,
  headers: new Headers(),
  json: () => Promise.resolve(ok({ names })),
  text: () => Promise.resolve(ok("")),
  blob: () => Promise.resolve(ok(new Blob())),
})

const serving = (names: Record<string, string>): HttpClient => ({
  request: () => Promise.resolve(ok(documentResponse(names))),
})

const offline: HttpClient = { request: () => Promise.resolve(failure({ type: "network", message: "offline" })) }

const rethrow = (error: unknown): never => {
  throw error
}

interface Outcome {
  readonly pubkey: PublicKey
  readonly verified: boolean
}

Deno.test("verify reports verified=true when the name resolves to the pubkey", async () => {
  const outcomes: Array<Outcome> = []
  const verifier = createNip05Verifier(serving({ user: PUBKEY }), {
    onVerified: (pubkey, verified) => outcomes.push({ pubkey, verified }),
    onError: rethrow,
  })
  verifier.verify(PUBKEY, nip05IdFixture("user@example.com"))
  await verifier.whenIdle()
  assertEquals(outcomes, [{ pubkey: PUBKEY, verified: true }])
})

Deno.test("verify reports verified=false when the name resolves to another pubkey", async () => {
  const outcomes: Array<Outcome> = []
  const verifier = createNip05Verifier(serving({ user: OTHER }), {
    onVerified: (pubkey, verified) => outcomes.push({ pubkey, verified }),
    onError: rethrow,
  })
  verifier.verify(PUBKEY, nip05IdFixture("user@example.com"))
  await verifier.whenIdle()
  assertEquals(outcomes, [{ pubkey: PUBKEY, verified: false }])
})

Deno.test("verify does not report a verdict when the lookup fails", async () => {
  const outcomes: Array<Outcome> = []
  const verifier = createNip05Verifier(offline, {
    onVerified: (pubkey, verified) => outcomes.push({ pubkey, verified }),
    onError: rethrow,
  })
  verifier.verify(PUBKEY, nip05IdFixture("user@example.com"))
  await verifier.whenIdle()
  assertEquals(outcomes, [])
})

Deno.test("verify hands a failed lookup's failure to onLookupFailed", async () => {
  const failures: Array<{ pubkey: PublicKey; failure: NoAnswerFailure }> = []
  const verifier = createNip05Verifier(offline, {
    onVerified: () => {},
    onLookupFailed: (pubkey, failure) => failures.push({ pubkey, failure }),
    onError: rethrow,
  })
  verifier.verify(PUBKEY, nip05IdFixture("user@example.com"))
  await verifier.whenIdle()
  assertEquals(failures.map((f) => [f.pubkey, f.failure.message]), [[PUBKEY, "offline"]])
})

Deno.test("verify can retry a pubkey after a failed lookup", async () => {
  let online = false
  const outcomes: Array<Outcome> = []
  const verifier = createNip05Verifier({
    request: (input) => online ? serving({ user: PUBKEY }).request(input) : offline.request(input),
  }, { onVerified: (pubkey, verified) => outcomes.push({ pubkey, verified }), onError: rethrow })
  verifier.verify(PUBKEY, nip05IdFixture("user@example.com"))
  await verifier.whenIdle()
  online = true
  verifier.verify(PUBKEY, nip05IdFixture("user@example.com"))
  await verifier.whenIdle()
  assertEquals(outcomes, [{ pubkey: PUBKEY, verified: true }])
})

Deno.test("verify skips duplicate pubkeys", async () => {
  let requests = 0
  const verifier = createNip05Verifier({ request: (input) => (requests++, serving({}).request(input)) }, {
    onVerified: () => {},
    onError: rethrow,
  })
  const id = nip05IdFixture("user@example.com")
  verifier.verify(PUBKEY, id)
  verifier.verify(PUBKEY, id)
  await verifier.whenIdle()
  assertEquals(requests, 1)
})

Deno.test("verify queues entries for same domain and processes them in order", async () => {
  const order: Array<PublicKey> = []
  const verifier = createNip05Verifier(serving({}), { onVerified: (pubkey) => order.push(pubkey), onError: rethrow })
  verifier.verify(PUBKEY, nip05IdFixture("user1@example.com"))
  verifier.verify(OTHER, nip05IdFixture("user2@example.com"))
  await verifier.whenIdle()
  assertEquals(order, [PUBKEY, OTHER])
})

Deno.test("verify does not fire onVerified when the host signal aborts mid-resolve", async () => {
  const controller = new AbortController()
  const outcomes: Array<Outcome> = []
  let releaseHttp = (): void => {}
  const released = new Promise<void>((resolve) => {
    releaseHttp = resolve
  })
  const slowHttp: HttpClient = {
    request: async (input) => {
      await released
      return serving({ user: PUBKEY }).request(input)
    },
  }
  const verifier = createNip05Verifier(slowHttp, {
    onVerified: (pubkey, verified) => outcomes.push({ pubkey, verified }),
    onError: rethrow,
  }, controller.signal)
  verifier.verify(PUBKEY, nip05IdFixture("user@example.com"))
  controller.abort()
  releaseHttp()
  await verifier.whenIdle()
  assertEquals(outcomes, [])
})

Deno.test("verify routes a fault thrown by onVerified to the injected onError sink", async () => {
  const fault = new Error("consumer bug")
  const faults: Array<unknown> = []
  const verifier = createNip05Verifier(serving({ user: PUBKEY }), {
    onVerified: () => {
      throw fault
    },
    onError: (error) => faults.push(error),
  })
  verifier.verify(PUBKEY, nip05IdFixture("user@example.com"))
  await verifier.whenIdle()
  assertEquals(faults, [fault])
})

Deno.test("verify proceeds with a later lookup on a domain after onVerified threw", async () => {
  const outcomes: Array<Outcome> = []
  const verifier = createNip05Verifier(serving({ alice: PUBKEY, bob: OTHER }), {
    onVerified: (pubkey, verified) => {
      if (pubkey === PUBKEY) throw new Error("consumer bug")
      outcomes.push({ pubkey, verified })
    },
    onError: () => {},
  })
  verifier.verify(PUBKEY, nip05IdFixture("alice@example.com"))
  await verifier.whenIdle()
  verifier.verify(OTHER, nip05IdFixture("bob@example.com"))
  await verifier.whenIdle()
  assertEquals(outcomes, [{ pubkey: OTHER, verified: true }])
})

Deno.test("verify drops the rest of a domain's queue without a verdict when onVerified throws, and can queue it again", async () => {
  const outcomes: Array<Outcome> = []
  const verifier = createNip05Verifier(serving({ alice: PUBKEY, bob: OTHER }), {
    onVerified: (pubkey, verified) => {
      if (pubkey === PUBKEY) throw new Error("consumer bug")
      outcomes.push({ pubkey, verified })
    },
    onError: () => {},
  })
  verifier.verify(PUBKEY, nip05IdFixture("alice@example.com"))
  verifier.verify(OTHER, nip05IdFixture("bob@example.com"))
  await verifier.whenIdle()
  const dropped = [...outcomes]
  verifier.verify(OTHER, nip05IdFixture("bob@example.com"))
  await verifier.whenIdle()
  assertEquals({ dropped, requeued: outcomes }, { dropped: [], requeued: [{ pubkey: OTHER, verified: true }] })
})

Deno.test("verify can look a pubkey up again after its lookup threw", async () => {
  let requests = 0
  const httpClient: HttpClient = {
    request: () => {
      requests++
      if (requests === 1) return Promise.reject(new Error("transport bug"))
      return Promise.resolve(ok(documentResponse({ user: PUBKEY })))
    },
  }
  const outcomes: Array<Outcome> = []
  const verifier = createNip05Verifier(httpClient, {
    onVerified: (pubkey, verified) => outcomes.push({ pubkey, verified }),
    onError: () => {},
  })
  verifier.verify(PUBKEY, nip05IdFixture("user@example.com"))
  await verifier.whenIdle()
  verifier.verify(PUBKEY, nip05IdFixture("user@example.com"))
  await verifier.whenIdle()
  assertEquals(outcomes, [{ pubkey: PUBKEY, verified: true }])
})

Deno.test("verify still reports a thrown lookup to onError", async () => {
  const fault = new Error("transport bug")
  const faults: Array<unknown> = []
  const verifier = createNip05Verifier({ request: () => Promise.reject(fault) }, {
    onVerified: () => {},
    onError: (error) => faults.push(error),
  })
  verifier.verify(PUBKEY, nip05IdFixture("user@example.com"))
  await verifier.whenIdle()
  assertEquals(faults, [fault])
})

const capturingLookupSignal = (): { httpClient: HttpClient; signal: () => AbortSignal | undefined } => {
  let captured: AbortSignal | undefined
  return {
    httpClient: {
      request: (input) => {
        captured = input.signal
        return serving({ user: PUBKEY }).request(input)
      },
    },
    signal: () => captured,
  }
}

Deno.test("verify bounds each lookup by a deadline that has not yet elapsed", async () => {
  const lookup = capturingLookupSignal()
  const verifier = createNip05Verifier(lookup.httpClient, { onVerified: () => {}, onError: rethrow })
  verifier.verify(PUBKEY, nip05IdFixture("user@example.com"))
  await verifier.whenIdle()
  assertEquals(lookup.signal()?.aborted, false)
})

Deno.test("verify aborts a lookup's request when the host signal aborts", async () => {
  const controller = new AbortController()
  const lookup = capturingLookupSignal()
  const verifier = createNip05Verifier(lookup.httpClient, { onVerified: () => {}, onError: rethrow }, controller.signal)
  verifier.verify(PUBKEY, nip05IdFixture("user@example.com"))
  await verifier.whenIdle()
  controller.abort()
  assertEquals(lookup.signal()?.aborted, true)
})

Deno.test("verify keeps a lookup queued for a domain whose queue has just drained", async () => {
  const late = publicKeyFixture("c".repeat(64))
  const routing: HttpClient = {
    request: (request) => {
      const url = new URL(request.url)
      const owners: Record<string, PublicKey> = { "a.com": PUBKEY, "b.com": OTHER }
      const name = url.searchParams.get("name") ?? ""
      return Promise.resolve(ok(documentResponse({ [name]: name === "late" ? late : owners[url.hostname] ?? "" })))
    },
  }
  const outcomes: Array<Outcome> = []
  const verifier = createNip05Verifier(routing, {
    onVerified: (pubkey, verified) => {
      outcomes.push({ pubkey, verified })
      if (pubkey === OTHER) verifier.verify(late, nip05IdFixture("late@a.com"))
    },
    onError: rethrow,
  })
  verifier.verify(PUBKEY, nip05IdFixture("user@a.com"))
  verifier.verify(OTHER, nip05IdFixture("user@b.com"))
  await verifier.whenIdle()
  assertEquals(outcomes.find((outcome) => outcome.pubkey === late), { pubkey: late, verified: true })
})
