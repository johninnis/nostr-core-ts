/**
 * No usable answer to a JSON document fetch: a transport failure, timeout or abort, an error status other than 404, a
 * refused redirect, or a body that could not be read as JSON. `message` describes it for display.
 */
export interface NoAnswerFailure {
  readonly type: "no-answer"
  readonly message: string
}

/**
 * Returned (inside `Failure(...)`) by `readJsonDocument`: `not-found` when the server answered 404 — the document is
 * not there — and {@link NoAnswerFailure} for every other way of getting no document. Discriminate on `type`.
 */
export type JsonFetchFailure = { readonly type: "not-found" } | NoAnswerFailure
