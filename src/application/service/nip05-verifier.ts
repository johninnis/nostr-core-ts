import { splitInternetIdentifier } from "../../domain/value-object/internet-identifier.ts"
import type { Nip05Id } from "../../domain/value-object/nip05-id.ts"
import type { PublicKey } from "../../domain/value-object/public-key.ts"
import type { HttpClient } from "../port/http.ts"
import type { NoAnswerFailure } from "../failure/json-fetch-failure.ts"
import { DEFAULT_NIP05_TIMEOUT_MS, resolveNip05 } from "./nip05-resolver.ts"

/**
 * What `createNip05Verifier` reports to its host: each verdict, each lookup that got no answer, and each fault thrown
 * inside a queued lookup.
 */
export interface Nip05VerifierListener {
  /** Called with a verdict once the domain answered: `verified` is whether it maps the name to `pubkey`. */
  readonly onVerified: (pubkey: PublicKey, verified: boolean) => void
  /**
   * Called instead of `onVerified` when the lookup got no answer to judge (offline, timeout, server error); the pubkey
   * may be verified again later.
   */
  readonly onLookupFailed?: (pubkey: PublicKey, failure: NoAnswerFailure) => void
  /**
   * Sink for a fault thrown inside a queued lookup, which has no caller to reach; the host routes it to its own
   * unhandled-error handling.
   */
  readonly onError: (error: unknown) => void
}

/**
 * Verifier returned by `createNip05Verifier` — `verify` queues a pubkey/NIP-05 pair for resolution; `whenIdle` resolves
 * when the queue is drained.
 */
export interface Nip05Verifier {
  /**
   * Queue a verification of `pubkey`'s claim to `nip05`; idempotent — repeat calls for an already-queued pubkey are
   * no-ops.
   */
  readonly verify: (pubkey: PublicKey, nip05: Nip05Id) => void
  /**
   * Resolve when every queued lookup has reported to the listener (`onVerified` or `onLookupFailed`) or been dropped:
   * because `signal` aborted, or because a listener call threw, which is reported to `onError` and drops the rest of
   * that domain's queue without a verdict. Lets tests and graceful-shutdown paths drain deterministically instead of
   * `setTimeout`-polling.
   */
  readonly whenIdle: () => Promise<void>
}

interface QueueEntry {
  readonly pubkey: PublicKey
  readonly nip05: Nip05Id
}

/**
 * Build a fire-and-forget NIP-05 verifier that resolves through `httpClient`, serialises lookups per domain and reports
 * to `listener`. Each lookup is bounded by {@link DEFAULT_NIP05_TIMEOUT_MS}; when `signal` aborts, in-flight lookups
 * are cancelled and queued pubkeys are dropped without a verdict.
 */
export const createNip05Verifier = (
  httpClient: HttpClient,
  listener: Nip05VerifierListener,
  signal?: AbortSignal,
): Nip05Verifier => {
  const queued: Set<PublicKey> = new Set()
  const domainQueues: Map<string, Array<QueueEntry>> = new Map()
  const inFlight: Set<Promise<void>> = new Set()

  const forgetQueue = (domain: string, unreported: ReadonlyArray<QueueEntry>): void => {
    for (const entry of unreported) queued.delete(entry.pubkey)
    domainQueues.delete(domain)
  }

  const lookupSignal = (): AbortSignal => {
    const deadline = AbortSignal.timeout(DEFAULT_NIP05_TIMEOUT_MS)
    return signal === undefined ? deadline : AbortSignal.any([signal, deadline])
  }

  const drainQueue = async (domain: string, queue: ReadonlyArray<QueueEntry>): Promise<void> => {
    let reported = 0
    try {
      for (const { pubkey, nip05 } of queue) {
        if (signal?.aborted) return
        const resolved = await resolveNip05(httpClient, nip05, lookupSignal())
        if (signal?.aborted) return
        queued.delete(pubkey)
        reported++
        if (resolved.success) listener.onVerified(pubkey, resolved.value === pubkey)
        else listener.onLookupFailed?.(pubkey, resolved.error)
      }
    } finally {
      forgetQueue(domain, queue.slice(reported))
    }
  }

  const verify = (pubkey: PublicKey, nip05: Nip05Id): void => {
    if (queued.has(pubkey)) return
    queued.add(pubkey)

    const { domain } = splitInternetIdentifier(nip05)
    const queue = domainQueues.get(domain)
    if (queue) {
      queue.push({ pubkey, nip05 })
      return
    }
    const created = [{ pubkey, nip05 }]
    domainQueues.set(domain, created)
    const promise = drainQueue(domain, created)
    inFlight.add(promise)
    promise.catch(listener.onError).finally(() => inFlight.delete(promise))
  }

  const whenIdle = async (): Promise<void> => {
    while (inFlight.size > 0) {
      await Promise.allSettled([...inFlight])
    }
  }

  return { verify, whenIdle }
}
