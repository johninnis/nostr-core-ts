# 0007. The clock and the RNG are ambient capabilities with optional injection

## Status

Accepted

## Context

Strict layering would put the system clock and the random-number generator behind ports, and domain code calling `Date.now()` or `crypto.getRandomValues()` directly reads like a layering violation. But both exist on every runtime this package targets, and threading clock and RNG ports through every builder adds a parameter to calls that never want to override them. The builders differ in how much they take: most are two- or three-argument positional calls, a few take one input object (ADR-0033). A builder's result also differs: most return an `UnsignedEvent`, whose id is computed only when it is signed, but the NIP-17 builders return a `Rumour`, whose id is already hashed over its `created_at`.

## Decision

- `now()` (Unix seconds) and `randomBytes` / `randomUint32` live in `domain/service/` and call the platform directly. There is no clock or RNG port.
- A service that evaluates or stamps a time, or draws randomness, accepts an optional override defaulting to these functions: `createNip98Validator` and `buildDmGiftWraps` take `clock?: Clock`, and `buildDmGiftWraps` `randomUint32?: RandomUint32Fn`. A service that would only stamp a time on what it reports takes no clock and leaves the stamp to its listener: the NIP-05 verifier has none.
- Among the builders, only `buildTextNote` and the input-object builders (`buildLongform`, `buildZapRequest`, `buildNip98AuthEvent`, `buildNewListEvent`, `buildReplaceableListEvent`) accept a `createdAt`, always as `createdAt?: number` — absent means "now", and there is no second spelling such as `null` — defaulting to `now()`. Every other builder stamps `created_at` with `now()`.
- A caller needing a fixed timestamp on an `UnsignedEvent` spreads the result (`{ ...buildReaction(target), created_at: t }`): nothing is derived from `created_at` until the event is signed.
- A caller needing a fixed timestamp on a `Rumour` (`buildPrivateMessage`, `buildPrivateReaction`) re-stamps it through `buildRumour`, which computes the id from the fields it is given and ignores any `id` beside them: `buildRumour({ ...buildPrivateMessage(room, text), created_at: t })`. A plain spread would keep the id hashed over the old timestamp, and the rumour would no longer be the event its id names.

## Consequences

- Tests pin time and randomness through the optional parameters, by spreading an unsigned builder's result, or by re-stamping a rumour through `buildRumour`.
- `Date.now()` is read nowhere but `now()`, and randomness is drawn only through `@noble/hashes`' `randomBytes`, which `random.ts` re-exports and the vendored NIP-44 codec (ADR-0016) imports as upstream does; tests fail if `Date.now()` or `crypto.getRandomValues` appears in the source.
- A builder never requires a timestamp. Adding a `createdAt` parameter to every small builder "for consistency", or introducing a clock port, is declined: the first lengthens positional signatures for a need spreading and `buildRumour` already meet (and would give the three-argument NIP-17 builders a fourth), the second threads a parameter through calls that never override it.
- Do not spread a new `created_at` into a `Rumour` without re-hashing it through `buildRumour`.
