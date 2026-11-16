// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import type { Datapoint } from './datapoints'
import { validateDatapointValue } from './datapoints'

describe('validateDatapointValue', () => {
    const dp = (overrides: Partial<Datapoint> = {}): Datapoint => ({
        name: 'X',
        type: 'string',
        sensitive: false,
        binding: { type: 'input' },
        ...overrides,
    })

    describe('required', () => {
        it('rejects undefined when required:true', () => {
            expect(
                validateDatapointValue(
                    dp({ validation: { required: true } }),
                    undefined,
                ).ok,
            ).toBe(false)
        })

        it('rejects null when required:true', () => {
            expect(
                validateDatapointValue(
                    dp({ validation: { required: true } }),
                    null,
                ).ok,
            ).toBe(false)
        })

        it("rejects '' when required:true", () => {
            expect(
                validateDatapointValue(
                    dp({ validation: { required: true } }),
                    '',
                ).ok,
            ).toBe(false)
        })

        it('accepts a present value when required:true', () => {
            expect(
                validateDatapointValue(
                    dp({ validation: { required: true } }),
                    'x',
                ),
            ).toEqual({ ok: true })
        })

        it('accepts undefined when required is absent', () => {
            expect(validateDatapointValue(dp(), undefined)).toEqual({
                ok: true,
            })
        })

        it('accepts undefined when required:false', () => {
            expect(
                validateDatapointValue(
                    dp({ validation: { required: false } }),
                    undefined,
                ),
            ).toEqual({ ok: true })
        })
    })

    describe('pattern', () => {
        const patternTypes = [
            'string',
            'identifier',
            'email',
            'phone',
            'iban',
            'url',
        ] as const

        it.each(patternTypes)('%s: matching value passes', (type) => {
            expect(
                validateDatapointValue(
                    dp({ type, validation: { pattern: '^[a-z]+$' } }),
                    'abc',
                ),
            ).toEqual({ ok: true })
        })

        it.each(patternTypes)('%s: non-matching value fails', (type) => {
            expect(
                validateDatapointValue(
                    dp({ type, validation: { pattern: '^[a-z]+$' } }),
                    'ABC',
                ).ok,
            ).toBe(false)
        })

        // Spec §4.7.3: "The expression is matched against the entire value
        // (implicit `^...$`)".
        it('anchors implicitly: [0-9]+ rejects "abc1def"', () => {
            expect(
                validateDatapointValue(
                    dp({ validation: { pattern: '[0-9]+' } }),
                    'abc1def',
                ).ok,
            ).toBe(false)
        })

        it('anchors implicitly: [0-9]+ accepts "123"', () => {
            expect(
                validateDatapointValue(
                    dp({ validation: { pattern: '[0-9]+' } }),
                    '123',
                ),
            ).toEqual({ ok: true })
        })
    })

    // Spec §4.7.3: "Other rules such as min, max, pattern are checked
    // additionally" when enum is defined. `string` is the only type that
    // allows both enum and pattern per the applicability table.
    describe('enum + pattern combined', () => {
        const validation = { enum: ['abc', 'XYZ'], pattern: '^[a-z]+$' }

        it('satisfies enum but fails pattern → fails', () => {
            expect(validateDatapointValue(dp({ validation }), 'XYZ').ok).toBe(
                false,
            )
        })

        it('matches pattern but not in enum → fails', () => {
            expect(validateDatapointValue(dp({ validation }), 'def').ok).toBe(
                false,
            )
        })

        it('satisfies both → passes', () => {
            expect(validateDatapointValue(dp({ validation }), 'abc')).toEqual({
                ok: true,
            })
        })
    })

    // Spec §4.7.3: "Tools MUST perform a date comparison, not a string
    // comparison". Lexicographic compare diverges from semantic compare when
    // values use different timezones — these tests pin the semantic behaviour.
    describe('numeric min/max', () => {
        const numericTypes = [
            'number',
            'integer',
            'currency',
            'percentage',
            'count',
        ] as const

        it('at-bound min passes', () => {
            expect(
                validateDatapointValue(
                    dp({ type: 'number', validation: { min: 0, max: 100 } }),
                    0,
                ),
            ).toEqual({ ok: true })
        })

        it('at-bound max passes', () => {
            expect(
                validateDatapointValue(
                    dp({ type: 'number', validation: { min: 0, max: 100 } }),
                    100,
                ),
            ).toEqual({ ok: true })
        })

        it('inside range passes', () => {
            expect(
                validateDatapointValue(
                    dp({ type: 'number', validation: { min: 0, max: 100 } }),
                    50,
                ),
            ).toEqual({ ok: true })
        })

        it.each(numericTypes)('%s: below min fails', (type) => {
            expect(
                validateDatapointValue(
                    dp({ type, unit: 'EUR', validation: { min: 10 } }),
                    5,
                ).ok,
            ).toBe(false)
        })

        it.each(numericTypes)('%s: above max fails', (type) => {
            expect(
                validateDatapointValue(
                    dp({ type, unit: 'EUR', validation: { max: 10 } }),
                    20,
                ).ok,
            ).toBe(false)
        })
    })

    describe('datetime min/max', () => {
        it('within bounds passes', () => {
            expect(
                validateDatapointValue(
                    dp({
                        type: 'datetime',
                        validation: {
                            min: '2024-01-01T00:00:00Z',
                            max: '2024-12-31T23:59:59Z',
                        },
                    }),
                    '2024-06-15T12:00:00Z',
                ),
            ).toEqual({ ok: true })
        })

        // Semantically 09:30Z, before min (10:00Z). Lex says value > min so
        // lex compare currently lets this through — must be rejected.
        it('rejects a value before min in a different timezone', () => {
            expect(
                validateDatapointValue(
                    dp({
                        type: 'datetime',
                        validation: { min: '2024-01-01T10:00:00Z' },
                    }),
                    '2024-01-01T10:30:00+01:00',
                ).ok,
            ).toBe(false)
        })

        // Semantically 09:00Z, before max (10:00Z) — should pass. Lex says
        // value > max so lex compare currently rejects — must be accepted.
        it('accepts a value within max in a different timezone', () => {
            expect(
                validateDatapointValue(
                    dp({
                        type: 'datetime',
                        validation: { max: '2024-01-01T10:00:00Z' },
                    }),
                    '2024-01-01T11:00:00+02:00',
                ),
            ).toEqual({ ok: true })
        })

        // Semantically equal at min — must be accepted.
        it('accepts a value equal to min via timezone offset', () => {
            expect(
                validateDatapointValue(
                    dp({
                        type: 'datetime',
                        validation: { min: '2024-01-01T10:00:00Z' },
                    }),
                    '2024-01-01T11:00:00+01:00',
                ),
            ).toEqual({ ok: true })
        })
    })

    describe('time min/max', () => {
        it('within bounds passes', () => {
            expect(
                validateDatapointValue(
                    dp({
                        type: 'time',
                        validation: { min: '08:00:00', max: '18:00:00' },
                    }),
                    '12:00:00',
                ),
            ).toEqual({ ok: true })
        })

        it('rejects 14:30:00 when min is 15:00:00', () => {
            expect(
                validateDatapointValue(
                    dp({
                        type: 'time',
                        validation: { min: '15:00:00' },
                    }),
                    '14:30:00',
                ).ok,
            ).toBe(false)
        })

        // Spec §4.7.1: "The seconds component MAY be omitted: 14:30 is valid".
        // Lex compare puts '14:30' < '14:30:00' (shorter prefix-equal) — must
        // be treated as semantically equal.
        it('accepts a value with omitted seconds equal to min', () => {
            expect(
                validateDatapointValue(
                    dp({
                        type: 'time',
                        validation: { min: '14:30:00' },
                    }),
                    '14:30',
                ),
            ).toEqual({ ok: true })
        })
    })

    // §4.7.3: a bound needs neither seconds nor an offset.
    describe('bounds without seconds or offset', () => {
        it('compares a datetime against a bound without offset', () => {
            const datapoint = dp({
                type: 'datetime',
                validation: { min: '2024-01-01T10:00' },
            })
            expect(
                validateDatapointValue(datapoint, '2024-01-01T09:59').ok,
            ).toBe(false)
            expect(
                validateDatapointValue(datapoint, '2024-01-01T10:00').ok,
            ).toBe(true)
        })
    })

    // Both sides with an offset: instants. At least one without: as written.
    describe('offsets of time and datetime bounds', () => {
        const within = (
            type: 'time' | 'datetime',
            validation: { min?: string; max?: string },
            value: string,
        ) => validateDatapointValue(dp({ type, validation }), value).ok

        it.each([
            // instants; a time of day wraps around midnight
            [{ min: '00:00Z' }, '01:00+02:00', true],
            [{ min: '23:30Z' }, '01:00+02:00', false],
            [{ max: '00:30Z' }, '23:00-02:00', false],
            [{ max: '17:30:00+01:00' }, '16:30Z', true],
            [{ max: '17:30:00+01:00' }, '16:30:00.5Z', false],
            // every spelling of an offset
            [{ min: '10:00+01' }, '09:00Z', true],
            [{ min: '10:00+0100' }, '09:00z', true],
            [{ min: '10:00+01:00' }, '08:59:59.9Z', false],
            // as written, when one side has no offset
            [{ min: '08:00' }, '07:59', false],
            [{ min: '08:00' }, '08:00:00', true],
            [{ min: '08:00' }, '09:00+02:00', true],
            [{ min: '08:00' }, '07:00-02:00', false],
            [{ max: '17:30+01:00' }, '17:00', true],
            // a leap second is the first second of the next minute
            [{ max: '23:59:59' }, '23:59:60', false],
            [{ min: '12:59:60Z' }, '12:59:59.5Z', false],
            [{ min: '12:59:60Z' }, '13:00Z', true],
            [{ max: '13:00+01:00' }, '11:59:60Z', true],
        ])('time %j, value %s: within = %s', (validation, value, expected) => {
            expect(within('time', validation, value)).toBe(expected)
        })

        it.each([
            [{ min: '2026-01-01T10:00+01' }, '2026-01-01T09:00Z', true],
            [{ min: '2026-01-01T10:00+0100' }, '2026-01-01T08:59Z', false],
            [{ min: '2026-01-01T10:00+01:00' }, '2026-01-01t09:00:00.0z', true],
            [{ max: '2026-01-01T00:30Z' }, '2025-12-31T23:00-02:00', false],
            // a leap second is the first second of the next minute
            [{ max: '2026-06-30T23:59:60Z' }, '2026-06-30T23:59:59.5Z', true],
            [{ max: '2026-06-30T23:59:60Z' }, '2026-07-01T00:00:00Z', true],
            [{ max: '2026-06-30T23:59:60Z' }, '2026-07-01T00:00:01Z', false],
            [{ min: '2026-06-30T23:59:60Z' }, '2026-06-30T23:59:59Z', false],
            // as written, when one side has no offset
            [{ min: '2026-01-01T10:00' }, '2026-01-01T09:59', false],
            [{ min: '2026-01-01T10:00' }, '2026-01-01T10:00:00.000', true],
            [{ min: '2026-01-01T10:00' }, '2026-01-01T10:30+05:00', true],
            [{ max: '2026-01-01T10:00+05:00' }, '2026-01-01T10:30', false],
        ])(
            'datetime %j, value %s: within = %s',
            (validation, value, expected) => {
                expect(within('datetime', validation, value)).toBe(expected)
            },
        )

        it('does not depend on the time zone of the machine', () => {
            const zone = process.env.TZ
            try {
                for (const TZ of ['Pacific/Kiritimati', 'America/Anchorage']) {
                    process.env.TZ = TZ
                    expect(
                        within(
                            'datetime',
                            { min: '2026-01-01T10:00' },
                            '2026-01-01T10:00+00:00',
                        ),
                    ).toBe(true)
                    expect(
                        within(
                            'datetime',
                            { max: '2026-03-29T02:30' },
                            '2026-03-29T02:31',
                        ),
                    ).toBe(false)
                }
            } finally {
                if (zone === undefined) delete process.env.TZ
                else process.env.TZ = zone
            }
        })

        // A value that is not a time / datetime fails; the bound is not skipped.
        it.each([
            ['time', 'min', '08:00', 'noon'],
            ['time', 'min', '08:00', '24:00'],
            ['time', 'max', '08:00', '8:00'],
            ['datetime', 'min', '2026-01-01T10:00', '2026-01-01'],
            ['datetime', 'max', '2026-01-01T10:00', '2026-02-30T10:00'],
            ['datetime', 'min', '2026-01-01T10:00', 'yesterday'],
        ] as const)(
            '%s with %s %s fails for the value %s',
            (type, rule, bound, value) => {
                const datapoint = dp({ type, validation: { [rule]: bound } })
                expect(validateDatapointValue(datapoint, value)).toEqual({
                    ok: false,
                    message: `value cannot be compared with ${bound}`,
                })
            },
        )
    })

    describe('minLength / maxLength', () => {
        const stringyTypes = ['string', 'identifier'] as const

        it('at-bound minLength passes', () => {
            expect(
                validateDatapointValue(
                    dp({ validation: { minLength: 3, maxLength: 5 } }),
                    'abc',
                ),
            ).toEqual({ ok: true })
        })

        it('at-bound maxLength passes', () => {
            expect(
                validateDatapointValue(
                    dp({ validation: { minLength: 3, maxLength: 5 } }),
                    'abcde',
                ),
            ).toEqual({ ok: true })
        })

        it.each(stringyTypes)('%s: below minLength fails', (type) => {
            expect(
                validateDatapointValue(
                    dp({ type, validation: { minLength: 3 } }),
                    'ab',
                ).ok,
            ).toBe(false)
        })

        it.each(stringyTypes)('%s: above maxLength fails', (type) => {
            expect(
                validateDatapointValue(
                    dp({ type, validation: { maxLength: 3 } }),
                    'abcd',
                ).ok,
            ).toBe(false)
        })
    })

    // Each new failure path must propagate validation.message via the
    // shared fail() helper, like the existing enum path already does.
    describe('validation.message propagates on each failure path', () => {
        const message = 'custom'

        it('required', () => {
            expect(
                validateDatapointValue(
                    dp({ validation: { required: true, message } }),
                    undefined,
                ),
            ).toEqual({ ok: false, message })
        })

        it('pattern', () => {
            expect(
                validateDatapointValue(
                    dp({ validation: { pattern: '^[a-z]+$', message } }),
                    'ABC',
                ),
            ).toEqual({ ok: false, message })
        })

        it('minLength', () => {
            expect(
                validateDatapointValue(
                    dp({ validation: { minLength: 3, message } }),
                    'a',
                ),
            ).toEqual({ ok: false, message })
        })

        it('numeric min', () => {
            expect(
                validateDatapointValue(
                    dp({
                        type: 'number',
                        validation: { min: 10, message },
                    }),
                    5,
                ),
            ).toEqual({ ok: false, message })
        })

        it('datetime min (semantic)', () => {
            expect(
                validateDatapointValue(
                    dp({
                        type: 'datetime',
                        validation: { min: '2024-01-01T10:00:00Z', message },
                    }),
                    '2024-01-01T10:30:00+01:00',
                ),
            ).toEqual({ ok: false, message })
        })
    })

    // enum membership
    it('accepts a value listed in validation.enum', () => {
        expect(
            validateDatapointValue(
                dp({ validation: { enum: ['a', 'b'] } }),
                'a',
            ),
        ).toEqual({ ok: true })
    })

    it('rejects a value not in validation.enum', () => {
        expect(
            validateDatapointValue(
                dp({ validation: { enum: ['a', 'b'] } }),
                'c',
            ).ok,
        ).toBe(false)
    })

    it('accepts an enum-type value matching options[].value', () => {
        expect(
            validateDatapointValue(
                dp({
                    type: 'enum',
                    options: [{ value: 'single' }, { value: 'married' }],
                }),
                'married',
            ),
        ).toEqual({ ok: true })
    })

    it('rejects an enum-type value not in options', () => {
        expect(
            validateDatapointValue(
                dp({
                    type: 'enum',
                    options: [{ value: 'single' }],
                }),
                'divorced',
            ).ok,
        ).toBe(false)
    })

    // date comparison
    it('accepts a date within min/max bounds', () => {
        expect(
            validateDatapointValue(
                dp({
                    type: 'date',
                    validation: {
                        min: '1900-01-01',
                        max: '2010-12-31',
                    },
                }),
                '1990-06-15',
            ),
        ).toEqual({ ok: true })
    })

    it('rejects a date before min', () => {
        expect(
            validateDatapointValue(
                dp({
                    type: 'date',
                    validation: { min: '2000-01-01' },
                }),
                '1990-01-01',
            ).ok,
        ).toBe(false)
    })

    it('rejects a date after max', () => {
        expect(
            validateDatapointValue(
                dp({
                    type: 'date',
                    validation: { max: '2000-01-01' },
                }),
                '2010-01-01',
            ).ok,
        ).toBe(false)
    })

    // default message
    it('uses validation.message on failure', () => {
        expect(
            validateDatapointValue(
                dp({
                    validation: { enum: ['a'], message: 'must be a' },
                }),
                'b',
            ),
        ).toEqual({ ok: false, message: 'must be a' })
    })

    it('falls back to a default message when validation.message is absent', () => {
        const result = validateDatapointValue(
            dp({ validation: { enum: ['a'] } }),
            'b',
        )
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.message.length).toBeGreaterThan(0)
    })
})
