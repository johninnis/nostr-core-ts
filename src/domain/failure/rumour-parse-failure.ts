/**
 * Returned (inside `Failure(...)`) by `parseRumour`: the value is not a well-formed unsigned event with an `id`, or its
 * `id` differs from the one its fields compute to.
 */
export type RumourParseFailure = "rumour-malformed" | "rumour-id-mismatch"
