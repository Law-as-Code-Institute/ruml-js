// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import jsonata from 'jsonata'

export type QueryExpressionValidationResult =
    | { ok: true }
    | { ok: false; message: string }

// The only module importing `jsonata` — reached via the `./query` subpath.

type AstNode = { type?: string; value?: unknown; [key: string]: unknown }

const isNode = (value: unknown): value is AstNode =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

// Collects the names read from the input document. `atRoot`: the context the
// node is evaluated in is the input document itself.
const collectRootReads = (
    node: unknown,
    atRoot: boolean,
    reads: Set<string>,
): void => {
    if (Array.isArray(node)) {
        for (const item of node) collectRootReads(item, atRoot, reads)
        return
    }
    if (!isNode(node)) return
    if (node.type === 'path') {
        let stepAtRoot = atRoot
        for (const step of node.steps as AstNode[]) {
            // `a@$v` binds the item and keeps the context for what follows.
            const keepsContext = step.focus !== undefined
            if (step.type === 'name') {
                if (stepAtRoot) reads.add(String(step.value))
                collectRootReads(step.stages, keepsContext && stepAtRoot, reads)
            } else {
                collectRootReads(step, stepAtRoot, reads)
            }
            const isVariable = step.type === 'variable'
            // `$$` is the input document, `$` the context itself.
            if (isVariable && step.value === '$') {
                stepAtRoot = true
            } else if (!keepsContext && !(isVariable && step.value === '')) {
                stepAtRoot = false
            }
        }
        collectRootReads(node.group, false, reads)
        return
    }
    // `%`: the context is an ancestor, which is not resolved here.
    if (node.type === 'parent') return
    for (const [key, child] of Object.entries(node)) {
        // A predicate, a grouping and a transform see one item at a time. A
        // function body sees the context of the place it is written in.
        const perItem =
            key === 'predicate' ||
            key === 'stages' ||
            key === 'group' ||
            node.type === 'transform'
        collectRootReads(child, atRoot && !perItem, reads)
    }
}

// §4.8, §4.14: the names an expression reads from its input document — the
// datapoint ids it reads (DP-18) — in order of appearance. Exact: taken from
// the JSONata syntax tree. Only the first step of a path that starts at the
// input document counts; a later step (`person.name`) and a name evaluated per
// item (`persons[age > 18]`, `persons.{ "n": name }`, `persons^(age)`) are
// fields of that item. An expression that does not parse has no reads; see
// `validateQueryExpression` for its error.
export const queryDatapointRefs = (expression: string): string[] => {
    let ast: unknown
    try {
        ast = jsonata(expression).ast()
    } catch {
        return []
    }
    const reads = new Set<string>()
    collectRootReads(ast, true, reads)
    return [...reads]
}

export const undeclaredDatapointRefs = (
    expression: string,
    declared: ReadonlySet<string>,
): string[] => queryDatapointRefs(expression).filter((id) => !declared.has(id))

// §4.8 — node-level `ruml:query` expression MUST be written in JSONata.
export const validateQueryExpression = (
    expression: string,
): QueryExpressionValidationResult => {
    try {
        jsonata(expression)
        return { ok: true }
    } catch (error) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
        }
    }
}
