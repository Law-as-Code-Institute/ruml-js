// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import { rumlResultJsonSchemaDocument } from '../conversion/from-json-schema'
import { EVALUATION_MODE, NODE_STATUS, UNDEFINED_REASON } from '../constants'
import {
    EvaluationModeSchema,
    NodeResultSchema,
    NodeResultStatusSchema,
    RUMLResultSchema,
    UndefinedReasonSchema,
} from './result'

// The canonical example from the RUML-Result spec (docs/05-result-format).
const validResult = {
    $format: 'RUML-Result',
    $specVersion: '1.0',
    rumlReference: {
        id: 'ec36948d-fbb2-4815-985a-bd5e9375d934',
    },
    evaluation: {
        id: 'e7a1c2d3-fbb2-4815-985a-bd5e9375d934',
        timestamp: '2024-01-15T10:00:00Z',
        mode: 'optimized',
        caseId: 'Antrag-2024-00456',
        capabilities: [
            { id: 'ruml:datapoints' },
            { id: 'ruml:query' },
            { id: 'ruml:actions' },
        ],
        results: {
            '1': {
                lexId: '1',
                status: 'true',
                evaluatedAt: '2024-01-15T10:00:04Z',
                reason: 'Alle Voraussetzungen erfüllt (AND: alle Kinder true)',
            },
            '1.1': {
                lexId: '2',
                status: 'true',
                evaluatedAt: '2024-01-15T10:00:01Z',
                reason: 'Alter 25 >= 18',
                capabilities: [
                    {
                        id: 'ruml:query',
                        payload: {
                            expression: 'dp_age >= 18',
                            inputs: { dp_age: 25 },
                            result: 'true',
                        },
                    },
                ],
            },
            '1.2': {
                lexId: '3',
                status: 'true',
                evaluatedAt: '2024-01-15T10:00:02Z',
                reason: 'OR erfüllt: Einkommen unter Grenze',
            },
            '1.2.1': {
                lexId: '4',
                status: 'true',
                evaluatedAt: '2024-01-15T10:00:02Z',
                reason: 'Einkommen 35000 <= 40000',
                capabilities: [
                    {
                        id: 'ruml:query',
                        payload: {
                            expression: 'dp_income <= 40000',
                            inputs: { dp_income: 35000 },
                            result: 'true',
                        },
                    },
                ],
            },
            '1.2.2': {
                lexId: '5',
                status: 'ignored',
                reason: {
                    type: 'shortCircuit',
                    trigger: 'Knoten 1.2.1 (lexId: 4) wurde true',
                    operator: 'XOR',
                    mode: 'optimized',
                },
            },
            '1.3': {
                lexId: '6',
                status: 'true',
                evaluatedAt: '2024-01-15T10:00:03Z',
                reason: 'Wohnsitz BY == BY',
                capabilities: [
                    {
                        id: 'ruml:query',
                        payload: {
                            expression: 'dp_state = "BY"',
                            inputs: { dp_state: 'BY' },
                            result: 'true',
                        },
                    },
                ],
            },
        },
    },
}

describe('RUMLResultSchema', () => {
    it('accepts the canonical spec example', () => {
        const result = RUMLResultSchema.safeParse(validResult)
        expect(result.success).toBe(true)
    })

    it('rejects a wrong $format', () => {
        const result = RUMLResultSchema.safeParse({
            ...validResult,
            $format: 'RUML',
        })
        expect(result.success).toBe(false)
    })

    it('rejects an unknown node-result status', () => {
        const result = RUMLResultSchema.safeParse({
            ...validResult,
            evaluation: {
                ...validResult.evaluation,
                results: {
                    '1': { lexId: '1', status: 'pending', reason: 'because' },
                },
            },
        })
        expect(result.success).toBe(false)
    })

    const ignoredReason = {
        type: 'shortCircuit',
        trigger: 'x',
        operator: 'AND',
        mode: 'optimized',
    }
    const undefinedReason = { type: 'error', message: 'datapoint missing' }

    const withNodeResult = (nodeResult: Record<string, unknown>) =>
        RUMLResultSchema.safeParse({
            ...validResult,
            evaluation: {
                ...validResult.evaluation,
                results: { '1': { lexId: '1', ...nodeResult } },
            },
        })

    it.each([
        ['true', 'because'],
        ['false', 'because'],
        ['undefined', undefinedReason],
        ['undefined', { type: 'default', message: 'no decision capability' }],
        ['ignored', ignoredReason],
    ])('accepts status %s with its reason', (status, reason) => {
        expect(withNodeResult({ status, reason }).success).toBe(true)
    })

    it.each(['true', 'false', 'undefined', 'ignored'])(
        'requires reason when status is %s',
        (status) => {
            expect(withNodeResult({ status }).success).toBe(false)
        },
    )

    it.each([
        ['true', ignoredReason],
        ['false', undefinedReason],
        ['undefined', 'because'],
        ['undefined', ignoredReason],
        ['ignored', 'because'],
        ['ignored', undefinedReason],
    ])(
        'rejects status %s with the reason of another status',
        (status, reason) => {
            expect(withNodeResult({ status, reason }).success).toBe(false)
        },
    )

    it('rejects the former ignoredReason field', () => {
        expect(
            withNodeResult({
                status: 'ignored',
                reason: ignoredReason,
                ignoredReason,
            }).success,
        ).toBe(false)
        expect(
            withNodeResult({ status: 'true', reason: 'because', ignoredReason })
                .success,
        ).toBe(false)
    })

    it.each([
        ['an unknown type', { type: 'timeout', message: 'x' }],
        ['a missing message', { type: 'error' }],
        ['an empty message', { type: 'error', message: '' }],
        ['an unknown field', { ...undefinedReason, code: 1 }],
    ])('rejects an undefined reason with %s', (_label, reason) => {
        expect(withNodeResult({ status: 'undefined', reason }).success).toBe(
            false,
        )
    })

    it.each(['interactive', 'partial'])(
        'rejects the former evaluation mode %s',
        (mode) => {
            const result = RUMLResultSchema.safeParse({
                ...validResult,
                evaluation: { ...validResult.evaluation, mode },
            })
            expect(result.success).toBe(false)
        },
    )

    it('rejects a malformed results key (not a lex-path)', () => {
        const result = RUMLResultSchema.safeParse({
            ...validResult,
            evaluation: {
                ...validResult.evaluation,
                results: {
                    '1.': { lexId: '1', status: 'true', reason: 'because' },
                },
            },
        })
        expect(result.success).toBe(false)
    })

    it('rejects a numeric lexId (lexId is string-typed)', () => {
        const result = RUMLResultSchema.safeParse({
            ...validResult,
            evaluation: {
                ...validResult.evaluation,
                results: {
                    '1': { lexId: 1, status: 'true', reason: 'because' },
                },
            },
        })
        expect(result.success).toBe(false)
    })

    it('rejects a lexId with a leading zero', () => {
        const result = RUMLResultSchema.safeParse({
            ...validResult,
            evaluation: {
                ...validResult.evaluation,
                results: {
                    '1': { lexId: '01', status: 'true', reason: 'because' },
                },
            },
        })
        expect(result.success).toBe(false)
    })

    it('rejects a malformed rumlReference hash', () => {
        const result = RUMLResultSchema.safeParse({
            ...validResult,
            rumlReference: { ...validResult.rumlReference, hash: 'not-a-hash' },
        })
        expect(result.success).toBe(false)
    })

    it('rejects a ruml:query result value missing result', () => {
        const result = RUMLResultSchema.safeParse({
            ...validResult,
            evaluation: {
                ...validResult.evaluation,
                results: {
                    '1': {
                        lexId: '1',
                        status: 'true',
                        reason: 'because',
                        capabilities: [
                            {
                                id: 'ruml:query',
                                payload: {
                                    expression: 'dp_age >= 18',
                                    inputs: { dp_age: 25 },
                                },
                            },
                        ],
                    },
                },
            },
        })
        expect(result.success).toBe(false)
    })

    it('accepts every IGNORED_REASON type', () => {
        for (const type of [
            'shortCircuit',
            'manualSkip',
            'conditionalDeactivation',
        ]) {
            const result = RUMLResultSchema.safeParse({
                ...validResult,
                evaluation: {
                    ...validResult.evaluation,
                    results: {
                        '1': {
                            lexId: '1',
                            status: 'ignored',
                            reason: {
                                type,
                                trigger: 'x',
                                operator: 'AND',
                                mode: 'optimized',
                            },
                        },
                    },
                },
            })
            expect(result.success).toBe(true)
        }
    })

    // §5.0: OR, NOT_OR and DELEGATED never short-circuit.
    it.each([
        ['shortCircuit', 'OR', false],
        ['shortCircuit', 'NOT_OR', false],
        ['shortCircuit', 'DELEGATED', false],
        ['shortCircuit', 'NOT_XOR', true],
        ['manualSkip', 'OR', true],
        ['conditionalDeactivation', 'DELEGATED', true],
    ])(
        'ignored reason %s with operator %s: valid = %s',
        (type, operator, valid) => {
            const reason = { ...ignoredReason, type, operator }
            expect(withNodeResult({ status: 'ignored', reason }).success).toBe(
                valid,
            )
        },
    )

    it('rejects an unknown ignored reason type', () => {
        const result = RUMLResultSchema.safeParse({
            ...validResult,
            evaluation: {
                ...validResult.evaluation,
                results: {
                    '1': {
                        lexId: '1',
                        status: 'ignored',
                        reason: {
                            type: 'somethingElse',
                            trigger: 'x',
                            operator: 'OR',
                            mode: 'optimized',
                        },
                    },
                },
            },
        })
        expect(result.success).toBe(false)
    })

    it('accepts the optional evaluation metadata fields', () => {
        const result = RUMLResultSchema.safeParse({
            ...validResult,
            evaluation: {
                ...validResult.evaluation,
                userId: 'user-1',
                toolId: 'tool-1',
                toolVersion: '1.2.3',
                startTimestamp: '2024-01-15T09:59:00Z',
            },
        })
        expect(result.success).toBe(true)
    })

    it('accepts an evaluation without caseId or capabilities (both optional)', () => {
        const {
            caseId: _caseId,
            capabilities: _capabilities,
            ...evaluation
        } = validResult.evaluation
        const result = RUMLResultSchema.safeParse({
            ...validResult,
            evaluation,
        })
        expect(result.success).toBe(true)
    })

    describe('evaluation capabilities', () => {
        const withCapabilities = (capabilities: unknown) =>
            RUMLResultSchema.safeParse({
                ...validResult,
                evaluation: { ...validResult.evaluation, capabilities },
            })

        const event = {
            specversion: '1.0',
            id: 'evt-1',
            source: 'urn:ruml:engine',
            type: 'ruml.node.evaluated',
            time: '2024-01-15T10:00:01Z',
            subject: '1.1',
            data: { status: 'true' },
        }

        it('rejects the id-keyed object form', () => {
            expect(withCapabilities({ 'ruml:query': {} }).success).toBe(false)
        })

        it('rejects an entry without an id', () => {
            expect(withCapabilities([{ payload: {} }]).success).toBe(false)
        })

        it('rejects an unknown entry field', () => {
            expect(
                withCapabilities([{ id: 'ruml:query', required: true }])
                    .success,
            ).toBe(false)
        })

        it('accepts a ruml:protocol payload of CloudEvents', () => {
            expect(
                withCapabilities([
                    {
                        id: 'ruml:protocol',
                        payload: { level: 'verbose', events: [event] },
                    },
                ]).success,
            ).toBe(true)
        })

        it('accepts a custom, non-ruml. event type', () => {
            expect(
                withCapabilities([
                    {
                        id: 'ruml:protocol',
                        payload: {
                            events: [{ ...event, type: 'com.acme.audit' }],
                        },
                    },
                ]).success,
            ).toBe(true)
        })

        it('rejects an unknown ruml. event type', () => {
            expect(
                withCapabilities([
                    {
                        id: 'ruml:protocol',
                        payload: {
                            events: [{ ...event, type: 'ruml.node.unknown' }],
                        },
                    },
                ]).success,
            ).toBe(false)
        })

        it.each(['specversion', 'id', 'source', 'type', 'time'])(
            'rejects an event without %s',
            (field) => {
                const { [field as keyof typeof event]: _omit, ...rest } = event
                expect(
                    withCapabilities([
                        { id: 'ruml:protocol', payload: { events: [rest] } },
                    ]).success,
                ).toBe(false)
            },
        )

        it('rejects a ruml:protocol payload without events', () => {
            expect(
                withCapabilities([
                    { id: 'ruml:protocol', payload: { level: 'standard' } },
                ]).success,
            ).toBe(false)
        })

        it('accepts any payload for a third-party capability', () => {
            expect(
                withCapabilities([
                    { id: 'com.acme/scored', payload: { score: 0.9 } },
                ]).success,
            ).toBe(true)
        })
    })
})

describe('NodeResultSchema', () => {
    const issuePaths = (value: unknown) => {
        const result = NodeResultSchema.safeParse(value)
        return result.success
            ? undefined
            : result.error.issues.map((issue) => issue.path.join('.'))
    }

    it('accepts each status with its reason', () => {
        expect(
            issuePaths({ lexId: '1', status: 'true', reason: 'because' }),
        ).toBeUndefined()
        expect(
            issuePaths({
                lexId: '1',
                status: 'undefined',
                reason: { type: 'default', message: 'no decision capability' },
            }),
        ).toBeUndefined()
    })

    it('reports only the selected variant, on the failing field', () => {
        expect(issuePaths({ lexId: '1', status: 'true' })).toEqual(['reason'])
        expect(
            issuePaths({ lexId: '1', status: 'undefined', reason: 'because' }),
        ).toEqual(['reason'])
        expect(
            issuePaths({ lexId: '1', status: 'pending', reason: 'because' }),
        ).toEqual(['status'])
    })

    it('rejects an unknown field', () => {
        expect(
            issuePaths({
                lexId: '1',
                status: 'true',
                reason: 'because',
                ignoredReason: {},
            }),
        ).toBeDefined()
    })
})

describe('result enums', () => {
    it('NodeResultStatusSchema lists the four statuses', () => {
        expect(NodeResultStatusSchema.options).toEqual([...NODE_STATUS])
        expect(NodeResultStatusSchema.safeParse('pending').success).toBe(false)
    })

    it('EvaluationModeSchema matches EVALUATION_MODE', () => {
        expect(EvaluationModeSchema.options).toEqual([...EVALUATION_MODE])
    })

    it('UndefinedReasonSchema accepts every UNDEFINED_REASON type', () => {
        for (const type of UNDEFINED_REASON) {
            expect(
                UndefinedReasonSchema.safeParse({ type, message: 'm' }).success,
            ).toBe(true)
        }
    })
})

describe('the ruml-result JSON Schema artifact', () => {
    const schema = rumlResultJsonSchemaDocument
    const defs = (schema as { $defs?: Record<string, unknown> }).$defs ?? {}
    const ajv = new Ajv2020({ strict: false })
    addFormats(ajv)
    const validate = ajv.compile(schema)

    it('carries the RUML-Result metadata', () => {
        expect(schema.$schema).toBe(
            'https://json-schema.org/draft/2020-12/schema',
        )
        expect(schema['x-ruml-format']).toBe('RUML-Result')
        expect(schema['x-ruml-spec-version']).toBe('1.0')
    })

    it('lifts referenced named schemas into $defs', () => {
        expect(defs).toHaveProperty('Uuid')
        expect(defs).toHaveProperty('Timestamp')
        expect(defs).toHaveProperty('Evaluation')
        expect(defs).toHaveProperty('NodeResult')
        expect(defs).toHaveProperty('TrueResult')
        expect(defs).toHaveProperty('FalseResult')
        expect(defs).toHaveProperty('UndefinedResult')
        expect(defs).toHaveProperty('IgnoredResult')
        expect(defs).toHaveProperty('IgnoredReason')
        expect(defs).toHaveProperty('UndefinedReason')
        expect(defs).toHaveProperty('ResultNodeCapabilities')
        expect(defs).toHaveProperty('CapabilityQueryResult')
    })

    it('accepts the canonical spec example', () => {
        expect(validate(validResult)).toBe(true)
    })

    it('rejects a ruml:query result value missing result (typed mirror)', () => {
        const doc = {
            ...validResult,
            evaluation: {
                ...validResult.evaluation,
                results: {
                    '1': {
                        lexId: '1',
                        status: 'true',
                        reason: 'because',
                        capabilities: [
                            {
                                id: 'ruml:query',
                                payload: {
                                    expression: 'dp_age >= 18',
                                    inputs: { dp_age: 25 },
                                },
                            },
                        ],
                    },
                },
            },
        }
        expect(validate(doc)).toBe(false)
    })

    it('rejects id-keyed evaluation capabilities', () => {
        const doc = {
            ...validResult,
            evaluation: {
                ...validResult.evaluation,
                capabilities: { 'ruml:query': {} },
            },
        }
        expect(validate(doc)).toBe(false)
    })

    it('accepts an arbitrary JSON value for an unregistered capability', () => {
        const doc = {
            ...validResult,
            evaluation: {
                ...validResult.evaluation,
                results: {
                    '1': {
                        lexId: '1',
                        status: 'true',
                        reason: 'because',
                        capabilities: [
                            {
                                id: 'com.acme/scored',
                                payload: { score: 0.9 },
                            },
                        ],
                    },
                },
            },
        }
        expect(validate(doc)).toBe(true)
    })
})
