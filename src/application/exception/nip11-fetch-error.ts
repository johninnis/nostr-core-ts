import type { HttpRequestError } from "../port/http.ts"
import { TaggedError } from "../../domain/exception/tagged-error.ts"

export type Nip11FetchErrorTag = "transport" | "body-read" | "schema-mismatch"

/**
 * `fetchRelayInformation` failure. `transport` and `body-read` carry the underlying
 * `HttpRequestError` as `cause`; `schema-mismatch` carries the parsed-but-non-conformant body
 * (typed as `unknown` because it failed schema validation) so callers can log the offending shape.
 */
export type Nip11FetchErrorCause = HttpRequestError | { readonly body: unknown }

export class Nip11FetchError extends TaggedError<Nip11FetchErrorTag, Nip11FetchErrorCause> {
  constructor(tag: Nip11FetchErrorTag, message: string, cause?: Nip11FetchErrorCause) {
    super(tag, message, cause)
  }
}
