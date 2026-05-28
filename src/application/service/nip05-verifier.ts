import { reportUnhandledError } from "../../domain/service/error-utils.ts"
import type { Nip05Id } from "../../domain/value-object/nip05-id.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import type { Clock } from "../../domain/value-object/timestamp.ts"
import { now } from "../../domain/value-object/timestamp.ts"
import type { HttpClient } from "../port/http.ts"
import { resolveNip05 } from "./nip05-resolver.ts"

/** Dependencies for `createNip05Verifier` — the `HttpClient` port, the result callback, plus optional error sink, clock, abort signal, and per-lookup timeout. */
export interface Nip05VerifierDeps {
  readonly httpClient: HttpClient
  readonly onVerified: (pubkey: PublicKey, verified: boolean, checkedAt: number) => void
  /** Background-task error sink. Defaults to re-throwing in a microtask so unhandled rejections surface to the host. */
  readonly onError?: (error: unknown) => void
  /** Clock stamped onto each `onVerified` call. Defaults to the system clock ({@link now}). */
  readonly clock?: Clock
  /** When this signal aborts, in-flight resolver lookups are cancelled and queued pubkeys are dropped without `onVerified` being called. */
  readonly signal?: AbortSignal
  /** Per-lookup timeout passed through to {@link resolveNip05}. Defaults to the resolver's own default. */
  readonly timeoutMs?: number
}

/** Verifier returned by `createNip05Verifier` — `verify` queues a pubkey/NIP-05 pair for resolution; `whenIdle` resolves when the queue is drained. */
export interface Nip05Verifier {
  /** Queue a verification of `pubkey`'s claim to `nip05`; idempotent — repeat calls for an already-queued pubkey are no-ops. */
  readonly verify: (pubkey: PublicKey, nip05: Nip05Id) => void
  /**
   * Resolve when every queued lookup has either fired `onVerified` or been dropped due to abort.
   * Lets tests and graceful-shutdown paths drain deterministically instead of `setTimeout`-polling.
   */
  readonly whenIdle: () => Promise<void>
}

interface QueueEntry {
  readonly pubkey: PublicKey
  readonly nip05: Nip05Id
}

const getDomain = (nip05: Nip05Id): string => nip05.slice(nip05.indexOf("@") + 1)

/** Build a fire-and-forget NIP-05 verifier that serialises lookups per-domain and reports results via `onVerified`. */
export const createNip05Verifier = (deps: Nip05VerifierDeps): Nip05Verifier => {
  const onError = deps.onError ?? reportUnhandledError
  const clock = deps.clock ?? now
  const queued: Set<PublicKey> = new Set()
  const domainQueues: Map<string, Array<QueueEntry>> = new Map()
  const inFlight: Set<Promise<void>> = new Set()

  const drainQueuedPubkeys = (queue: ReadonlyArray<QueueEntry>, fromIndex: number): void => {
    for (let i = fromIndex; i < queue.length; i++) {
      const entry = queue[i]
      if (entry) queued.delete(entry.pubkey)
    }
  }

  const processQueue = async (domain: string): Promise<void> => {
    const queue = domainQueues.get(domain)
    if (!queue) return
    // Index-pointer walk instead of `Array.shift()` — shift is O(n) per call, quadratic for long
    // single-domain bursts. The queue ref stays the slot in `domainQueues`; we never copy it.
    let head = 0
    while (head < queue.length) {
      if (deps.signal?.aborted) {
        drainQueuedPubkeys(queue, head)
        break
      }
      const entry = queue[head++]
      if (!entry) continue
      const { pubkey, nip05 } = entry

      const resolved = await resolveNip05(nip05, deps.httpClient, { timeoutMs: deps.timeoutMs, signal: deps.signal })

      // Re-check after the await: if the host aborted mid-resolve, `resolved` will be `null` (the
      // resolver swallows the abort). Firing `onVerified(pubkey, false, ...)` would falsely report
      // verified=false. The JSDoc contract is "queued pubkeys are dropped without `onVerified`
      // being called" on abort — extended here to the entry that was in-flight at the moment of abort.
      if (deps.signal?.aborted) {
        queued.delete(pubkey)
        drainQueuedPubkeys(queue, head)
        break
      }

      const verified = resolved === pubkey
      queued.delete(pubkey)
      deps.onVerified(pubkey, verified, clock())
    }
    domainQueues.delete(domain)
  }

  const verify = (pubkey: PublicKey, nip05: Nip05Id): void => {
    if (queued.has(pubkey)) return
    queued.add(pubkey)

    const domain = getDomain(nip05)
    const queue = domainQueues.get(domain)
    if (queue) {
      queue.push({ pubkey, nip05 })
      return
    }
    domainQueues.set(domain, [{ pubkey, nip05 }])
    const promise = processQueue(domain)
    inFlight.add(promise)
    promise.catch(onError).finally(() => inFlight.delete(promise))
  }

  const whenIdle = async (): Promise<void> => {
    while (inFlight.size > 0) {
      await Promise.allSettled([...inFlight])
    }
  }

  return { verify, whenIdle }
}
