/**
 * Returned (inside `Failure(...)`) by `parseAuthHeader` or `parseBlossomAuthHeader` when an `Authorization: Nostr`
 * header cannot be read as a signed event: it is over the length limit, does not use the `Nostr` scheme, or its
 * credentials are not base64 in a form that reader takes, not JSON, or not an event. These are properties of the wire
 * format, not of NIP-98 or Blossom, which share it.
 */
export type AuthHeaderDecodeFailure =
  | "header-too-long"
  | "header-bad-prefix"
  | "header-bad-base64"
  | "header-bad-json"
  | "header-bad-event"
