// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { rumlJsonSchemaDocument } from '../conversion/from-json-schema'
import {
    CapabilityDatapointValueSchema,
    DatapointIdSchema,
    DatapointSchema,
    DatapointSetSchema,
    SetIdSchema,
} from './datapoints'

const validDataPoint = {
    name: 'a',
    type: 'string',
    binding: {
        type: 'input',
    },
}

describe('DatapointIdSchema', () => {
    it('accepts a spec key', () => {
        expect(DatapointIdSchema.safeParse('dp_credit_score').success).toBe(
            true,
        )
    })

    // DP-02: `[a-z_][a-z0-9_]*`, no prefix required.
    it.each(['credit_score', 'dp_', '_score', 'x'])(
        'accepts a key without the dp_ prefix: %s',
        (id) => {
            expect(DatapointIdSchema.safeParse(id).success).toBe(true)
        },
    )

    it.each(['2fa_enabled', ''])(
        'rejects a key not starting with a letter or underscore: %j',
        (id) => {
            expect(DatapointIdSchema.safeParse(id).success).toBe(false)
        },
    )

    it.each(['dp-credit-score', 'dp_credit-score'])(
        'rejects hyphens: %s',
        (id) => {
            expect(DatapointIdSchema.safeParse(id).success).toBe(false)
        },
    )

    it('accepts digits after the first letter', () => {
        expect(DatapointIdSchema.safeParse('dp_co2_emissions').success).toBe(
            true,
        )
    })

    it.each(['dp_Credit_Score', 'creditScore'])(
        'rejects a capital letter: %s',
        (id) => {
            expect(DatapointIdSchema.safeParse(id).success).toBe(false)
        },
    )

    it('rejects a trailing newline', () => {
        expect(DatapointIdSchema.safeParse('dp_foo\n').success).toBe(false)
    })
})

describe('SetIdSchema', () => {
    it('accepts a spec key', () => {
        expect(SetIdSchema.safeParse('set_address').success).toBe(true)
    })

    it.each(['address', 'set_', 'dp_address'])(
        'accepts an id without the set_ prefix: %s',
        (id) => {
            expect(SetIdSchema.safeParse(id).success).toBe(true)
        },
    )

    it.each(['set-address', 'set_Address', '1_address'])('rejects %s', (id) => {
        expect(SetIdSchema.safeParse(id).success).toBe(false)
    })
})

describe('DatapointSchema', () => {
    it('is empty', () => {
        expect(DatapointSchema.safeParse('').success).toBe(false)
    })

    it('is valid', () => {
        expect(DatapointSchema.safeParse(validDataPoint).success).toBe(true)
    })

    it('accepts an optional description', () => {
        expect(
            DatapointSchema.safeParse({
                ...validDataPoint,
                description: 'Annual gross income in EUR',
            }).success,
        ).toBe(true)
    })

    it('specialized type is valid', () => {
        expect(
            DatapointSchema.safeParse({
                ...validDataPoint,
                type: 'address',
            }).success,
        ).toBe(true)
    })

    it('wrong type is not valid', () => {
        const invalidTypeDataPoint = {
            ...validDataPoint,
            type: 'invalid',
        }
        expect(DatapointSchema.safeParse(invalidTypeDataPoint).success).toBe(
            false,
        )
    })

    it('wrong binding is not valid', () => {
        const invalidBindingDataPoint = {
            ...validDataPoint,
            binding: {
                type: 'invalid',
            },
        }
        expect(DatapointSchema.safeParse(invalidBindingDataPoint).success).toBe(
            false,
        )
    })

    describe('binding', () => {
        it('external requires a ref', () => {
            const dataPoint = {
                ...validDataPoint,
                binding: { type: 'external' },
            }
            expect(DatapointSchema.safeParse(dataPoint).success).toBe(false)
        })

        it('external with a ref is valid', () => {
            const dataPoint = {
                ...validDataPoint,
                binding: { type: 'external', ref: 'schufa-api' },
            }
            expect(DatapointSchema.safeParse(dataPoint).success).toBe(true)
        })

        it('input fields are rejected on an external binding', () => {
            const dataPoint = {
                ...validDataPoint,
                binding: { type: 'external', ref: 'schufa-api', hint: 'nope' },
            }
            expect(DatapointSchema.safeParse(dataPoint).success).toBe(false)
        })

        it('external fields are rejected on an input binding', () => {
            const dataPoint = {
                ...validDataPoint,
                binding: { type: 'input', ref: 'schufa-api' },
            }
            expect(DatapointSchema.safeParse(dataPoint).success).toBe(false)
        })

        it('external with sourceType and fallback is valid', () => {
            const dataPoint = {
                ...validDataPoint,
                binding: {
                    type: 'external',
                    ref: 'schufa-api',
                    description: 'SCHUFA',
                    sourceType: 'api',
                    fallback: { type: 'input', hint: 'manual' },
                },
            }
            expect(DatapointSchema.safeParse(dataPoint).success).toBe(true)
        })

        it('unknown sourceType is rejected', () => {
            const dataPoint = {
                ...validDataPoint,
                binding: {
                    type: 'external',
                    ref: 'schufa-api',
                    sourceType: 'carrier-pigeon',
                },
            }
            expect(DatapointSchema.safeParse(dataPoint).success).toBe(false)
        })
    })

    describe('spec examples (4.7.2)', () => {
        it('accepts the dp_credit_score external binding', () => {
            const dpCreditScore = {
                name: 'Bonitätsscore',
                type: 'number',
                binding: {
                    type: 'external',
                    ref: 'schufa-api',
                    description: 'SCHUFA-Schnittstelle',
                    fallback: {
                        type: 'input',
                    },
                },
            }
            expect(DatapointSchema.safeParse(dpCreditScore).success).toBe(true)
        })

        // "Example with fallback" — external binding with sourceType (4.7.2)
        it('accepts an external binding with sourceType and a fallback hint', () => {
            const dataPoint = {
                name: 'Bonitätsscore',
                type: 'number',
                binding: {
                    type: 'external',
                    ref: 'schufa-api',
                    description: 'SCHUFA-Schnittstelle',
                    sourceType: 'api',
                    fallback: {
                        type: 'input',
                        hint: 'Automatische Abfrage nicht verfügbar. Bitte manuell eingeben.',
                    },
                },
            }
            expect(DatapointSchema.safeParse(dataPoint).success).toBe(true)
        })
    })

    describe('validation', () => {
        it('is optional', () => {
            expect(DatapointSchema.safeParse(validDataPoint).success).toBe(true)
        })

        it('number accepts numeric min/max', () => {
            const dataPoint = {
                ...validDataPoint,
                type: 'number',
                validation: { min: 0, max: 100 },
            }
            expect(DatapointSchema.safeParse(dataPoint).success).toBe(true)
        })

        it('string accepts minLength/maxLength/pattern', () => {
            const dataPoint = {
                ...validDataPoint,
                validation: { minLength: 1, maxLength: 5, pattern: '^[a-z]+$' },
            }
            expect(DatapointSchema.safeParse(dataPoint).success).toBe(true)
        })

        it('location accepts enum', () => {
            const dataPoint = {
                ...validDataPoint,
                type: 'location',
                validation: { required: true, enum: ['DE', 'AT', 'CH'] },
            }
            expect(DatapointSchema.safeParse(dataPoint).success).toBe(true)
        })

        it('rejects an unknown rule', () => {
            const dataPoint = {
                ...validDataPoint,
                validation: { nope: true },
            }
            expect(DatapointSchema.safeParse(dataPoint).success).toBe(false)
        })

        describe('per-type applicability', () => {
            it('rejects min on a string', () => {
                const dataPoint = {
                    ...validDataPoint,
                    validation: { min: 5 },
                }
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(false)
            })

            it('rejects minLength on a number', () => {
                const dataPoint = {
                    ...validDataPoint,
                    type: 'number',
                    validation: { minLength: 5 },
                }
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(false)
            })

            it('rejects enum on a date', () => {
                const dataPoint = {
                    ...validDataPoint,
                    type: 'date',
                    validation: { enum: ['2020-01-01'] },
                }
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(false)
            })

            it('rejects pattern on a number', () => {
                const dataPoint = {
                    ...validDataPoint,
                    type: 'number',
                    validation: { pattern: '^[0-9]+$' },
                }
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(false)
            })
        })

        describe('min/max value kind', () => {
            it('date accepts ISO-8601 string bounds', () => {
                const dataPoint = {
                    ...validDataPoint,
                    type: 'date',
                    validation: { min: '1900-01-01', max: '2010-12-31' },
                }
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(true)
            })

            it('rejects a numeric min on a date', () => {
                const dataPoint = {
                    ...validDataPoint,
                    type: 'date',
                    validation: { min: 0 },
                }
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(false)
            })

            it('rejects a string min on a number', () => {
                const dataPoint = {
                    ...validDataPoint,
                    type: 'number',
                    validation: { min: '0' },
                }
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(false)
            })

            it('rejects a non-ISO-8601 string min on a date', () => {
                const dataPoint = {
                    ...validDataPoint,
                    type: 'date',
                    validation: { min: 'not-a-date' },
                }
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(false)
            })

            // §4.7.1 Count: "MUST be a non-negative integer". Tighten the
            // bounds to match the expected value shape.
            it('count accepts non-negative integer bounds', () => {
                const dataPoint = {
                    ...validDataPoint,
                    type: 'count',
                    validation: { min: 0, max: 100 },
                }
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(true)
            })

            it('count rejects a negative min', () => {
                const dataPoint = {
                    ...validDataPoint,
                    type: 'count',
                    validation: { min: -5 },
                }
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(false)
            })

            it('count rejects a non-integer max', () => {
                const dataPoint = {
                    ...validDataPoint,
                    type: 'count',
                    validation: { max: 1.5 },
                }
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(false)
            })
        })

        describe('pattern', () => {
            it('accepts a pattern string', () => {
                const dataPoint = {
                    ...validDataPoint,
                    validation: { pattern: '^[a-z]+$' },
                }
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(true)
            })
        })

        describe('spec examples (4.7.3)', () => {
            it('accepts dp_birth_date', () => {
                const dataPoint = {
                    name: 'Geburtsdatum',
                    type: 'date',
                    binding: { type: 'input' },
                    validation: {
                        required: true,
                        min: '1900-01-01',
                        max: '2010-12-31',
                        message:
                            'Das Geburtsdatum muss zwischen 1900 und 2010 liegen',
                    },
                }
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(true)
            })

            it('accepts dp_vat_id', () => {
                const dataPoint = {
                    name: 'Umsatzsteuer-ID',
                    type: 'identifier',
                    binding: { type: 'input' },
                    validation: {
                        required: false,
                        pattern: '^DE[0-9]{9}$',
                        message:
                            'Bitte geben Sie eine gültige deutsche USt-ID ein',
                    },
                }
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(true)
            })

            // §4.7.3 "Text field with length restriction and pattern" — the
            // canonical example combining minLength, maxLength, pattern,
            // required and message on a single string datapoint.
            it('accepts dp_postal_code', () => {
                const dataPoint = {
                    name: 'Postleitzahl',
                    type: 'string',
                    binding: { type: 'input' },
                    validation: {
                        required: true,
                        minLength: 5,
                        maxLength: 5,
                        pattern: '^[0-9]{5}$',
                        message:
                            'Bitte geben Sie eine gültige deutsche Postleitzahl ein',
                    },
                }
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(true)
            })
        })
    })

    describe('optional fields (4.7.1)', () => {
        const parse = (overrides: Record<string, unknown>) =>
            DatapointSchema.safeParse({ ...validDataPoint, ...overrides })
                .success

        it('accepts description and sensitive', () => {
            expect(parse({ description: 'A note', sensitive: true })).toBe(true)
        })

        it('defaults sensitive to false when omitted', () => {
            const result = DatapointSchema.safeParse(validDataPoint)
            expect(result.success && result.data.sensitive).toBe(false)
        })

        it('rejects a non-boolean sensitive', () => {
            expect(parse({ sensitive: 'yes' })).toBe(false)
        })

        describe('unit / currency', () => {
            it('currency requires a unit', () => {
                expect(parse({ type: 'currency' })).toBe(false)
            })
            it('accepts currency with a unit', () => {
                expect(parse({ type: 'currency', unit: 'EUR' })).toBe(true)
            })
            it('allows unit on a non-currency type', () => {
                expect(parse({ type: 'percentage', unit: '%' })).toBe(true)
            })
        })

        describe('options / enum', () => {
            const option = { value: 'married', label: 'Verheiratet' }
            it('enum accepts options', () => {
                expect(parse({ type: 'enum', options: [option] })).toBe(true)
            })
            it('enum requires options', () => {
                expect(parse({ type: 'enum' })).toBe(false)
            })
            it('enum rejects empty options', () => {
                expect(parse({ type: 'enum', options: [] })).toBe(false)
            })
            it('rejects options on a non-enum type', () => {
                expect(parse({ options: [option] })).toBe(false)
            })
            it('rejects an option without a value', () => {
                expect(parse({ type: 'enum', options: [{ label: 'x' }] })).toBe(
                    false,
                )
            })
            it('accepts an option with only a value (label optional)', () => {
                expect(
                    parse({ type: 'enum', options: [{ value: 'single' }] }),
                ).toBe(true)
            })
        })

        describe('format', () => {
            it('location accepts a known format', () => {
                expect(parse({ type: 'location', format: 'country' })).toBe(
                    true,
                )
            })
            it('location rejects an unknown format', () => {
                expect(parse({ type: 'location', format: 'planet' })).toBe(
                    false,
                )
            })
            it('identifier accepts a known format', () => {
                expect(parse({ type: 'identifier', format: 'vatId' })).toBe(
                    true,
                )
            })
            it('address accepts any format string', () => {
                expect(parse({ type: 'address', format: 'full' })).toBe(true)
            })
            it('rejects format on a type that has none', () => {
                expect(parse({ format: 'country' })).toBe(false)
            })
        })

        // DP-14: seconds, fraction and offset of a bound are optional.
        describe('datetime / time bounds (4.7.3)', () => {
            it.each([
                ['datetime', '2024-01-01T08:00'],
                ['datetime', '2024-01-01T08:00:00'],
                ['datetime', '2024-01-01T08:00:00.5+01:00'],
                ['time', '08:00'],
                ['time', '17:30:00'],
                ['time', '17:30:00+01:00'],
            ])('%s accepts min %s', (type, min) => {
                expect(parse({ type, validation: { min } })).toBe(true)
            })

            it.each([
                ['datetime', '2024-01-01'],
                ['datetime', '2024-13-01T08:00'],
                ['time', '8:00'],
                ['time', '25:00'],
            ])('%s rejects min %s', (type, min) => {
                expect(parse({ type, validation: { min } })).toBe(false)
            })
        })

        describe('spec examples (4.7.1)', () => {
            it.each([
                {
                    name: 'Wohnsitz',
                    type: 'location',
                    format: 'country',
                    validation: { required: true, enum: ['DE', 'AT', 'CH'] },
                    binding: { type: 'input' },
                },
                {
                    name: 'Steuer-ID',
                    type: 'identifier',
                    format: 'taxId',
                    validation: { required: true, pattern: '^[0-9]{11}$' },
                    binding: { type: 'input' },
                },
                {
                    name: 'Familienstand',
                    type: 'enum',
                    options: [
                        { value: 'single', label: 'Ledig' },
                        { value: 'married', label: 'Verheiratet' },
                    ],
                    binding: { type: 'input' },
                },
                {
                    name: 'Wohnadresse',
                    type: 'address',
                    validation: { required: true },
                    binding: { type: 'input' },
                },
                {
                    name: 'Jahreseinkommen',
                    type: 'currency',
                    unit: 'EUR',
                    validation: { required: true, min: 0, max: 10000000 },
                    binding: { type: 'input' },
                },
            ])('accepts %o', (dataPoint) => {
                expect(DatapointSchema.safeParse(dataPoint).success).toBe(true)
            })
        })
    })
})

// Ported from the schema-generation test that used to live alongside the Zod
// sources: `binding` carries `description`, `default` and `readOnly`
// annotations for the editor (it shows the binding pre-filled with `input` and
// locked). They are annotations by design — a `default()` wrapper would take
// `binding` out of `required` and let a document omit it, which §4.7 forbids.
describe('the datapoint binding annotations in the schema artifact', () => {
    const datapoint = (
        rumlJsonSchemaDocument.$defs as Record<
            string,
            {
                properties: {
                    binding: {
                        description?: string
                        default?: unknown
                        readOnly?: boolean
                    }
                }
                required: string[]
            }
        >
    ).Datapoint as {
        properties: {
            binding: {
                description?: string
                default?: unknown
                readOnly?: boolean
            }
        }
        required: string[]
    }

    it('carries the description, and no longer a default or readOnly flag', () => {
        expect(datapoint.properties.binding.description).toMatch(
            /^How the datapoint value is sourced \(input, external or computed\)/,
        )
        expect(datapoint.properties.binding.default).toBeUndefined()
        expect(datapoint.properties.binding.readOnly).toBeUndefined()
    })

    it('keeps binding required', () => {
        expect(datapoint.required).toContain('binding')
    })
})

describe('object datapoints and sets (4.7.4)', () => {
    const addressSet = {
        name: 'Address',
        fields: {
            dp_street: validDataPoint,
            dp_city: validDataPoint,
        },
    }
    const objectDatapoint = {
        name: 'Residence',
        type: 'object',
        set: 'set_address',
        binding: { type: 'input' },
    }

    it('accepts a set with fields keyed by datapoint id', () => {
        expect(DatapointSetSchema.safeParse(addressSet).success).toBe(true)
    })

    it.each(['name', 'fields'])('rejects a set without %s', (field) => {
        const { [field as keyof typeof addressSet]: _omit, ...rest } =
            addressSet
        expect(DatapointSetSchema.safeParse(rest).success).toBe(false)
    })

    it('accepts a set field key without the dp_ prefix', () => {
        expect(
            DatapointSetSchema.safeParse({
                ...addressSet,
                fields: { street: validDataPoint },
            }).success,
        ).toBe(true)
    })

    it('rejects a set field key with a capital letter', () => {
        expect(
            DatapointSetSchema.safeParse({
                ...addressSet,
                fields: { dp_Street: validDataPoint },
            }).success,
        ).toBe(false)
    })

    it('accepts an object datapoint carrying a set', () => {
        expect(DatapointSchema.safeParse(objectDatapoint).success).toBe(true)
    })

    it('rejects an object datapoint without a set', () => {
        const { set: _set, ...rest } = objectDatapoint
        expect(DatapointSchema.safeParse(rest).success).toBe(false)
    })

    it('accepts a set id without the set_ prefix on a datapoint', () => {
        expect(
            DatapointSchema.safeParse({ ...objectDatapoint, set: 'address' })
                .success,
        ).toBe(true)
    })

    it('rejects a malformed set id on a datapoint', () => {
        expect(
            DatapointSchema.safeParse({ ...objectDatapoint, set: 'Address' })
                .success,
        ).toBe(false)
    })

    it('accepts a payload with data and sets', () => {
        expect(
            CapabilityDatapointValueSchema.safeParse({
                data: { dp_residence: objectDatapoint },
                sets: { set_address: addressSet },
            }).success,
        ).toBe(true)
    })

    it('accepts data and sets keys without the dp_ / set_ prefix', () => {
        expect(
            CapabilityDatapointValueSchema.safeParse({
                data: { residence: { ...objectDatapoint, set: 'address' } },
                sets: { address: addressSet },
            }).success,
        ).toBe(true)
    })

    it('rejects a sets key with a capital letter', () => {
        expect(
            CapabilityDatapointValueSchema.safeParse({
                data: { dp_residence: objectDatapoint },
                sets: { set_Address: addressSet },
            }).success,
        ).toBe(false)
    })

    it.each(['dp-residence', 'dp_Residence'])(
        'rejects a malformed data key: %s',
        (key) => {
            expect(
                CapabilityDatapointValueSchema.safeParse({
                    data: { [key]: validDataPoint },
                }).success,
            ).toBe(false)
        },
    )
})
