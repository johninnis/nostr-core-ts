import { assertEquals } from "@std/assert"
import type { HttpClient, HttpResponse } from "../../src/application/port/http.ts"
import { parseRelayInformation } from "../../src/domain/service/nip11-info.ts"
import { wsToHttp } from "../../src/domain/value-object/relay-url.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"
import { DEFAULT_NIP11_TIMEOUT_MS, fetchRelayInformation } from "../../src/application/service/nip11-fetcher.ts"
import { createHttpClient } from "../../src/infrastructure/http/fetch-http-client.ts"
import type { PrivateAddressPolicy } from "../../src/infrastructure/http/fetch-http-client.ts"
import { relayUrlFixture } from "../../testing.ts"

const RELAY = relayUrlFixture("wss://relay.example")

Deno.test("wsToHttp - rewrites a wss:// relay to https://, as an HttpUrl with its root path", () => {
  assertEquals<string>(wsToHttp(RELAY), "https://relay.example/")
})

Deno.test("wsToHttp - rewrites a ws:// relay to http://, keeping its port and path", () => {
  assertEquals<string>(wsToHttp(relayUrlFixture("ws://localhost:8080/nostr")), "http://localhost:8080/nostr")
})

Deno.test("fetchRelayInformation - requests the relay's own URI under the http(s) scheme (NIP-11)", async () => {
  let requested: string | undefined
  const httpClient: HttpClient = {
    request: (input) => {
      requested = input.url
      return Promise.resolve(ok(stubResponse({})))
    },
  }
  await fetchRelayInformation(httpClient, relayUrlFixture("wss://relay.example/nostr"))
  assertEquals(requested, "https://relay.example/nostr")
})

const stubHttpClient = (response: HttpResponse | null): HttpClient => ({
  request: () => {
    if (response === null) return Promise.resolve(failure({ type: "network", message: "no response" }))
    if (response.status >= 400) {
      return Promise.resolve(failure({ type: "server", status: response.status, message: "" }))
    }
    return Promise.resolve(ok(response))
  },
})

const stubResponse = (overrides: Partial<HttpResponse>): HttpResponse => ({
  status: 200,
  headers: new Headers(),
  text: () => Promise.resolve(ok("")),
  json: () => Promise.resolve(ok({})),
  blob: () => Promise.resolve(ok(new Blob())),
  ...overrides,
})

Deno.test("fetchRelayInformation - returns parsed info on 200", async () => {
  const httpClient = stubHttpClient(stubResponse({
    json: () => Promise.resolve(ok({ software: "hubstr-relay", version: "1.0" })),
  }))
  const result = await fetchRelayInformation(httpClient, RELAY)
  assertEquals(result.success, true)
  if (!result.success) throw result.error
  assertEquals(result.value.software, "hubstr-relay")
  assertEquals(result.value.version, "1.0")
})

Deno.test("fetchRelayInformation - returns not-found when the relay answers 404", async () => {
  const httpClient = stubHttpClient(stubResponse({ status: 404 }))
  assertEquals(await fetchRelayInformation(httpClient, RELAY), failure({ type: "not-found" }))
})

Deno.test("fetchRelayInformation - returns no-answer on a network error", async () => {
  const httpClient = stubHttpClient(null)
  assertEquals(
    await fetchRelayInformation(httpClient, RELAY),
    failure({ type: "no-answer", message: "no response" }),
  )
})

Deno.test("fetchRelayInformation - returns no-answer when JSON parse fails", async () => {
  const httpClient = stubHttpClient(stubResponse({
    json: () => Promise.resolve(failure({ type: "malformed-body", message: "invalid json" })),
  }))
  assertEquals(
    await fetchRelayInformation(httpClient, RELAY),
    failure({ type: "no-answer", message: "invalid json" }),
  )
})

Deno.test("fetchRelayInformation - asks for the NIP-11 media type", async () => {
  let accept: string | undefined
  const httpClient: HttpClient = {
    request: (input) => {
      accept = input.headers?.["Accept"]
      return Promise.resolve(ok(stubResponse({})))
    },
  }
  await fetchRelayInformation(httpClient, RELAY)
  assertEquals(accept, "application/nostr+json")
})

Deno.test("fetchRelayInformation - returns no-answer when the body is not a relay information document", async () => {
  const httpClient = stubHttpClient(stubResponse({
    json: () => Promise.resolve(ok("not an object")),
  }))
  const result = await fetchRelayInformation(httpClient, RELAY)
  assertEquals(result.success, false)
  if (result.success) throw new Error("expected failure")
  assertEquals(result.error, { type: "no-answer", message: "response body is not a JSON object" })
})

const PUBKEY_HEX = "a".repeat(64)
const SELF_HEX = "b".repeat(64)

Deno.test("parseRelayInformation - reads the spec's snake_case fields into camelCase ones", () => {
  const info = parseRelayInformation({
    name: "Example",
    description: "A relay",
    pubkey: PUBKEY_HEX,
    contact: "admin@example.com",
    supported_nips: [1, 11, 42],
    software: "hubstr-relay",
    version: "1.0",
    banner: "https://example.com/banner.png",
    icon: "https://example.com/icon.png",
    self: SELF_HEX,
    terms_of_service: "https://example.com/terms.txt",
  })
  assertEquals(
    {
      name: info?.name,
      description: info?.description,
      pubkey: info?.pubkey,
      contact: info?.contact,
      supportedNips: info?.supportedNips,
      software: info?.software,
      version: info?.version,
      banner: info?.banner,
      icon: info?.icon,
      self: info?.self,
      termsOfService: info?.termsOfService,
    },
    {
      name: "Example",
      description: "A relay",
      pubkey: PUBKEY_HEX,
      contact: "admin@example.com",
      supportedNips: [1, 11, 42],
      software: "hubstr-relay",
      version: "1.0",
      banner: "https://example.com/banner.png",
      icon: "https://example.com/icon.png",
      self: SELF_HEX,
      termsOfService: "https://example.com/terms.txt",
    },
  )
})

Deno.test("parseRelayInformation - reads every field as null from an empty document", () => {
  const info = parseRelayInformation({})
  assertEquals(
    [info?.name, info?.pubkey, info?.self, info?.supportedNips, info?.software, info?.termsOfService, info?.limitation],
    [null, null, null, null, null, null, null],
  )
})

Deno.test("parseRelayInformation - reads a field of the wrong type as null and keeps the rest", () => {
  const info = parseRelayInformation({ name: 42, software: "strfry" })
  assertEquals([info?.name, info?.software], [null, "strfry"])
})

Deno.test("parseRelayInformation - reads supported_nips as null when it holds a non-number", () => {
  assertEquals(parseRelayInformation({ supported_nips: [1, "two"] })?.supportedNips, null)
})

Deno.test('parseRelayInformation - reads a self that is not a public key as null (NIP-11: it "MUST be a 32-byte hex public key")', () => {
  assertEquals(parseRelayInformation({ self: "not-a-key" })?.self, null)
})

Deno.test("parseRelayInformation - reads a pubkey that is not a public key as null", () => {
  assertEquals(parseRelayInformation({ pubkey: "not-a-key" })?.pubkey, null)
})

Deno.test("parseRelayInformation - reads supported_nips as null when it holds a number that is not an integer", () => {
  assertEquals(parseRelayInformation({ supported_nips: [1, 11.5] })?.supportedNips, null)
})

Deno.test("parseRelayInformation - reads a limitation that is not a JSON object as null", () => {
  assertEquals(
    [[], "x", 1, null].map((limitation) => parseRelayInformation({ limitation })?.limitation),
    [null, null, null, null],
  )
})

Deno.test("parseRelayInformation - keeps the limitation object as the relay sent it", () => {
  assertEquals(parseRelayInformation({ limitation: { auth_required: true } })?.limitation, { auth_required: true })
})

Deno.test("parseRelayInformation - keeps the whole document as the relay sent it", () => {
  const document = { name: "Example", payments_url: "https://example.com/pay" }
  assertEquals(parseRelayInformation(document)?.document, document)
})

Deno.test("parseRelayInformation - returns null for input that is not a JSON object", () => {
  assertEquals([parseRelayInformation(null), parseRelayInformation("x"), parseRelayInformation([])], [null, null, null])
})

const capturedSignal = async (signal?: AbortSignal): Promise<AbortSignal | undefined> => {
  let captured: AbortSignal | undefined
  const httpClient: HttpClient = {
    request: (input) => {
      captured = input.signal
      return Promise.resolve(ok(stubResponse({})))
    },
  }
  await fetchRelayInformation(httpClient, RELAY, signal)
  return captured
}

Deno.test("fetchRelayInformation - forwards the caller's signal to the HttpClient request", async () => {
  const controller = new AbortController()
  assertEquals(await capturedSignal(controller.signal), controller.signal)
})

Deno.test("fetchRelayInformation - without a signal, the request is bounded by a deadline that has not yet elapsed", async () => {
  const signal = await capturedSignal()
  assertEquals([signal instanceof AbortSignal, signal?.aborted], [true, false])
})

const localRelayClient = (privateAddresses: PrivateAddressPolicy): { client: HttpClient; calls: () => number } => {
  let calls = 0
  return {
    client: createHttpClient(privateAddresses, () => {
      calls++
      return Promise.resolve(new Response('{"software":"hubstr-relay"}'))
    }),
    calls: () => calls,
  }
}

Deno.test("fetchRelayInformation - a client that refuses private addresses does not reach a local relay", async () => {
  const local = localRelayClient("refuse-private")
  const result = await fetchRelayInformation(local.client, relayUrlFixture("ws://localhost:7777"))
  assertEquals([result.success, local.calls()], [false, 0])
})

Deno.test("fetchRelayInformation - a client that allows private addresses reaches a local relay", async () => {
  const local = localRelayClient("allow-private")
  const result = await fetchRelayInformation(local.client, relayUrlFixture("ws://localhost:7777"))
  assertEquals(result.success ? result.value.software : result.error, "hubstr-relay")
})

Deno.test("fetchRelayInformation - a lookup given no signal waits at most ten seconds", () => {
  assertEquals(DEFAULT_NIP11_TIMEOUT_MS, 10_000)
})
