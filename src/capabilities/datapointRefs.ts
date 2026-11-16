// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
// §4.8, §4.14: an expression is evaluated against an input document that holds
// each datapoint value under the datapoint's id, so a datapoint reference is a
// field name read from that document.
//
// This is a token scan, not a JSONata parse: the main entry stays free of
// `jsonata`. It reports a name only when it is certain to be read from the
// input document, and never rejects a valid expression: a name inside any
// bracket that follows a value or a `.` (a predicate, a grouping, a
// `.( … )` / `.{ … }` / `.[ … ]` block, the arguments of a function used as a
// path step, a function body, a sort term) is not reported, and an expression
// with a regex literal, a transform or unbalanced brackets reports nothing.
//
// The exact check, on the JSONata syntax tree, is `queryDatapointRefs` in the
// `./query` entry; `RumlValidator` uses it when it is passed as
// `expressionReads`.

// The characters that end a name in the JSONata tokenizer.
const NAME = /[^ \t\n\r\v.[\]{}(),@#;:?+\-*/%|=<>^&!~]+/y
const NUMBER = /(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[Ee][-+]?[0-9]+)?/y
const INFIX_KEYWORDS = new Set(['and', 'or', 'in'])
const LITERALS = new Set(['true', 'false', 'null'])
const LAMBDA_KEYWORDS = new Set(['function', 'λ'])
const CLOSING = { '(': ')', '[': ']', '{': '}' } as const

const match = (
    pattern: RegExp,
    text: string,
    at: number,
): string | undefined => {
    pattern.lastIndex = at
    return pattern.exec(text)?.[0]
}

// A lambda's `<…>` type signature after its parameter list; returns the
// position after it, or -1 when it is not closed.
const skipSignature = (expression: string, at: number): number => {
    let next = at
    while (/[ \t\n\r\v]/.test(expression.charAt(next))) next += 1
    if (expression[next] !== '<') return at
    let depth = 0
    for (; next < expression.length; next += 1) {
        if (expression[next] === '<') depth += 1
        else if (expression[next] === '>' && --depth === 0) return next + 1
    }
    return -1
}

type Previous = {
    token: string
    // The token ends a value, so a bracket after it applies to that value.
    isValue: boolean
    // `$$`, or `$` while the context is the input document.
    isRoot: boolean
    // A `$function` that is not a path step: its arguments keep the context.
    isCall: boolean
}

export function datapointRefs(expression: string): string[] {
    const refs = new Set<string>()
    // Per open bracket: its closing character, and whether the context
    // inside it is certainly still the input document.
    const open: { closing: string; rooted: boolean; lambda: boolean }[] = []
    const inRoot = () => open.every(({ rooted }) => rooted)
    let previous: Previous = {
        token: '',
        isValue: false,
        isRoot: false,
        isCall: false,
    }
    let dotFollowsRoot = false

    const value = (token: string, flags: Partial<Previous> = {}) => {
        previous = { token, isValue: true, isRoot: false, isCall: false }
        Object.assign(previous, flags)
    }
    const operator = (token: string) => {
        previous = { token, isValue: false, isRoot: false, isCall: false }
    }
    const name = (id: string) => {
        if (previous.token === '.' ? dotFollowsRoot : inRoot()) refs.add(id)
        value(id)
    }

    let at = 0
    while (at < expression.length) {
        const char = expression.charAt(at)
        if (' \t\n\r\v'.includes(char)) {
            at += 1
        } else if (expression.startsWith('/*', at)) {
            const end = expression.indexOf('*/', at + 2)
            if (end === -1) return []
            at = end + 2
        } else if (char === '/' && !previous.isValue) {
            return [] // a regex literal
        } else if (char === '|') {
            return [] // a transform
        } else if (char === '"' || char === "'") {
            at += 1
            while (at < expression.length && expression[at] !== char) {
                at += expression[at] === '\\' ? 2 : 1
            }
            if (at >= expression.length) return []
            at += 1
            value(char)
        } else if (char === '`') {
            const end = expression.indexOf('`', at + 1)
            if (end === -1) return []
            name(expression.slice(at + 1, end))
            at = end + 1
        } else if (char === '(' || char === '[' || char === '{') {
            const afterStep = previous.token === '.' || previous.token === '^'
            const keepsContext = previous.isValue
                ? char === '(' && previous.isCall
                : !afterStep
            open.push({
                closing: CLOSING[char],
                rooted: keepsContext,
                lambda: LAMBDA_KEYWORDS.has(previous.token),
            })
            operator(char)
            at += 1
        } else if (char === ')' || char === ']' || char === '}') {
            const closed = open.pop()
            if (closed?.closing !== char) return []
            at += 1
            if (closed.lambda) {
                at = skipSignature(expression, at)
                if (at === -1) return []
            }
            value(char)
        } else if (expression.startsWith('..', at)) {
            operator('..')
            at += 2
        } else if (char === '.') {
            dotFollowsRoot = previous.isRoot
            operator('.')
            at += 1
        } else if ((char === '*' || char === '%') && !previous.isValue) {
            at += expression.startsWith('**', at) ? 2 : 1
            value(char)
        } else if (/[0-9]/.test(char)) {
            at += (match(NUMBER, expression, at) as string).length
            value('0')
        } else {
            const word = match(NAME, expression, at)
            if (word === undefined) {
                operator(char)
                at += 1
                continue
            }
            at += word.length
            if (word.startsWith('$')) {
                const isStep = previous.token === '.'
                value(word, {
                    isRoot:
                        word === '$$' || (word === '$' && !isStep && inRoot()),
                    isCall: !isStep,
                })
            } else if (INFIX_KEYWORDS.has(word) && previous.isValue) {
                operator(word)
            } else if (LITERALS.has(word)) {
                value(word)
            } else if (
                LAMBDA_KEYWORDS.has(word) &&
                expression.slice(at).trimStart().startsWith('(')
            ) {
                operator(word)
            } else {
                name(word)
            }
        }
    }
    return open.length === 0 ? [...refs] : []
}

export function unknownDatapointRefs(
    expression: string,
    declared: ReadonlySet<string>,
): string[] {
    return datapointRefs(expression).filter((id) => !declared.has(id))
}
