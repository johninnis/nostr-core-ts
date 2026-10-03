/**
 * Returned (inside `Failure(...)`) by `parseAuthHeader` when an `Authorization: Nostr <base64>` header cannot be read
 * as a signed event: it is over the length limit, does not use the `Nostr` scheme, or its credentials are not base64,
 * not JSON, or not an event. These are properties of the wire format, not of NIP-98, which Blossom shares.
 */
export type AuthHeaderDecodeFailure =
  | "header-too-long"
  | "header-bad-prefix"
  | "header-bad-base64"
  | "header-bad-json"
  | "header-bad-event"
