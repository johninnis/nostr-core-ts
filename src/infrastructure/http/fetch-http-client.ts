import { concatBytes } from "@noble/hashes/utils"
import { parseJson } from "../../domain/service/json.ts"
import { failure, ok } from "../../domain/value-object/result.ts"
import type { Result } from "../../domain/value-object/result.ts"
import type { JsonValue } from "../../domain/value-object/json-serialisable.ts"
import { decodeUtf8, textDecoder } from "../../domain/service/text-codec.ts"
import type { HttpClient, HttpRequest, HttpResponse } from "../../application/port/http.ts"
import type {
  HttpRequestFailure,
  NetworkFailure,
  ServerFailure,
} from "../../application/failure/http-request-failure.ts"
import type { MalformedBodyFailure } from "../../application/failure/malformed-body-failure.ts"
import { isPrivateHost } from "./private-address.ts"

/** Cap on the body slurped to populate `ServerFailure.message` so a 4xx with a 50MB body can't OOM the caller. */
const ERROR_BODY_BYTE_LIMIT = 8 * 1024

// Deliberate: the default ceiling fits JSON documents; a request that expects more says so — see ADR-0025
/**
 * Default ceiling, in bytes, on a successful response body read through `createHttpClient` when the request sets no
 * `maxBodyBytes`: 16 MiB.
 */
export const DEFAULT_MAX_BODY_BYTES = 16 * 1024 * 1024

const SAME_ORIGIN_BASE = "https://same-origin.invalid"

const abortReasonMessage = (error: unknown): string => {
  if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return error.message || error.name
  }
  return error instanceof Error ? error.message : String(error)
}

const networkFailure = (message: string): NetworkFailure => ({ type: "network", message })

const transportFailure = (error: unknown): NetworkFailure => networkFailure(abortReasonMessage(error))

const isTransportRefusal = (error: unknown, signal: AbortSignal | undefined): boolean =>
  error instanceof TypeError || error instanceof DOMException || (signal?.aborted === true && error === signal.reason)

// Deliberate: only fetch's own refusal becomes a returned failure; any other throw is a fault — see ADR-0034
const fetchResponse = async (
  fetchResponseFor: (signal: AbortSignal | undefined) => Promise<Response>,
  signal: AbortSignal | undefined,
): Promise<Result<Response, NetworkFailure>> => {
  try {
    return ok(await fetchResponseFor(signal))
  } catch (error: unknown) {
    if (isTransportRefusal(error, signal)) return failure(transportFailure(error))
    throw error
  }
}

// Deliberate: a stream step rejects only with its stream's error, the response's transport refusal — see ADR-0034
const streamStep = async <T>(step: Promise<T>): Promise<Result<T, NetworkFailure>> => {
  try {
    return ok(await step)
  } catch (error: unknown) {
    return failure(transportFailure(error))
  }
}

const discardBody = (response: Response): Promise<Result<void, NetworkFailure>> =>
  streamStep(response.body?.cancel() ?? Promise.resolve())

interface BodyPrefix {
  readonly bytes: Uint8Array<ArrayBuffer>
  readonly overflowed: boolean
}

const readPrefix = async (
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Result<BodyPrefix, NetworkFailure>> => {
  if (body === null) return ok({ bytes: new Uint8Array(), overflowed: false })
  const reader = body.getReader()
  const chunks: Array<Uint8Array> = []
  let collected = 0
  for (;;) {
    const read = await streamStep(reader.read())
    if (!read.success) return read
    if (read.value.done) return ok({ bytes: concatBytes(...chunks), overflowed: false })
    const chunk = read.value.value
    if (collected + chunk.byteLength > limit) {
      chunks.push(chunk.subarray(0, limit - collected))
      const cancelled = await streamStep(reader.cancel())
      return cancelled.success ? ok({ bytes: concatBytes(...chunks), overflowed: true }) : cancelled
    }
    chunks.push(chunk)
    collected += chunk.byteLength
  }
}

const declaresMoreThan = (response: Response, limit: number): boolean =>
  Number(response.headers.get("content-length") ?? 0) > limit

const readBoundedBody = async (
  response: Response,
  maxBodyBytes: number,
): Promise<Result<Uint8Array<ArrayBuffer>, NetworkFailure>> => {
  const tooLarge = networkFailure(`response body exceeds ${maxBodyBytes} bytes`)
  if (declaresMoreThan(response, maxBodyBytes)) {
    const discarded = await discardBody(response)
    return discarded.success ? failure(tooLarge) : discarded
  }
  const prefix = await readPrefix(response.body, maxBodyBytes)
  if (!prefix.success) return prefix
  return prefix.value.overflowed ? failure(tooLarge) : ok(prefix.value.bytes)
}

const malformedBody = (message: string): MalformedBodyFailure => ({ type: "malformed-body", message })

const decodeJson = (bytes: Uint8Array): Result<JsonValue, MalformedBodyFailure> => {
  const text = decodeUtf8(bytes)
  if (text === null) return failure(malformedBody("response body is not UTF-8"))
  const parsed = parseJson(text)
  return parsed.success ? parsed : failure(malformedBody("response body is not JSON"))
}

const toHttpResponse = (response: Response, maxBodyBytes: number): HttpResponse => {
  let consumed = false
  const readBytes = (): Promise<Result<Uint8Array<ArrayBuffer>, NetworkFailure>> => {
    if (consumed) return Promise.resolve(failure(networkFailure("body stream already read")))
    consumed = true
    return readBoundedBody(response, maxBodyBytes)
  }
  const contentType = response.headers.get("content-type") ?? ""
  return {
    status: response.status,
    headers: response.headers,
    json: async () => {
      const bytes = await readBytes()
      return bytes.success ? decodeJson(bytes.value) : bytes
    },
    blob: async () => {
      const bytes = await readBytes()
      return bytes.success ? ok(new Blob([bytes.value], { type: contentType })) : bytes
    },
    text: async () => {
      const bytes = await readBytes()
      return bytes.success ? ok(textDecoder.decode(bytes.value)) : bytes
    },
  }
}

const serverMessage = async (response: Response): Promise<string> => {
  const reason = response.headers.get("x-reason")
  if (reason !== null) return reason
  const body = await readPrefix(response.body, ERROR_BODY_BYTE_LIMIT)
  return body.success ? textDecoder.decode(body.value.bytes) : `error body unreadable: ${body.error.message}`
}

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308])

const isRedirect = (response: Response): boolean =>
  response.type === "opaqueredirect" || REDIRECT_STATUSES.has(response.status)

const redirectFailure = async (response: Response): Promise<ServerFailure | NetworkFailure> => {
  const discarded = await discardBody(response)
  if (!discarded.success) return discarded.error
  const location = response.headers.get("location")
  return {
    type: "server",
    status: response.status,
    message: location === null ? "redirect refused" : `redirect to ${location} refused`,
  }
}

const serverFailure = async (response: Response): Promise<ServerFailure> => ({
  type: "server",
  status: response.status,
  message: await serverMessage(response),
})

const targetHost = (url: string): string | null =>
  (URL.parse(url) ?? URL.parse(url, SAME_ORIGIN_BASE))?.hostname ?? null

/**
 * Whether a client may reach a private, loopback or link-local address or `localhost`: `refuse-private` for a client
 * whose targets someone else names, `allow-private` for one that requests only targets its user chose.
 */
export type PrivateAddressPolicy = "refuse-private" | "allow-private"

const refusedTarget = (privateAddresses: PrivateAddressPolicy, url: string): NetworkFailure | null => {
  if (privateAddresses === "allow-private") return null
  const host = targetHost(url)
  return host !== null && isPrivateHost(host)
    ? networkFailure(`refused a request to the private address ${host}`)
    : null
}

const refusedLanding = (
  privateAddresses: PrivateAddressPolicy,
  input: HttpRequest,
  response: Response,
): NetworkFailure | null => {
  if (!response.redirected) return null
  if (input.followRedirectTo?.(response.url) !== true) return networkFailure(`redirect to ${response.url} refused`)
  return refusedTarget(privateAddresses, response.url)
}

// Deliberate: the literal-address refusal is all a client can do without DNS; the rest is the host's — see ADR-0032
/**
 * Build an `HttpClient` backed by `globalThis.fetch` (or a caller-supplied `fetch`) that applies each request's own
 * redirect and body policy and the client's own private-address policy. A redirect is a `ServerFailure` unless the
 * request sets `followRedirectTo`, and a landing URL that predicate rejects is a `NetworkFailure`. A URL, or a followed
 * redirect's landing URL, whose host is a private, loopback or link-local literal address, or `localhost`, is a
 * `NetworkFailure` unless the client is built with `"allow-private"` (`privateAddresses`); the request's URL is refused
 * before any request is made, and a landing URL after the followed redirect has reached it, its answer discarded. A
 * fetch that rejects with its transport failure (a `TypeError`), an abort (a `DOMException`, or the reason the
 * request's signal was aborted with) is a `NetworkFailure`, and any other throw from `fetch` propagates as the fault it
 * is; a status `>= 400` is a `ServerFailure`, and a successful body larger than the request's `maxBodyBytes`
 * ({@link DEFAULT_MAX_BODY_BYTES} when unset) a `NetworkFailure` from its reader. A redirect is a 301, 302, 303, 307 or
 * 308, the statuses `fetch` follows; any other status below 400, a `304 Not Modified` included, succeeds with its
 * `status`.
 */
export const createHttpClient = (
  privateAddresses: PrivateAddressPolicy = "refuse-private",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
): HttpClient => ({
  request: async (input: HttpRequest): Promise<Result<HttpResponse, HttpRequestFailure>> => {
    const refused = refusedTarget(privateAddresses, input.url)
    if (refused !== null) return failure(refused)
    const response = await fetchResponse(
      (signal) =>
        fetchImpl(input.url, {
          method: input.method,
          headers: input.headers ?? {},
          body: input.body ?? null,
          redirect: input.followRedirectTo === undefined ? "manual" : "follow",
          signal: signal ?? null,
        }),
      input.signal,
    )
    if (!response.success) return response
    if (isRedirect(response.value)) return failure(await redirectFailure(response.value))
    const landing = refusedLanding(privateAddresses, input, response.value)
    if (landing !== null) {
      const discarded = await discardBody(response.value)
      return failure(discarded.success ? landing : discarded.error)
    }
    if (response.value.status >= 400) return failure(await serverFailure(response.value))
    return ok(toHttpResponse(response.value, input.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES))
  },
})
