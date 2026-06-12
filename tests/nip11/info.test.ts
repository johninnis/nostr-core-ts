import { assertEquals, assertInstanceOf } from "@std/assert"
import type { HttpClient, HttpResponse } from "../../src/application/port/http.ts"
import { NetworkError, ServerError } from "../../src/application/port/http.ts"
import { Nip11FetchError } from "../../src/application/exception/nip11-fetch-error.ts"
import { isRelayInformation } from "../../src/domain/value-object/nip11-info.ts"
import { wsToHttp } from "../../src/domain/value-object/relay-url.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"
import { DEFAULT_NIP11_TIMEOUT_MS, fetchRelayInformation } from "../../src/infrastructure/adapter/nip11-adapter.ts"

Deno.test("wsToHttp - rewrites wss:// to https://", () => {
  assertEquals(wsToHttp("wss://relay.example"), "https://relay.example")
})

Deno.test("wsToHttp - rewrites ws:// to http://", () => {
  assertEquals(wsToHttp("ws://localhost:8080"), "http://localhost:8080")
})

Deno.test("wsToHttp - leaves non-ws URLs untouched", () => {
  assertEquals(wsToHttp("https://relay.example"), "https://relay.example")
})

const makeMockHttpClient = (response: HttpResponse | null): HttpClient => ({
  request: async () => {
    if (response === null) return failure(new NetworkError("no response"))
    if (response.status >= 400) return failure(new ServerError(response.status, ""))
    return ok(response)
  },
})

const makeMockResponse = (overrides: Partial<HttpResponse>): HttpResponse => ({
  status: 200,
  headers: new Headers(),
  text: () => Promise.resolve(ok("")),
  json: () => Promise.resolve(ok({})),
  blob: () => Promise.resolve(ok(new Blob())),
  ...overrides,
})

Deno.test("fetchRelayInformation - returns parsed info on 200", async () => {
  const httpClient = makeMockHttpClient(makeMockResponse({
    json: () => Promise.resolve(ok({ software: "hubstr-relay", version: "1.0" })),
  }))
  const result = await fetchRelayInformation(httpClient, "https://relay.example")
  assertEquals(result.success, true)
  if (!result.success) throw result.error
  assertEquals(result.value.software, "hubstr-relay")
  assertEquals(result.value.version, "1.0")
})

Deno.test("fetchRelayInformation - returns transport failure on non-200", async () => {
  const httpClient = makeMockHttpClient(makeMockResponse({ status: 404 }))
  const result = await fetchRelayInformation(httpClient, "https://relay.example")
  assertEquals(result.success, false)
  if (result.success) throw new Error("expected failure")
  assertInstanceOf(result.error, Nip11FetchError)
  assertEquals(result.error.tag, "transport")
})

Deno.test("fetchRelayInformation - returns transport failure on network error", async () => {
  const httpClient = makeMockHttpClient(null)
  const result = await fetchRelayInformation(httpClient, "https://relay.example")
  assertEquals(result.success, false)
  if (result.success) throw new Error("expected failure")
  assertEquals(result.error.tag, "transport")
  assertInstanceOf(result.error.cause, NetworkError)
})

Deno.test("fetchRelayInformation - returns body-read failure when JSON parse fails", async () => {
  const httpClient = makeMockHttpClient(makeMockResponse({
    json: () => Promise.resolve(failure(new NetworkError("invalid json"))),
  }))
  const result = await fetchRelayInformation(httpClient, "https://relay.example")
  assertEquals(result.success, false)
  if (result.success) throw new Error("expected failure")
  assertEquals(result.error.tag, "body-read")
  assertInstanceOf(result.error.cause, NetworkError)
})

Deno.test("fetchRelayInformation - returns schema-mismatch failure carrying the offending body", async () => {
  const httpClient = makeMockHttpClient(makeMockResponse({
    json: () => Promise.resolve(ok("not an object")),
  }))
  const result = await fetchRelayInformation(httpClient, "https://relay.example")
  assertEquals(result.success, false)
  if (result.success) throw new Error("expected failure")
  assertEquals(result.error.tag, "schema-mismatch")
  assertEquals(result.error.cause, { body: "not an object" })
})

Deno.test("isRelayInformation - true for an empty object (all fields optional)", () => {
  assertEquals(isRelayInformation({}), true)
})

Deno.test("isRelayInformation - true for a full document", () => {
  const doc = {
    name: "Relay",
    description: "test",
    software: "hubstr-relay",
    version: "1.0",
    supported_nips: [1, 11, 42],
  }
  assertEquals(isRelayInformation(doc), true)
})

Deno.test("isRelayInformation - false for non-object inputs", () => {
  assertEquals(isRelayInformation(null), false)
  assertEquals(isRelayInformation("string"), false)
  assertEquals(isRelayInformation([]), false)
})

Deno.test("isRelayInformation - false when a string field has the wrong type", () => {
  assertEquals(isRelayInformation({ name: 42 }), false)
})

Deno.test("isRelayInformation - false when supported_nips contains a non-number", () => {
  assertEquals(isRelayInformation({ supported_nips: [1, "two"] }), false)
})

Deno.test("fetchRelayInformation - forwards options.timeoutMs and options.signal to the HttpClient request", async () => {
  let capturedTimeout: number | undefined
  let capturedSignal: AbortSignal | undefined
  const httpClient: HttpClient = {
    request: (input) => {
      capturedTimeout = input.timeoutMs
      capturedSignal = input.signal
      return Promise.resolve(ok(makeMockResponse({})))
    },
  }
  const controller = new AbortController()
  await fetchRelayInformation(httpClient, "https://relay.example", { timeoutMs: 1234, signal: controller.signal })
  assertEquals(capturedTimeout, 1234)
  assertEquals(capturedSignal, controller.signal)
})

Deno.test("fetchRelayInformation - uses DEFAULT_NIP11_TIMEOUT_MS when options.timeoutMs is omitted", async () => {
  let captured: number | undefined
  const httpClient: HttpClient = {
    request: (input) => {
      captured = input.timeoutMs
      return Promise.resolve(ok(makeMockResponse({})))
    },
  }
  await fetchRelayInformation(httpClient, "https://relay.example")
  assertEquals(captured, DEFAULT_NIP11_TIMEOUT_MS)
})
