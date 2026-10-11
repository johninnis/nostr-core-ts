# 0041. `buildNip98AuthEvent` writes the method as Fetch sends it, and the validator compares it as it arrived

## Status

Accepted

## Context

A NIP-98 auth event binds itself to one HTTP request through its `u`, `method` and `payload` tags, and NIP-98 says the `method` tag "MUST be the same HTTP method used for the requested resource". RFC 9110: "The method token is case-sensitive". Shared ADR-0070 decides for every implementation that the `method` tag is compared with the request's method byte for byte, with case, and that a builder writes the method as the request will be sent.

Most callers of this package send through Fetch, and Fetch does not always send the method it was given: it upper-cases a method that is a byte-case-insensitive match for `DELETE`, `GET`, `HEAD`, `OPTIONS`, `POST` or `PUT`, and sends any other method as written. `buildNip98AuthEvent` wrote the method exactly as given, so a caller that built an event for `post` and sent the request through Fetch sent `POST` under an event naming `post`, and the server rightly refused it. JavaScript's `toUpperCase` folds more than ASCII: `"poſt".toUpperCase()` is `POST`, which Fetch's byte comparison would not match.

## Decision

- `buildNip98AuthEvent` writes the `method` tag as Fetch sends the method: one of Fetch's six normalised methods (`DELETE`, `GET`, `HEAD`, `OPTIONS`, `POST`, `PUT`), given in any case, is written upper-cased; any other method is written exactly as given. The match folds ASCII letters only, as Fetch's byte-case-insensitive match does, so a method spelled with any other character is written as given.
- Nothing is refused: a lower-case standard method is upper-cased, not rejected.
- The upper-casing lives in the builder alone. `checkNip98Event`, and through it `createNip98Validator`, compares the `method` tag with the request's method byte for byte, as the method arrived on the wire.

## Consequences

- A builder given `post` writes `POST`, matching what Fetch sends, and the same request builds the same event here and in innis/nostr-core's `RumourFactory::createHttpAuth`.
- `patch` and `PATCH` stay distinct: Fetch sends `patch` as written, and the builder writes it so.
- Do not upper-case every method, and do not upper-case with `toUpperCase`: the first breaks every method Fetch does not normalise, the second folds characters Fetch does not.
- Do not normalise the method in the validator: it compares against the method the client sent.
- Shared decision: nostr-adrs ADR-0070.
