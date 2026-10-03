import { assertEquals } from "@std/assert"
import { DEFAULT_NIP05_TIMEOUT_MS, resolveNip05 } from "../../src/application/service/nip05-resolver.ts"
import type { HttpClient, HttpResponse } from "../../src/application/port/http.ts"
import type {
  HttpRequestFailure,
  NetworkFailure,
  ServerFailure,
} from "../../src/application/failure/http-request-failure.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"
import { nip05IdFixture, publicKeyFixture } from "../../testing.ts"
import type { JsonValue } from "../../src/domain/value-object/json-serialisable.ts"
import { createHttpClient } from "../../src/infrastructure/http/fetch-http-client.ts"

const PUBKEY = publicKeyFixture("a".repeat(64))
const ALICE = nip05IdFixture("alice@example.com")

const response = (body: JsonValue): HttpResponse => ({
  status: 200,
  headers: new Headers(),
  json: () => Promise.resolve(ok(body)),
  blob: () => Promise.resolve(ok(new Blob())),
  text: () => Promise.resolve(ok("")),
})

const okClient = (body: JsonValue): HttpClient => ({
  request: () => Promise.resolve(ok(response(body))),
})

const failingClient = (error: HttpRequestFailure): HttpClient => ({
  request: () => Promise.resolve(failure(error)),
})

Deno.test("resolveNip05 - resolves the pubkey for a matching name", async () => {
  assertEquals(await resolveNip05(okClient({ names: { alice: PUBKEY } }), ALICE), ok(PUBKEY))
})

Deno.test("resolveNip05 - a server key that differs in case does not match, since NIP-05 names use only a-z0-9-_.", async () => {
  assertEquals(await resolveNip05(okClient({ names: { Alice: PUBKEY } }), ALICE), ok(null))
})

Deno.test("resolveNip05 - picks the exact name among keys that differ only in case", async () => {
  const other = publicKeyFixture("b".repeat(64))
  assertEquals(await resolveNip05(okClient({ names: { Alice: other, alice: PUBKEY } }), ALICE), ok(PUBKEY))
})

Deno.test("resolveNip05 - a name inherited from the object prototype is not a mapped name", async () => {
  const proto = nip05IdFixture("constructor@example.com")
  assertEquals(await resolveNip05(okClient({ names: {} }), proto), ok(null))
})

Deno.test("resolveNip05 - an upper-case hex pubkey is not a valid NIP-05 key", async () => {
  assertEquals(await resolveNip05(okClient({ names: { alice: PUBKEY.toUpperCase() } }), ALICE), ok(null))
})

Deno.test("resolveNip05 - resolves to null when the name is absent from the response", async () => {
  assertEquals(await resolveNip05(okClient({ names: { bob: PUBKEY } }), ALICE), ok(null))
})

Deno.test("resolveNip05 - resolves to null when the mapped value is not a hex pubkey", async () => {
  assertEquals(await resolveNip05(okClient({ names: { alice: "not-hex" } }), ALICE), ok(null))
})

Deno.test("resolveNip05 - resolves to null when the document has no names object", async () => {
  assertEquals(await resolveNip05(okClient({ relays: {} }), ALICE), ok(null))
})

Deno.test("resolveNip05 - fails with no-answer when the document is not a JSON object (shared ADR-0040)", async () => {
  assertEquals(
    await resolveNip05(okClient([{ names: { alice: PUBKEY } }]), ALICE),
    failure({ type: "no-answer", message: "response body is not a JSON object" }),
  )
})

Deno.test("resolveNip05 - resolves to null when the server has no document (404)", async () => {
  assertEquals(
    await resolveNip05(failingClient({ type: "server", status: 404, message: "not found" }), ALICE),
    ok(null),
  )
})

Deno.test("resolveNip05 - fails with no-answer when the request fails", async () => {
  const error: NetworkFailure = { type: "network", message: "offline" }
  assertEquals(await resolveNip05(failingClient(error), ALICE), failure({ type: "no-answer", message: "offline" }))
})

Deno.test("resolveNip05 - fails with no-answer for a status other than 404", async () => {
  const error: ServerFailure = { type: "server", status: 503, message: "unavailable" }
  assertEquals(
    await resolveNip05(failingClient(error), ALICE),
    failure({ type: "no-answer", message: "HTTP 503: unavailable" }),
  )
})

Deno.test("resolveNip05 - fails with no-answer when the well-known endpoint redirects, which NIP-05 fetchers ignore", async () => {
  const error: ServerFailure = { type: "server", status: 301, message: "redirect to https://other.example/ refused" }
  assertEquals(
    await resolveNip05(failingClient(error), ALICE),
    failure({ type: "no-answer", message: "HTTP 301: redirect to https://other.example/ refused" }),
  )
})

Deno.test("resolveNip05 - fails with no-answer when the body is unreadable", async () => {
  const error: NetworkFailure = { type: "network", message: "bad json" }
  const client: HttpClient = {
    request: () => Promise.resolve(ok({ ...response({}), json: () => Promise.resolve(failure(error)) })),
  }
  assertEquals(await resolveNip05(client, ALICE), failure({ type: "no-answer", message: "bad json" }))
})

const capturedSignal = async (signal?: AbortSignal): Promise<AbortSignal | undefined> => {
  let captured: AbortSignal | undefined
  const client: HttpClient = {
    request: (input) => {
      captured = input.signal
      return Promise.resolve(ok(response({ names: { alice: PUBKEY } })))
    },
  }
  await resolveNip05(client, ALICE, signal)
  return captured
}

Deno.test("resolveNip05 - forwards the caller's signal to the HttpClient request", async () => {
  const controller = new AbortController()
  assertEquals(await capturedSignal(controller.signal), controller.signal)
})

Deno.test("resolveNip05 - without a signal, the request is bounded by a deadline that has not yet elapsed", async () => {
  const signal = await capturedSignal()
  assertEquals([signal instanceof AbortSignal, signal?.aborted], [true, false])
})

Deno.test("resolveNip05 - through the shipped client, a redirecting well-known endpoint is never followed", async () => {
  const redirects: Array<RequestRedirect | undefined> = []
  const client = createHttpClient("refuse-private", (_input, init) => {
    redirects.push(init?.redirect)
    return Promise.resolve(new Response(null, { status: 307, headers: { location: "https://other.example/" } }))
  })
  assertEquals(
    [await resolveNip05(client, ALICE), redirects],
    [failure({ type: "no-answer", message: "HTTP 307: redirect to https://other.example/ refused" }), ["manual"]],
  )
})

Deno.test("resolveNip05 - through the shipped client, a loopback domain is refused unfetched", async () => {
  let calls = 0
  const client = createHttpClient("refuse-private", () => {
    calls++
    return Promise.resolve(new Response(JSON.stringify({ names: { alice: PUBKEY } })))
  })
  assertEquals(
    [await resolveNip05(client, nip05IdFixture("alice@me.localhost")), calls],
    [failure({ type: "no-answer", message: "refused a request to the private address me.localhost" }), 0],
  )
})

Deno.test("resolveNip05 - a lookup given no signal waits at most ten seconds", () => {
  assertEquals(DEFAULT_NIP05_TIMEOUT_MS, 10_000)
})
