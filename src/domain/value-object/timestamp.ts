/**
 * A function returning the current Unix time in seconds. Use this type to declare a clock-shaped
 * dependency on a service or builder; the default implementation is the {@link now} export.
 */
export type Clock = () => number

/**
 * Current Unix time in seconds (the timestamp format used by Nostr events).
 *
 * This is the **default** clock implementation. Any function or service in this library that
 * derives a timestamp from "now" calls this internally — but every one of them also accepts an
 * optional `Clock` parameter (named `createdAt: number` on builders, `clock: Clock` on services).
 * Pass a fixed clock from tests or from hosts that need deterministic timestamps; omit it and
 * `now` is used.
 */
export const now: Clock = () => Math.floor(Date.now() / 1000)
