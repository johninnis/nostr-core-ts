/**
 * What the tags of one name, or any other single-valued claim, state as their one value (shared ADR-0014): `one` with
 * the value they agree on, the empty string included; `absent` when nothing carries a value; `disagreeing` when they
 * carry different values. `value` is `null` unless the state is `one`, so a reader that only wants the value reads
 * `value`, and one that must tell a missing claim from a contested one reads `state`. `distinctValues` is every value
 * the claim saw, once each in the order first seen: none when absent, the one value, or the values that disagree.
 */
export type SoleTagValue<T = string> =
  | { readonly state: "one"; readonly value: T; readonly distinctValues: ReadonlyArray<T> }
  | { readonly state: "absent" | "disagreeing"; readonly value: null; readonly distinctValues: ReadonlyArray<T> }

/**
 * What `values` state as their one value: `one` when every value has the same `keyOf` key (the value itself by
 * default), `absent` when there are none, and `disagreeing` when two keys differ.
 */
export const soleValue = <T>(
  values: ReadonlyArray<T>,
  keyOf: (value: T) => unknown = (value) => value,
): SoleTagValue<T> => {
  const distinctValues = [...new Map(values.map((value) => [keyOf(value), value] as const)).values()]
  const [first] = distinctValues
  if (first === undefined) return { state: "absent", value: null, distinctValues }
  return distinctValues.length === 1
    ? { state: "one", value: first, distinctValues }
    : { state: "disagreeing", value: null, distinctValues }
}
