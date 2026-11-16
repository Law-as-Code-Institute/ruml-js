// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { datapointRefs, unknownDatapointRefs } from './datapointRefs'

describe('datapointRefs', () => {
    it.each([
        ['dp_annual_income > 50000', ['dp_annual_income']],
        ['income > 50000 and age >= 18', ['income', 'age']],
        ['`income` > 1', ['income']],
        ['[a, b, a]', ['a', 'b']],
        ['{ "key": a }', ['a']],
        ['a ? b : c', ['a', 'b', 'c']],
        ['(a + b) * -c', ['a', 'b', 'c']],
        ['$sum(items.price) > limit', ['items', 'limit']],
        ['$.a > 1 and $$.b > 2', ['a', 'b']],
        ['a in ["x", "y"] or $not(b)', ['a', 'b']],
        ['a / b', ['a', 'b']],
        ['a /* b */ > 1', ['a']],
        ['( $limit := 3; a > $limit )', ['a']],
    ])('reads %s', (expression, expected) => {
        expect(datapointRefs(expression)).toEqual(expected)
    })

    it('does not read string literals', () => {
        expect(datapointRefs(`a = "b" and a != 'c \\' d'`)).toEqual(['a'])
    })

    it('does not read $variables, literals or later path steps', () => {
        expect(datapointRefs('$x > 1 and person.name = null and true')).toEqual(
            ['person'],
        )
    })

    // The context inside these is not the input document.
    it.each([
        ['addresses[city = "Berlin"]', ['addresses']],
        ['person.(first & last)', ['person']],
        ['items^(>price)', ['items']],
        ['$map(items, function($v) { $v.price * rate })', ['items']],
        ['$count($children[status = "true"]) >= 3', []],
        [
            'age >= 65 or $count($children[lexId in ["4", "5"] and status = "true"]) = 3',
            ['age'],
        ],
        ['dp_persons.{ "n": dp_name }', ['dp_persons']],
        ['dp_persons.[dp_name]', ['dp_persons']],
        ['dp_persons.$uppercase(dp_name)', ['dp_persons']],
        ['dp_persons.address.$f(dp_name)', ['dp_persons']],
        ['dp_persons{ dp_name: dp_age }', ['dp_persons']],
        ['dp_persons.$.dp_name', ['dp_persons']],
        ['$f(dp_persons)[dp_age > 18]', ['dp_persons']],
        ['λ($v){ $v }', []],
        ['$map([dp_a], function($v)<n:n>{ $v > 1 })[0]', ['dp_a']],
        ['$map(dp_a, λ($f) <f<n:n>:n> { $f(n) })', ['dp_a']],
    ])('does not read names of another context: %s', (expression, expected) => {
        expect(datapointRefs(expression)).toEqual(expected)
    })

    // Reported by the exact check in `./query` only.
    it.each([
        ['$map(items, function($v) { rate })', ['items']],
        ['persons@$p.limit', ['persons']],
        ['persons[age > $$.limit]', ['persons', 'limit']],
        ['function($x)<n:n>{ $x * 2 }(dp_a) > 1', []],
    ])('reports only what is certain: %s', (expression, expected) => {
        expect(datapointRefs(expression)).toEqual(expected)
    })

    it.each([
        ['a regex literal', '$match(a, /b(c/d)e/) and missing'],
        ['a transform', 'a ~> |b|{ "c": d }|'],
        ['an unclosed bracket', '(a > 1'],
        ['a stray closing bracket', 'a > 1) and b'],
        ['mismatched brackets', '[a > 1)'],
        ['an unclosed string', 'a = "b'],
        ['an unclosed comment', 'a /* b'],
        ['an unclosed signature', 'function($x)<n:n { $x }(a)'],
    ])('reports nothing for %s', (_label, expression) => {
        expect(datapointRefs(expression)).toEqual([])
    })
})

describe('unknownDatapointRefs', () => {
    it('reports each undeclared id once', () => {
        expect(
            unknownDatapointRefs(
                'dp_a > dp_b and dp_b < dp_c',
                new Set(['dp_a']),
            ),
        ).toEqual(['dp_b', 'dp_c'])
    })

    it('has nothing to report when every reference is declared', () => {
        expect(unknownDatapointRefs('dp_a > 1', new Set(['dp_a']))).toEqual([])
    })

    it('reports ids without the dp_ prefix', () => {
        expect(
            unknownDatapointRefs('income > limit', new Set(['income'])),
        ).toEqual(['limit'])
    })

    it('reports a name that cannot be a datapoint id', () => {
        expect(unknownDatapointRefs('`dp-a` > Income', new Set())).toEqual([
            'dp-a',
            'Income',
        ])
    })

    it('gives the same answer on every call', () => {
        const declared = new Set<string>()
        expect(unknownDatapointRefs('dp_a', declared)).toEqual(['dp_a'])
        expect(unknownDatapointRefs('dp_a', declared)).toEqual(['dp_a'])
    })
})
