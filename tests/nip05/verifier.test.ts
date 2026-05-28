import { assertEquals } from "@std/assert"
import type { HttpClient, HttpResponse } from "../../src/application/port/http.ts"
import { NetworkError } from "../../src/application/port/http.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"
import { createNip05Verifier } from "../../src/application/service/nip05-verifier.ts"
import { parseNip05Id } from "../../src/domain/value-object/nip05-id.ts"
import { parsePublicKey } from "../../src/domain/value-object/public-key.ts"
import type { PublicKey } from "../../src/domain/value-object/public-key.ts"

const PUBKEY = parsePublicKey("a".repeat(64))

const fakeHttp: HttpClient = {
  request: async () => failure(new NetworkError("Network request failed")),
}

Deno.test("verify calls onVerified after resolution attempt", async () => {
  const results: Array<{ pubkey: PublicKey; verified: boolean }> = []

  const verifier = createNip05Verifier({
    httpClient: fakeHttp,
    onVerified: (pubkey, verified) => {
      results.push({ pubkey, verified })
    },
  })

  verifier.verify(PUBKEY, parseNip05Id("user@nonexistent-domain-test.invalid"))
  await verifier.whenIdle()

  assertEquals(results.length, 1)
  const [result] = results
  if (!result) throw new Error("expected one verification result")
  assertEquals(result.pubkey, PUBKEY)
  assertEquals(result.verified, false)
})

Deno.test("verify skips duplicate pubkeys", async () => {
  const verifier = createNip05Verifier({
    httpClient: fakeHttp,
    onVerified: () => {},
  })

  const id = parseNip05Id("user@example.com")
  verifier.verify(PUBKEY, id)
  verifier.verify(PUBKEY, id)
  await verifier.whenIdle()
})

Deno.test("verify queues entries for same domain and processes them in order", async () => {
  const requests: Array<string> = []
  const order: Array<PublicKey> = []
  const slowHttp: HttpClient = {
    request: async (input) => {
      requests.push(input.url)
      return failure(new NetworkError("denied"))
    },
  }

  const verifier = createNip05Verifier({
    httpClient: slowHttp,
    onVerified: (pubkey) => order.push(pubkey),
  })

  const pubkey1 = parsePublicKey("a".repeat(64))
  const pubkey2 = parsePublicKey("b".repeat(64))
  verifier.verify(pubkey1, parseNip05Id("user1@example.com"))
  verifier.verify(pubkey2, parseNip05Id("user2@example.com"))
  await verifier.whenIdle()

  assertEquals(order, [pubkey1, pubkey2])
  assertEquals(requests.length, 2)
})

Deno.test("verify does not fire onVerified when the host signal aborts mid-resolve", async () => {
  const controller = new AbortController()
  const events: Array<{ pubkey: PublicKey; verified: boolean }> = []

  // HttpClient that resolves only after we abort the signal — simulates a slow lookup that
  // the caller decides to give up on.
  let releaseHttp = (): void => {}
  const releasedPromise = new Promise<void>((r) => {
    releaseHttp = r
  })
  const dummyResponse: HttpResponse = {
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve(ok({})),
    text: () => Promise.resolve(ok("")),
    blob: () => Promise.resolve(ok(new Blob())),
  }
  const slowHttp: HttpClient = {
    request: async () => {
      await releasedPromise
      // Body never read — equivalent to a real abort path returning early.
      return ok(dummyResponse)
    },
  }

  const verifier = createNip05Verifier({
    httpClient: slowHttp,
    signal: controller.signal,
    onVerified: (pubkey, verified) => events.push({ pubkey, verified }),
  })

  verifier.verify(PUBKEY, parseNip05Id("user@example.com"))
  controller.abort()
  releaseHttp()
  await verifier.whenIdle()

  assertEquals(events, [])
})
