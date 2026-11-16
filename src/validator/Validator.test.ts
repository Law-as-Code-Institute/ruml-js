// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { queryDatapointRefs } from '../capabilities/query-expression'
import { type CapabilityDefinition, RumlValidator } from './Validator'
import type { RUML } from '../ruml'

// Adapted from the example at https://example.org/ruml/de/example/.
// Two fixes make it schema-valid: `children` reference lexical ids as STRINGS
// (LexId is `^[1-9][0-9]*$`, matching the string node keys), and the
// `metadata.documentType` key is dropped — it is spec-valid, but the spec is
// not yet fully implemented for metadata so MetadataSchema (strict) rejects it.
export const validDoc: RUML = {
    $format: 'RUML',
    $specVersion: '1.0',
    metadata: {
        id: 'ec36948d-fbb2-4815-985a-bd5e9375d934',
        version: '1.0.0',
        created: '2024-01-01T12:00:00+01:00',
        modified: '2024-01-15T14:30:00+01:00',
        status: 'draft',
        title: 'Credit Approval',
    },
    rulemap: {
        nodes: {
            '1': {
                id: '0eb360a6-626a-406d-89a1-9f434ced141b',
                operator: 'AND',
                label: 'Approve credit?',
                children: ['2', '7'],
            },
            '2': {
                id: '6840b48d-117f-474e-ae4e-337b8e60537c',
                operator: 'OR',
                label: 'Income verification',
                children: ['3', '4'],
            },
            '3': {
                id: '9ddd08c6-a6d3-4f0f-9bb9-1adbe33b6e10',
                operator: 'undefined',
                label: 'High income',
            },
            '4': {
                id: 'e07fe192-121b-43eb-90f0-eca4573ba8fa',
                operator: 'AND',
                label: 'Medium income + collateral',
                children: ['5', '6'],
            },
            '5': {
                id: 'fcf02185-ffee-48a4-bf93-d2fb1b17944d',
                operator: 'undefined',
                label: 'Medium income',
            },
            '6': {
                id: '4a9f0fc7-c802-489e-8ae2-3596ba584fd9',
                operator: 'undefined',
                label: 'Collateral available',
            },
            '7': {
                id: '043fdfce-d617-4a76-af40-e02de43c07b8',
                operator: 'NOT_AND',
                label: 'No negative indicators',
                children: ['8', '9'],
            },
            '8': {
                id: '38f26fa1-17a5-4e38-9054-3147e3158a41',
                operator: 'undefined',
                label: 'Insolvency present',
            },
            '9': {
                id: '7baae662-0b5c-44bb-9a2b-802074fe5d0f',
                operator: 'undefined',
                label: 'Negative SCHUFA entry',
            },
        },
    },
}

// Our internal node-level capability. Lives at its owner (packages/engine);
// inlined here so ruml stays namespace-agnostic and the test has no engine dep.
const docWithWarning = {
    ...validDoc,
    capabilities: [{ id: 'ruml:actions', required: false }],
    rulemap: {
        nodes: {
            '1': {
                id: 'b1a7d2c4-1f3e-4a9b-8c6d-2e5f7a9b0c1d',
                operator: 'AND',
                label: 'A leaf with dead handlers',
                capabilities: [
                    {
                        id: 'ruml:actions',
                        payload: {
                            onTrue: {
                                operation: 'createDocument',
                                ref: 'document-service',
                            },
                        },
                    },
                ],
            },
        },
    },
}

const EngineCapability: CapabilityDefinition = {
    id: 'com.rulemapping/engine',
    nodeValueSchema: z.object({
        color: z.string().optional(),
        explanation: z.string().max(10_000).optional(),
    }),
}

describe('RumlValidator', () => {
    describe('validate structure', () => {
        it('accepts a valid document', () => {
            expect(new RumlValidator().validate(validDoc)).toEqual({
                valid: true,
            })
        })
    })

    describe('error issues', () => {
        it('reports the bare message and a dotted path', () => {
            const invalidDoc = {
                ...validDoc,
                metadata: { ...validDoc.metadata, status: 'review' },
            }

            const result = new RumlValidator().validate(invalidDoc)

            if (result.valid) throw new Error('expected validation to fail')
            expect(result.errors).toContainEqual({
                message: '/rulemap/nodes/3/operator must NOT be valid',
                path: 'rulemap.nodes.3.operator',
            })
        })
    })

    describe('warnings', () => {
        it('surfaces non-fatal warnings on an otherwise valid doc', () => {
            const result = new RumlValidator().validate(docWithWarning)

            if (!result.valid) throw new Error('expected validation to pass')
            expect(result.warnings).toContainEqual({
                message:
                    'leaf node with ruml:actions but no decision capability (ruml:query, ruml:ai-query, ruml:tree-include) has onTrue/onFalse handlers that can never fire — its status is always undefined (only onUndefined fires)',
                path: 'rulemap.nodes',
            })
        })
    })

    describe('external capabilities', () => {
        const docWithEngineNode = (engineValue: unknown) => ({
            ...validDoc,
            capabilities: [
                { id: 'com.rulemapping/engine', required: false, role: 'data' },
            ],
            rulemap: {
                nodes: {
                    '1': {
                        id: '0eb360a6-626a-406d-89a1-9f434ced141b',
                        operator: 'undefined',
                        label: 'Leaf with engine data',
                        capabilities: [
                            {
                                id: 'com.rulemapping/engine',
                                payload: engineValue,
                            },
                        ],
                    },
                },
            },
        })

        it('validates an injected node capability value', () => {
            const validator = new RumlValidator({
                supportedCapabilities: [EngineCapability],
            })
            expect(
                validator.validate(
                    docWithEngineNode({ color: '#ff0000', explanation: 'ok' }),
                ),
            ).toEqual({ valid: true })
        })

        it('accepts a node-only capability declared required at root', () => {
            // EngineCapability is typed only on nodes, but it's still known —
            // so requiring it at the root is fine, not "unregistered".
            const validator = new RumlValidator({
                supportedCapabilities: [EngineCapability],
            })
            expect(
                validator.validate({
                    ...docWithEngineNode({ color: '#ff0000' }),
                    capabilities: [
                        {
                            id: 'com.rulemapping/engine',
                            required: true,
                            role: 'data',
                        },
                    ],
                }),
            ).toEqual({ valid: true })
        })

        it('rejects a value that violates the injected schema', () => {
            const validator = new RumlValidator({
                supportedCapabilities: [EngineCapability],
            })
            const result = validator.validate(
                docWithEngineNode({ explanation: 'x'.repeat(10_001) }),
            )

            if (result.valid) throw new Error('expected validation to fail')
            expect(result.errors.map((error) => error.path)).toContain(
                'rulemap.nodes.1.capabilities.0.payload.explanation',
            )
        })

        it('supports non-string capability values (object/number/array)', () => {
            const RiskCapability: CapabilityDefinition = {
                id: 'com.example/risk',
                nodeValueSchema: z.object({
                    score: z.number().min(0).max(100),
                    factors: z.array(z.string()),
                }),
            }
            const validator = new RumlValidator({
                supportedCapabilities: [RiskCapability],
            })
            const doc = {
                ...validDoc,
                capabilities: [
                    { id: 'com.example/risk', required: false, role: 'data' },
                ],
                rulemap: {
                    nodes: {
                        '1': {
                            id: '0eb360a6-626a-406d-89a1-9f434ced141b',
                            operator: 'undefined',
                            label: 'Leaf with risk score',
                            capabilities: [
                                {
                                    id: 'com.example/risk',
                                    payload: {
                                        score: 42,
                                        factors: ['income', 'history'],
                                    },
                                },
                            ],
                        },
                    },
                },
            }
            expect(validator.validate(doc)).toEqual({ valid: true })
        })
    })

    describe('expressionReads (DP-18)', () => {
        const docWithQuery = (expression: string) => ({
            ...validDoc,
            capabilities: [
                {
                    id: 'ruml:datapoints',
                    payload: {
                        data: {
                            items: {
                                name: 'Items',
                                type: 'number',
                                binding: { type: 'input' },
                            },
                        },
                    },
                },
                { id: 'ruml:query' },
            ],
            rulemap: {
                nodes: {
                    '1': {
                        id: '0eb360a6-626a-406d-89a1-9f434ced141b',
                        label: 'Leaf with a query',
                        capabilities: [
                            { id: 'ruml:query', payload: { expression } },
                        ],
                    },
                },
            },
        })
        const scanning = new RumlValidator()
        const exact = new RumlValidator({ expressionReads: queryDatapointRefs })
        const issue = (name: string) => ({
            path: 'rulemap.nodes.1.capabilities.0.payload.expression',
            message: `the expression reads a datapoint not declared in ruml:datapoints: ${name}`,
        })

        // Names the text scan does not see.
        it.each([
            ['a function body', '$sum($map(items, function($v) { rate })) > 0'],
            ['an expression with a regex literal', '$match(rate, /a(b/c)/)'],
        ])('checks %s only with the option', (_label, expression) => {
            const doc = docWithQuery(expression)
            expect(scanning.validate(doc)).toEqual({ valid: true })
            expect(exact.validate(doc)).toEqual({
                valid: false,
                errors: [issue('rate')],
            })
        })

        it('reports the same issue either way where the scan is certain', () => {
            const doc = docWithQuery('items > rate')
            const expected = { valid: false, errors: [issue('rate')] }
            expect(scanning.validate(doc)).toEqual(expected)
            expect(exact.validate(doc)).toEqual(expected)
        })

        it('accepts declared reads and fields read per item', () => {
            const doc = docWithQuery('$count(items[price > 1].{ "p": price })')
            expect(scanning.validate(doc)).toEqual({ valid: true })
            expect(exact.validate(doc)).toEqual({ valid: true })
        })

        it.each([
            'function($x)<n:n>{ $x * 2 }(items) > 1',
            '$map([items], function($v)<n:n>{ $v > 1 })[0]',
        ])('does not read a lambda signature: %s', (expression) => {
            const doc = docWithQuery(expression)
            expect(scanning.validate(doc)).toEqual({ valid: true })
            expect(exact.validate(doc)).toEqual({ valid: true })
        })
    })

    describe('unknown capabilities', () => {
        const docWithRootCapability = (
            id: string,
            value: Record<string, unknown>,
        ) => ({
            ...validDoc,
            capabilities: [{ id, ...value }],
        })

        it('accepts an unregistered reverse-domain capability that is not required', () => {
            const result = new RumlValidator().validate(
                docWithRootCapability('com.example/unknown', {
                    required: false,
                    role: 'data',
                }),
            )
            expect(result).toEqual({ valid: true })
        })

        it('rejects a reverse-domain capability without a role (CAP-03)', () => {
            const result = new RumlValidator().validate(
                docWithRootCapability('com.example/unknown', {
                    required: false,
                }),
            )
            expect(result.valid).toBe(false)
        })

        it('rejects a role on an official capability (CAP-05)', () => {
            const result = new RumlValidator().validate(
                docWithRootCapability('ruml:actions', { role: 'reaction' }),
            )
            expect(result.valid).toBe(false)
        })

        it('rejects the former roles list', () => {
            const result = new RumlValidator().validate(
                docWithRootCapability('com.example/unknown', {
                    role: 'data',
                    roles: ['data'],
                }),
            )
            expect(result.valid).toBe(false)
        })

        it('rejects an unregistered reverse-domain capability declared required', () => {
            const result = new RumlValidator().validate(
                docWithRootCapability('com.example/unknown', {
                    required: true,
                    role: 'data',
                }),
            )

            if (result.valid) throw new Error('expected validation to fail')
            expect(result.errors).toContainEqual({
                message:
                    'capability "com.example/unknown" is declared "required: true" but no schema is registered to validate its value',
                path: 'capabilities.0',
            })
        })

        it.each(['ruml:draft/foo', 'ruml:draft/a/b', 'com.my_co/foo'])(
            'rejects an unregistered %s declared required (CAP-01)',
            (id) => {
                const result = new RumlValidator().validate(
                    docWithRootCapability(id, { required: true, role: 'data' }),
                )

                if (result.valid) throw new Error('expected validation to fail')
                expect(result.errors).toContainEqual({
                    message: `capability "${id}" is declared "required: true" but no schema is registered to validate its value`,
                    path: 'capabilities.0',
                })
            },
        )

        it('accepts an unregistered ruml:draft/ capability that is not required', () => {
            expect(
                new RumlValidator().validate(
                    docWithRootCapability('ruml:draft/scoring', {
                        required: false,
                        role: 'data',
                    }),
                ),
            ).toEqual({ valid: true })
        })

        it('rejects an unknown ruml: capability id outright', () => {
            const result = new RumlValidator().validate(
                docWithRootCapability('ruml:not-a-real-capability', {
                    required: false,
                }),
            )
            expect(result.valid).toBe(false)
        })
    })

    describe('reserved namespace guard', () => {
        it('throws when a supplied capability uses the reserved ruml: prefix', () => {
            expect(
                () =>
                    new RumlValidator({
                        supportedCapabilities: [
                            { id: 'ruml:datapoints', rootValueSchema: z.any() },
                        ],
                    }),
            ).toThrow(/reserved "ruml:" prefix/)
        })
    })

    describe('safeParse', () => {
        it('parses a valid document', () => {
            const result = new RumlValidator().safeParse(validDoc)

            expect(result.success).toBe(true)
            if (!result.success)
                throw new Error('expected safeParse to succeed')
            expect(result.warnings).toBeUndefined()
            // Parsing fills declared defaults, so every node gains the
            // `decisionMode` the schema declares.
            expect(result.data).toEqual({
                ...validDoc,
                rulemap: {
                    ...validDoc.rulemap,
                    nodes: Object.fromEntries(
                        Object.entries(validDoc.rulemap.nodes).map(
                            ([lexId, node]) => [
                                lexId,
                                { decisionMode: 'fallback', ...node },
                            ],
                        ),
                    ),
                },
            })
        })

        it('parses with warnings', () => {
            const result = new RumlValidator().safeParse(docWithWarning)

            expect(result.success).toBe(true)
            if (!result.success)
                throw new Error('expected safeParse to succeed')
            expect(result.warnings).toEqual([
                {
                    message: expect.stringContaining(
                        'node with ruml:actions',
                    ) as string,
                    path: 'rulemap.nodes',
                },
            ])
        })

        it('parses with errors', () => {
            const invalidDoc = {
                ...validDoc,
                metadata: { ...validDoc.metadata, status: 'review' },
            }

            const result = new RumlValidator().safeParse(invalidDoc)

            expect(result.success).toBe(false)
            if (result.success) throw new Error('expected safeParse to fail')
            // Each leaf breaks two rules: operator 'undefined' outside a draft
            // (OP-07) and an operator on a leaf outside a draft (NODE-07).
            const leaves = ['3', '5', '6', '8', '9']
            const errorsWith = (text: string) =>
                leaves.map((lexId) => ({
                    message: `/rulemap/nodes/${lexId}/operator ${text}`,
                    path: `rulemap.nodes.${lexId}.operator`,
                }))
            expect(result.errors).toEqual([
                ...errorsWith('must NOT be valid'),
                ...errorsWith('boolean schema is false'),
            ])
        })
    })
})
