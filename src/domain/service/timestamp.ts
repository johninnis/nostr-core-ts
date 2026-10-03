/**
 * A function returning the current Unix time in seconds. Use this type to declare a clock-shaped
 * dependency on a service or builder; the default implementation is the {@link now} export.
 */
export type Clock = () => number

// Deliberate: the clock is ambient, not a port; services take an optional override — see ADR-0007
/**
 * Current Unix time in seconds (the timestamp format used by Nostr events).
 *
 * This is the **default** clock implementation; there is no clock port. Services that evaluate or stamp time
 * (`createNip98Validator`, `buildDmGiftWraps`) accept an optional `clock: Clock`. Among the event builders only
 * `buildTextNote`, `buildLongform`, `buildZapRequest`, `buildNip98AuthEvent`, `buildNewListEvent` and
 * `buildReplaceableListEvent` accept a `createdAt`, and it defaults to `now()`; every other builder stamps `created_at`
 * with `now()`. A caller needing a fixed timestamp spreads an unsigned result (`{ ...buildReaction(target),
 * created_at: t }`) and re-stamps a rumour through `buildRumour`, which hashes its id anew
 * (`buildRumour({ ...buildPrivateMessage(room, text), created_at: t })`).
 */
export const now: Clock = () => Math.floor(Date.now() / 1000)
