import type { HttpRequestError } from "../port/http.ts"
import { TaggedError } from "../../domain/exception/tagged-error.ts"

/** Discriminator for `Nip11FetchError.tag` — `"transport"` (HTTP request failed), `"body-read"` (response stream / JSON parse failed), `"schema-mismatch"` (parsed body wasn't a NIP-11 document). */
export type Nip11FetchErrorTag = "transport" | "body-read" | "schema-mismatch"

/**
 * `fetchRelayInformation` failure. `transport` and `body-read` carry the underlying
 * `HttpRequestError` as `cause`; `schema-mismatch` carries the parsed-but-non-conformant body
 * (typed as `unknown` because it failed schema validation) so callers can log the offending shape.
 */
export type Nip11FetchErrorCause = HttpRequestError | { readonly body: unknown }

/** Returned (inside `Failure(...)`) by `fetchRelayInformation` when the NIP-11 document can't be retrieved or doesn't match the schema. Discriminate via `error.tag`. */
export class Nip11FetchError extends TaggedError<Nip11FetchErrorTag, Nip11FetchErrorCause> {
  constructor(tag: Nip11FetchErrorTag, message: string, cause?: Nip11FetchErrorCause) {
    super(tag, message, cause)
  }
}
