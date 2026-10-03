import type { HttpRequestFailure } from "../failure/http-request-failure.ts"
import type { JsonFetchFailure, NoAnswerFailure } from "../failure/json-fetch-failure.ts"
import type { HttpResponse } from "../port/http.ts"
import type { Result } from "../../domain/value-object/result.ts"
import type { JsonValue } from "../../domain/value-object/json-serialisable.ts"
import { failure, ok } from "../../domain/value-object/result.ts"
import { isRecord } from "../../domain/service/guards.ts"

const HTTP_NOT_FOUND = 404

const noAnswer = (message: string): NoAnswerFailure => ({ type: "no-answer", message })

const requestFailure = (error: HttpRequestFailure): JsonFetchFailure => {
  if (error.type === "network") return noAnswer(error.message)
  return error.status === HTTP_NOT_FOUND ? { type: "not-found" } : noAnswer(`HTTP ${error.status}: ${error.message}`)
}

// Deliberate: a 404 is the server's answer, every other way of getting no document is no answer — see ADR-0015
/**
 * Read the JSON document an `HttpClient.request` answered with. `ok(document)` holds the JSON object the server sent;
 * the caller judges its fields. `not-found` is a 404; `no-answer` is every other failure, a refused redirect and a body
 * that is not a JSON object included (shared ADR-0040).
 */
export const readJsonDocument = async (
  response: Result<HttpResponse, HttpRequestFailure>,
): Promise<Result<Readonly<Record<string, JsonValue>>, JsonFetchFailure>> => {
  if (!response.success) return failure(requestFailure(response.error))
  const body = await response.value.json()
  if (!body.success) return failure(noAnswer(body.error.message))
  return isRecord(body.value) ? ok(body.value) : failure(noAnswer("response body is not a JSON object"))
}
