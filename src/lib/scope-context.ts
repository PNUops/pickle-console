import { createContext } from 'react'

/**
 * Which workspace the console is currently looking through.
 *
 * `null` means "everything I can see", which is what most people want most of
 * the time: a student with one personal workspace should never have to pick it.
 * A class or club workspace with dozens of resources is the case the scope
 * exists for — there, an unscoped list is mostly other people's rows.
 */
export type Scope = number | null

export const ScopeContext = createContext<Scope>(null)
