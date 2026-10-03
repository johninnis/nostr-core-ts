import { assertEquals } from "@std/assert"
import type { HttpResponse } from "../../src/application/port/http.ts"
import type { HttpRequestFailure, NetworkFailure } from "../../src/application/failure/http-request-failure.ts"
import type { MalformedBodyFailure } from "../../src/application/failure/malformed-body-failure.ts"
import { readJsonDocument } from "../../src/application/service/json-document.ts"
import type { Result } from "../../src/domain/value-object/result.ts"
import type { JsonValue } from "../../src/domain/value-object/json-serialisable.ts"
import { failure, ok } from "../../src/domain/value-object/result.ts"

const answered = (
  json: Result<JsonValue, NetworkFailure | MalformedBodyFailure>,
): Result<HttpResponse, HttpRequestFailure> =>
  ok({
    status: 200,
    headers: new Headers(),
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(ok("")),
    blob: () => Promise.resolve(ok(new Blob())),
  })

Deno.test("readJsonDocument - returns the decoded document the server answered with", async () => {
  assertEquals(await readJsonDocument(answered(ok({ names: {} }))), ok({ names: {} }))
})

Deno.test("readJsonDocument - a 404 is not-found: the server answered that the document is not there", async () => {
  const result = await readJsonDocument(failure({ type: "server", status: 404, message: "gone" }))
  assertEquals(result, failure({ type: "not-found" }))
})

Deno.test("readJsonDocument - any other error status is no-answer carrying the status", async () => {
  const result = await readJsonDocument(failure({ type: "server", status: 503, message: "busy" }))
  assertEquals(result, failure({ type: "no-answer", message: "HTTP 503: busy" }))
})

Deno.test("readJsonDocument - a refused redirect is no-answer, not not-found", async () => {
  const result = await readJsonDocument(
    failure({ type: "server", status: 302, message: "redirect to https://elsewhere.example/ refused" }),
  )
  assertEquals(
    result,
    failure({ type: "no-answer", message: "HTTP 302: redirect to https://elsewhere.example/ refused" }),
  )
})

Deno.test("readJsonDocument - a transport failure is no-answer carrying its message", async () => {
  const result = await readJsonDocument(failure({ type: "network", message: "offline" }))
  assertEquals(result, failure({ type: "no-answer", message: "offline" }))
})

Deno.test("readJsonDocument - a non-JSON body is no-answer", async () => {
  const result = await readJsonDocument(
    answered(failure({ type: "malformed-body", message: "response body is not JSON" })),
  )
  assertEquals(result, failure({ type: "no-answer", message: "response body is not JSON" }))
})

for (const body of [["names"], "names", 42, null]) {
  Deno.test(`readJsonDocument - a JSON body that is not an object (${JSON.stringify(body)}) is no-answer`, async () => {
    const result = await readJsonDocument(answered(ok(body)))
    assertEquals(result, failure({ type: "no-answer", message: "response body is not a JSON object" }))
  })
}
