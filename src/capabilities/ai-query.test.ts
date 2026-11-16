// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { CapabilityAiQueryNodeValueSchema } from './values'

// Accepts arbitrary overrides so tests can feed deliberately-invalid payloads
// (the schema, not the type system, is what we're exercising here).
const aiQuery = (overrides?: Record<string, unknown>) => ({
    model: 'a',
    ...overrides,
})

describe('CapabilityAiQueryNodeValueSchema', () => {
    it('accepts a basic valid ai query', () => {
        const result = CapabilityAiQueryNodeValueSchema.safeParse(aiQuery())
        expect(result.success).toBe(true)
    })

    it('accepts prompt and description', () => {
        const result = CapabilityAiQueryNodeValueSchema.safeParse(
            aiQuery({ prompt: 'Is it plausible?', description: 'checks it' }),
        )
        expect(result.success).toBe(true)
    })

    it('does not accept an empty model', () => {
        const result = CapabilityAiQueryNodeValueSchema.safeParse({ model: '' })
        expect(result.success).toBe(false)
    })

    it('does not accept a missing model', () => {
        const result = CapabilityAiQueryNodeValueSchema.safeParse({})
        expect(result.success).toBe(false)
    })

    it('does not accept the former ref field', () => {
        const result = CapabilityAiQueryNodeValueSchema.safeParse({ ref: 'a' })
        expect(result.success).toBe(false)
    })

    it('rejects an unknown top-level key', () => {
        const result = CapabilityAiQueryNodeValueSchema.safeParse(
            aiQuery({ unknown: 'foo' }),
        )
        expect(result.success).toBe(false)
    })

    describe('config', () => {
        it('accepts a valid config', () => {
            const result = CapabilityAiQueryNodeValueSchema.safeParse(
                aiQuery({
                    config: {
                        deterministic: true,
                        effort: 'low',
                        temperature: 0.5,
                    },
                }),
            )
            expect(result.success).toBe(true)
        })

        it('rejects an unknown config key', () => {
            const result = CapabilityAiQueryNodeValueSchema.safeParse(
                aiQuery({ config: { unknown: 'foo' } }),
            )
            expect(result.success).toBe(false)
        })

        it('rejects an invalid effort', () => {
            const result = CapabilityAiQueryNodeValueSchema.safeParse(
                aiQuery({ config: { effort: 'extreme' } }),
            )
            expect(result.success).toBe(false)
        })

        it('rejects the former expectedComplexity field', () => {
            const result = CapabilityAiQueryNodeValueSchema.safeParse(
                aiQuery({ config: { expectedComplexity: 'low' } }),
            )
            expect(result.success).toBe(false)
        })

        it.each([-0.1, 1.1])(
            'rejects temperature %s out of [0,1]',
            (temperature) => {
                const result = CapabilityAiQueryNodeValueSchema.safeParse(
                    aiQuery({ config: { temperature } }),
                )
                expect(result.success).toBe(false)
            },
        )
    })

    describe('inputs', () => {
        it('accepts a context id as a string shorthand', () => {
            const result = CapabilityAiQueryNodeValueSchema.safeParse(
                aiQuery({ inputs: { context: ['ctx_guidelines'] } }),
            )
            expect(result.success).toBe(true)
        })

        it('defaults a string-shorthand context to role "reference"', () => {
            const result = CapabilityAiQueryNodeValueSchema.safeParse(
                aiQuery({ inputs: { context: [{ id: 'ctx_a' }] } }),
            )
            expect(result.success).toBe(true)
            if (!result.success) return
            expect(result.data.inputs?.context?.[0]).toEqual({
                id: 'ctx_a',
                role: 'reference',
            })
        })

        it('accepts a context object with an explicit role', () => {
            const result = CapabilityAiQueryNodeValueSchema.safeParse(
                aiQuery({
                    inputs: {
                        context: [{ id: 'ctx_gutachten', role: 'subject' }],
                    },
                }),
            )
            expect(result.success).toBe(true)
        })

        it('rejects a context object without an id', () => {
            const result = CapabilityAiQueryNodeValueSchema.safeParse(
                aiQuery({ inputs: { context: [{ role: 'subject' }] } }),
            )
            expect(result.success).toBe(false)
        })

        it('rejects an empty context id', () => {
            const result = CapabilityAiQueryNodeValueSchema.safeParse(
                aiQuery({ inputs: { context: [{ id: '' }] } }),
            )
            expect(result.success).toBe(false)
        })

        it('rejects an unknown role', () => {
            const result = CapabilityAiQueryNodeValueSchema.safeParse(
                aiQuery({
                    inputs: { context: [{ id: 'ctx_a', role: 'other' }] },
                }),
            )
            expect(result.success).toBe(false)
        })

        it('rejects an unknown key in a context object', () => {
            const result = CapabilityAiQueryNodeValueSchema.safeParse(
                aiQuery({
                    inputs: { context: [{ id: 'ctx_a', extra: true }] },
                }),
            )
            expect(result.success).toBe(false)
        })

        it('accepts dataPoints and texts arrays', () => {
            const result = CapabilityAiQueryNodeValueSchema.safeParse(
                aiQuery({
                    inputs: {
                        dataPoints: ['dp_hardship_reason', 'dp_annual_income'],
                        texts: ['text_bgb_823'],
                    },
                }),
            )
            expect(result.success).toBe(true)
        })

        it('rejects an unknown inputs key', () => {
            const result = CapabilityAiQueryNodeValueSchema.safeParse(
                aiQuery({ inputs: { unknown: [] } }),
            )
            expect(result.success).toBe(false)
        })
    })
})
