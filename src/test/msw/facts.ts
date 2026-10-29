/** Stored synthetic facts precede per-reader nullable response projections. */
export type StoredFacts<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> }
