// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import jsonata from 'jsonata'
import { describe, expect, it } from 'vitest'
import { datapointRefs } from './datapointRefs'
import {
    queryDatapointRefs,
    undeclaredDatapointRefs,
    validateQueryExpression,
} from './query-expression'

describe('validateQueryExpression', () => {
    it('accepts a well-formed JSONata expression', () => {
        expect(validateQueryExpression('dp_annual_income > 50000')).toEqual({
            ok: true,
        })
    })

    it('accepts a boolean-combining expression', () => {
        const result = validateQueryExpression(
            'dp_age >= 18 and dp_score < 700',
        )
        expect(result.ok).toBe(true)
    })

    it('accepts a backtick-quoted reference', () => {
        expect(validateQueryExpression('`dp_age` >= 18').ok).toBe(true)
    })

    it('rejects a syntactically invalid expression with a message', () => {
        const result = validateQueryExpression('dp_age >= ')
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.message).toBeTypeOf('string')
        expect(result.message.length).toBeGreaterThan(0)
    })

    it('rejects an unbalanced parenthesis', () => {
        expect(validateQueryExpression('(dp_age >= 18').ok).toBe(false)
    })
})

// [expression, the names it reads from the input document]
const SPEC_EXPRESSIONS: [string, string[]][] = [
    ['dp_annual_income > 50000', ['dp_annual_income']],
    ['dp_state = "BY"', ['dp_state']],
    ['dp_alleinlebend = true', ['dp_alleinlebend']],
    ['2024 - dp_birth_year >= 18', ['dp_birth_year']],
    ['(dp_zve - 11604) * 0.14', ['dp_zve']],
    ["$lookup({'yes': true, 'no': false}, dp_answer_1)", ['dp_answer_1']],
    ['dp_antragsteller.dp_geburtsdatum', ['dp_antragsteller']],
    ['dp_buergen[0].dp_nachname', ['dp_buergen']],
    ["$children[0].status = 'false' and $children[1].status = 'true'", []],
    ['$count($children) = 0', []],
    ['$count($children[status = "true"]) >= 2', []],
    ["$count($children[status = 'true']) * 2 > $count($children)", []],
    ["$count($children[status = 'true']) >= 2 and $random() < 0.1", []],
    ['$count($children[lexId != "7" and status = "false"]) = 0', []],
    ['$count($children[lexId in ["4", "5"] and status = "true"]) >= 1', []],
    ['$children[lexId = "4"].status = "true"', []],
    ["dp_alter >= 65 or $count($children[status = 'true']) = 3", ['dp_alter']],
]

const ROOT_READS: [string, string[]][] = [
    ['income > 50000 and age >= 18', ['income', 'age']],
    ['`income` > 1', ['income']],
    ['[a, b, a]', ['a', 'b']],
    ['{ "key": a }', ['a']],
    ['a ? b : c', ['a', 'b', 'c']],
    ['(a + b) * -c', ['a', 'b', 'c']],
    ['$sum(items.price) > limit', ['items', 'limit']],
    ['$.a > 1 and $$.b > 2', ['a', 'b']],
    ['a in ["x", "y"] or $not(b)', ['a', 'b']],
    ['$match(a, /b+c/i)', ['a']],
    ['a /* b */ > 1', ['a']],
    ['( $limit := 3; a > $limit )', ['a']],
    ['a ~> $string() ~> $length()', ['a']],
    ['a ?: b', ['a', 'b']],
    ['a ?? b', ['a', 'b']],
    ['[1..a]', ['a']],
    ['(a).b', ['a']],
    ['$f(a).b', ['a']],
    // a function body sees the context of the place it is written in
    ['$map([1, 2], function($v) { $v * rate })', ['rate']],
    ['$map(items, λ($v) { $v.price * rate })', ['items', 'rate']],
    // `@` binds the item and keeps the context
    ['persons@$p.limit', ['persons', 'limit']],
    ['persons@$p[limit > 5]', ['persons', 'limit']],
    // `$$` is the input document everywhere
    ['persons[age > $$.limit]', ['persons', 'limit']],
    ['persons.address.$$.limit', ['persons', 'limit']],
]

// The names in the brackets belong to the item, not to the input document.
const PER_ITEM: [string, string[]][] = [
    ['dp_persons.{ "n": dp_name }', ['dp_persons']],
    ['dp_persons.[dp_name]', ['dp_persons']],
    ['dp_persons.$uppercase(dp_name)', ['dp_persons']],
    ['dp_persons.(dp_first & dp_last)', ['dp_persons']],
    ['dp_persons[dp_age > 18]', ['dp_persons']],
    ['dp_persons[dp_age > 18].dp_address[dp_city = "X"]', ['dp_persons']],
    ['dp_persons.dp_address.{ "c": dp_city }', ['dp_persons']],
    ['dp_persons^(>dp_age, dp_name)', ['dp_persons']],
    ['dp_persons{ dp_name: dp_age }', ['dp_persons']],
    ['dp_persons#$i[dp_age > 18]', ['dp_persons']],
    ['dp_persons.$.dp_name', ['dp_persons']],
    ['dp_persons.*.dp_name', ['dp_persons']],
    ['**.dp_name', []],
    ['$filter(dp_persons, function($p) { $p.dp_age > 18 })', ['dp_persons']],
    ['dp_persons.(function($x) { $x & dp_name })("a")', ['dp_persons']],
    ['$sum(dp_persons.(dp_age * 2))', ['dp_persons']],
    ['$f(dp_persons)[dp_age > 18]', ['dp_persons']],
    ['[dp_a, dp_b][dp_c]', ['dp_a', 'dp_b']],
    ['$x[dp_c]', []],
    ['λ($v){ $v }', []],
    ['dp_persons ~> |dp_address|{ "c": dp_city }|', ['dp_persons']],
]

const ALL = [...SPEC_EXPRESSIONS, ...ROOT_READS, ...PER_ITEM]

describe('queryDatapointRefs', () => {
    it.each(SPEC_EXPRESSIONS)('spec: %s', (expression, expected) => {
        expect(queryDatapointRefs(expression)).toEqual(expected)
    })

    it.each(ROOT_READS)('reads %s', (expression, expected) => {
        expect(queryDatapointRefs(expression)).toEqual(expected)
    })

    it.each(PER_ITEM)('per item: %s', (expression, expected) => {
        expect(queryDatapointRefs(expression)).toEqual(expected)
    })

    it('does not read strings, $variables, literals or later path steps', () => {
        expect(
            queryDatapointRefs(
                `$x > 1 and person.name = null and a != "c \\" d" and b = 'e' and true`,
            ),
        ).toEqual(['person', 'a', 'b'])
    })

    it.each(['dp_age >= ', '(dp_age >= 18', 'a.{'])(
        'has no reads for the unparsable %s',
        (expression) => {
            expect(queryDatapointRefs(expression)).toEqual([])
        },
    )

    // What JSONata itself asks the input document for, when it evaluates.
    const readsAtRuntime = async (expression: string) => {
        const item = { dp_age: 30, dp_name: 'n', dp_first: 'f', dp_last: 'l' }
        const person = { ...item, dp_address: [{ dp_city: 'X' }] }
        const data: Record<string, unknown> = {
            dp_persons: [person, { ...person, dp_age: 40 }],
            persons: [{ age: 50, address: { city: 'X' } }],
            items: [{ price: 2 }],
            dp_antragsteller: { dp_geburtsdatum: '2000-01-01' },
            dp_buergen: [{ dp_nachname: 'n' }],
        }
        // The evaluator also probes internal keys on every object; only names
        // written in the expression count.
        const written = new Set(expression.match(/[A-Za-z_]\w*/g))
        const reads = new Set<string>()
        const note = (key: PropertyKey) => {
            if (typeof key === 'string' && written.has(key)) reads.add(key)
        }
        const input = new Proxy(data, {
            get(target, key, receiver) {
                note(key)
                return Reflect.get(target, key, receiver) as unknown
            },
            has(target, key) {
                note(key)
                return Reflect.has(target, key)
            },
            getOwnPropertyDescriptor(target, key) {
                note(key)
                return Reflect.getOwnPropertyDescriptor(target, key)
            },
        })
        const children = [{ lexId: '4', status: 'true' }]
        await jsonata(expression)
            .evaluate(input, { children, f: (x: unknown) => x, x: [] })
            .catch(() => undefined)
        return reads
    }

    // A transform copies and `**` walks the whole input document.
    const evaluable = ([expression]: [string, string[]]) =>
        !expression.includes('|') && !expression.includes('**')

    // Everything JSONata reads from the input document is reported. (It reads
    // less than is written where `and`, `or` or `? :` skip an operand.)
    it.each(ALL.filter(evaluable))(
        'covers what JSONata reads: %s',
        async (expression) => {
            const reported = new Set(queryDatapointRefs(expression))
            const read = [...(await readsAtRuntime(expression))]
            expect(read.filter((key) => !reported.has(key))).toEqual([])
        },
    )

    // The reverse, where every operand is evaluated: nothing is reported
    // that JSONata does not read.
    it.each(PER_ITEM.filter(evaluable))(
        'reports nothing JSONata does not read: %s',
        async (expression, expected) => {
            const read = await readsAtRuntime(expression)
            expect(expected.filter((key) => !read.has(key))).toEqual([])
        },
    )
})

describe('undeclaredDatapointRefs', () => {
    it('reports each undeclared id once', () => {
        expect(
            undeclaredDatapointRefs(
                'dp_a > dp_b and dp_b < dp_c',
                new Set(['dp_a']),
            ),
        ).toEqual(['dp_b', 'dp_c'])
    })

    it('does not report the fields of a set', () => {
        expect(
            undeclaredDatapointRefs(
                'dp_persons.{ "n": dp_name } and dp_persons[dp_age > limit]',
                new Set(['dp_persons']),
            ),
        ).toEqual([])
    })

    it('reports a name that cannot be a datapoint id', () => {
        expect(undeclaredDatapointRefs('`dp-a` > Income', new Set())).toEqual([
            'dp-a',
            'Income',
        ])
    })
})

// The scan in the main entry never reports more than the exact check.
describe('datapointRefs (main entry) against the exact check', () => {
    it.each(ALL)('%s', (expression) => {
        const exact = new Set(queryDatapointRefs(expression))
        expect(
            datapointRefs(expression).filter((id) => !exact.has(id)),
        ).toEqual([])
    })
})
