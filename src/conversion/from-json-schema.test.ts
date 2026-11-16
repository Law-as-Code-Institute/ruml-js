// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import {
    ajvIssueReporter,
    rumlJsonSchemaDocument,
    zodFromJsonSchema,
} from './from-json-schema'
import { RUMLSchema, capabilityPayload, findCapability } from '../index'

const validDoc = {
    $format: 'RUML',
    $specVersion: '1.0',
    metadata: {
        id: 'ec36948d-fbb2-4815-985a-bd5e9375d934',
        version: '1.0.0',
        created: '2024-01-01T00:00:00Z',
        modified: '2024-01-01T00:00:00Z',
        status: 'draft',
    },
    rulemap: {
        nodes: {
            '1': {
                id: 'ec36948d-fbb2-4815-985a-bd5e9375d934',
                operator: 'AND',
                label: 'Wurzel',
            },
        },
    },
}

const doc = (extra: Record<string, unknown> = {}) => ({ ...validDoc, ...extra })

describe('structural layer', () => {
    it('accepts a minimal valid document', () => {
        expect(RUMLSchema.safeParse(validDoc).success).toBe(true)
    })

    it('rejects an unknown root key', () => {
        expect(RUMLSchema.safeParse(doc({ nope: 1 })).success).toBe(false)
    })

    it('rejects a lexId that is not a positive integer string', () => {
        const bad = doc({
            rulemap: { nodes: { '01': validDoc.rulemap.nodes['1'] } },
        })
        expect(RUMLSchema.safeParse(bad).success).toBe(false)
    })
})

describe('fidelity layer (AJV)', () => {
    it('enforces a conditional the structural layer cannot express', () => {
        // §4.8: a node carrying ruml:query must be a leaf.
        const parent = doc({
            capabilities: [{ id: 'ruml:query' }],
            rulemap: {
                nodes: {
                    '1': {
                        ...validDoc.rulemap.nodes['1'],
                        children: ['2'],
                        capabilities: [
                            {
                                id: 'ruml:query',
                                payload: { expression: 'true' },
                            },
                        ],
                    },
                    '2': {
                        id: 'aa36948d-fbb2-4815-985a-bd5e9375d934',
                        operator: 'AND',
                        label: 'Kind',
                    },
                },
            },
        })
        expect(RUMLSchema.safeParse(parent).success).toBe(false)
    })

    it('reports a missing required field on the field, not the parent', () => {
        const report = ajvIssueReporter(rumlJsonSchemaDocument)
        const issues = report({ ...validDoc, metadata: { version: '1.0.0' } })
        const paths = issues.map((i) => (i.path ?? []).join('/'))
        expect(paths).toContain('metadata/id')
    })

    // A constraint `allOf` used to be converted to a Zod intersection, whose
    // members merged into conflicting results as soon as an optional key was
    // present but `undefined` — throwing instead of reporting an issue.
    it('reports an issue rather than throwing on an explicit undefined', () => {
        const withUndefined = doc({
            rulemap: {
                nodes: {
                    '1': {
                        ...validDoc.rulemap.nodes['1'],
                        decisionMode: undefined,
                    },
                },
            },
        })
        expect(() => RUMLSchema.safeParse(withUndefined)).not.toThrow()
        expect(RUMLSchema.safeParse(withUndefined).success).toBe(true)
    })

    it('still enforces that a node with children declares an operator', () => {
        const noOperator = doc({
            rulemap: {
                nodes: {
                    '1': {
                        id: 'ec36948d-fbb2-4815-985a-bd5e9375d934',
                        label: 'Wurzel',
                        children: ['2'],
                    },
                    '2': {
                        id: 'aa36948d-fbb2-4815-985a-bd5e9375d934',
                        operator: 'AND',
                        label: 'Kind',
                    },
                },
            },
        })
        expect(RUMLSchema.safeParse(noOperator).success).toBe(false)
    })

    it('omitting the check yields a composable schema', () => {
        const composable = zodFromJsonSchema(rumlJsonSchemaDocument, {
            fidelityCheck: false,
        })
        expect(
            () => (composable as never as { shape: unknown }).shape,
        ).not.toThrow()
    })
})

describe('defaults', () => {
    it("fills a capability's required with false", () => {
        const parsed = RUMLSchema.parse(
            doc({ capabilities: [{ id: 'ruml:query' }] }),
        )
        expect(findCapability(parsed.capabilities, 'ruml:query')).toMatchObject(
            { required: false },
        )
    })

    it('fills declared defaults on a nested datapoint', () => {
        const parsed = RUMLSchema.parse(
            doc({
                capabilities: [
                    {
                        id: 'ruml:datapoints',
                        payload: {
                            data: {
                                dp_age: {
                                    name: 'Alter',
                                    type: 'integer',
                                    binding: { type: 'input' },
                                },
                            },
                        },
                    },
                ],
            }),
        )
        const dp = capabilityPayload(parsed.capabilities, 'ruml:datapoints')
            ?.data?.['dp_age']
        expect(dp).toMatchObject({ sensitive: false })
    })

    it('still enforces a required property that declares a default', () => {
        // AJV fills defaults before checking `required`, so filling must not
        // apply to required properties or the field silently becomes optional.
        const missingBinding = doc({
            capabilities: [
                {
                    id: 'ruml:datapoints',
                    payload: { data: { dp_a: { name: 'A', type: 'number' } } },
                },
            ],
        })
        const result = RUMLSchema.safeParse(missingBinding)
        expect(result.success).toBe(false)
        expect(JSON.stringify(result.error?.issues)).toContain('binding')
    })

    it('does not rewrite the caller’s document', () => {
        const input = doc({
            capabilities: [
                {
                    id: 'ruml:datapoints',
                    payload: {
                        data: {
                            dp_a: {
                                name: 'A',
                                type: 'number',
                                binding: { type: 'input' },
                            },
                        },
                    },
                },
            ],
        })
        const before = JSON.stringify(input)
        RUMLSchema.parse(input)
        expect(JSON.stringify(input)).toBe(before)
    })

    it('does not overwrite a value the document already sets', () => {
        const parsed = RUMLSchema.parse(
            doc({ capabilities: [{ id: 'ruml:query', required: true }] }),
        )
        expect(findCapability(parsed.capabilities, 'ruml:query')).toMatchObject(
            { required: true },
        )
    })
})
