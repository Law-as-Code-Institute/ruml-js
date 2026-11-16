// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { RumlResultValidator } from './ResultValidator'

const validRumlId = 'ec36948d-fbb2-4815-985a-bd5e9375d934'
const validRumlHash =
    'sha3-256:4e03657aea45a94fc7d47c89e3f5a2b7c4d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2'

const validResult = {
    $format: 'RUML-Result',
    $specVersion: '1.0',
    rumlReference: {
        id: validRumlId,
        hash: validRumlHash,
    },
    evaluation: {
        id: '50a7e1ea-58c3-4487-b4b0-61eee8641952',
        timestamp: '2024-01-15T10:00:00Z',
        mode: 'optimized',
        results: {
            '1': {
                lexId: '1',
                status: 'ignored',
                evaluatedAt: '2024-01-15T10:00:04Z',
                reason: {
                    type: 'shortCircuit',
                    trigger: 'undefined',
                    operator: 'undefined',
                    mode: 'optimized',
                },
            },
        },
    },
}

const withNodeCapabilities = (capabilities: unknown) => ({
    ...validResult,
    evaluation: {
        ...validResult.evaluation,
        results: {
            '1': {
                ...validResult.evaluation.results['1'],
                capabilities,
            },
        },
    },
})

const resultWithInvalidCapability = withNodeCapabilities([
    {
        id: 'ruml:query',
        payload: {
            expression: 'dp_age >= 18',
            inputs: {},
            result: 'yes',
        },
    },
])

const resultWithValidCapability = withNodeCapabilities([
    {
        id: 'ruml:query',
        payload: {
            expression: 'dp_age >= 18',
            inputs: { dp_age: 25 },
            result: 'true',
        },
    },
])

const invalidCapabilityErrors = [
    {
        message:
            '/evaluation/results/1/capabilities/0/payload/result must be equal to one of the allowed values',
        path: 'evaluation.results.1.capabilities.0.payload.result',
    },
]
describe('RumlResultValidator', () => {
    describe('validate', () => {
        it('accepts a valid result document', () => {
            expect(
                new RumlResultValidator(validRumlId, validRumlHash).validate(
                    validResult,
                ),
            ).toEqual({
                valid: true,
            })
        })
        it('rejects a malformed capability', () => {
            expect(
                new RumlResultValidator(validRumlId, validRumlHash).validate(
                    resultWithInvalidCapability,
                ),
            ).toEqual({
                valid: false,
                errors: invalidCapabilityErrors,
            })
        })
        it('accepts a capability', () => {
            expect(
                new RumlResultValidator(validRumlId, validRumlHash).validate(
                    resultWithValidCapability,
                ),
            ).toEqual({ valid: true })
        })
    })

    describe('safeParse', () => {
        it('returns the valid result document', () => {
            expect(
                new RumlResultValidator(validRumlId, validRumlHash).safeParse(
                    validResult,
                ),
            ).toEqual({
                success: true,
                data: validResult,
            })
        })
        it('fails on a malformed ruml id', () => {
            expect(
                new RumlResultValidator('invalid', validRumlHash).safeParse({
                    ...validResult,
                    rumlReference: {
                        ...validResult.rumlReference,
                        id: 'invalid',
                    },
                }),
            ).toEqual({
                success: false,
                errors: [
                    {
                        message:
                            'Invalid string: must match pattern /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/',
                        path: 'rumlReference.id',
                    },
                ],
            })
        })
        it('fails when the ruml id differs from the reference', () => {
            expect(
                new RumlResultValidator(
                    'ada9e5d6-a79e-400d-8767-66650b884c53',
                    validRumlHash,
                ).safeParse(validResult),
            ).toEqual({
                success: false,
                errors: [
                    {
                        message: 'Ruml reference Id mismatch.',
                        path: 'rumlReference.id',
                    },
                ],
            })
        })
        it('fails when the referenced ruml hash does not match', () => {
            expect(
                new RumlResultValidator(
                    validRumlId,
                    'sha3-256:0000000000000000000000000000000000000000000000000000000000000000',
                ).safeParse(validResult),
            ).toEqual({
                success: false,
                errors: [
                    {
                        message:
                            'Hash mismatch. The ruml data structure reference changed.',
                        path: 'rumlReference.hash',
                    },
                ],
            })
        })
        it('reports both id and hash mismatches at once', () => {
            expect(
                new RumlResultValidator(
                    'ada9e5d6-a79e-400d-8767-66650b884c53',
                    'sha3-256:0000000000000000000000000000000000000000000000000000000000000000',
                ).safeParse(validResult),
            ).toEqual({
                success: false,
                errors: [
                    {
                        message: 'Ruml reference Id mismatch.',
                        path: 'rumlReference.id',
                    },
                    {
                        message:
                            'Hash mismatch. The ruml data structure reference changed.',
                        path: 'rumlReference.hash',
                    },
                ],
            })
        })
        it('skips the reference check when the structure is invalid', () => {
            expect(
                new RumlResultValidator(
                    'ada9e5d6-a79e-400d-8767-66650b884c53',
                    'sha3-256:0000000000000000000000000000000000000000000000000000000000000000',
                ).safeParse(resultWithInvalidCapability),
            ).toEqual({
                success: false,
                errors: invalidCapabilityErrors,
            })
        })
        it('fails on a malformed capability', () => {
            expect(
                new RumlResultValidator(validRumlId, validRumlHash).safeParse(
                    resultWithInvalidCapability,
                ),
            ).toEqual({
                success: false,
                errors: invalidCapabilityErrors,
            })
        })
        it('returns the result document with a valid capability', () => {
            expect(
                new RumlResultValidator(validRumlId, validRumlHash).safeParse(
                    resultWithValidCapability,
                ),
            ).toEqual({
                success: true,
                data: resultWithValidCapability,
            })
        })
    })
})
