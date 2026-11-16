// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import type { z } from 'zod'
import { rumlObjectDef, rumlSubDef, rumlSubObjectDef } from '../conversion/defs'
import { rumlJsonSchemaDocument } from '../conversion/from-json-schema'
import type {
    Datapoint,
    DatapointSet,
    DatapointsPayload,
} from '../generated/ruml.types'

// Re-exported (not aliased) so the bundled d.ts keeps one `Datapoint`
// declaration instead of renaming the generated interface to `Datapoint$1`.
export type {
    Datapoint,
    DatapointSet,
    DatapointsPayload,
} from '../generated/ruml.types'

// Spec §4.7 — the id rules of datapoint and set keys (DP-02) live in ./ids.ts.
export {
    DATAPOINT_ID_REGEX,
    DatapointIdSchema,
    SET_ID_REGEX,
    SetIdSchema,
} from './ids'

// Spec §4.7.3 — the per-type applicability rules. `$defs.Datapoint.allOf`
// holds one `if/then` branch per datapoint type, which is the same table these
// constants describe, so they are read off the schema instead of restating it.
// (Before the schema became the source, the arrow pointed the other way: the
// table was hand-written and the conditionals were generated from it.)
type DatapointType = Datapoint['type']

type DatapointBranch = {
    if?: { properties?: { type?: { const?: DatapointType } } }
    then?: {
        properties?: {
            validation?: { properties?: Record<string, unknown> }
            format?: false | { enum?: readonly string[] }
        }
    }
}

const DATAPOINT_BRANCHES = (
    (
        rumlJsonSchemaDocument.$defs as Record<
            string,
            { allOf?: DatapointBranch[] } | undefined
        >
    ).Datapoint?.allOf ?? []
).flatMap((branch) => {
    const type = branch.if?.properties?.type?.const
    return type ? [[type, branch] as const] : []
})

// Which validation rules each type accepts.
export const DATAPOINT_RULES_BY_TYPE: Record<
    DatapointType,
    ReadonlySet<string>
> = Object.fromEntries(
    DATAPOINT_BRANCHES.map(([type, branch]) => [
        type,
        new Set(
            Object.keys(branch.then?.properties?.validation?.properties ?? {}),
        ),
    ]),
) as unknown as Record<DatapointType, ReadonlySet<string>>

// Temporal types take ISO-8601 *string* bounds; every other range type takes
// numbers (§4.7.3, "Min/Max for Date Fields") — visible in the branch as the
// declared type of `min`, given inline or through a `$ref` (DatapointDateTime,
// DatapointTime).
export const DATAPOINT_RANGE_TYPES = new Set<DatapointType>(
    DATAPOINT_BRANCHES.filter(([, branch]) => {
        const min = branch.then?.properties?.validation?.properties?.min as
            | { type?: string; $ref?: string }
            | undefined
        const refName = min?.$ref?.replace('#/$defs/', '')
        const target = refName
            ? (rumlJsonSchemaDocument.$defs as Record<string, typeof min>)[
                  refName
              ]
            : min
        return target?.type === 'string'
    }).map(([type]) => type),
)

// §4.7.1 — `format` applicability per type. A branch forbidding it sets
// `format: false`; one gating it on a list carries that list; a type that
// allows any string simply says nothing about `format`.
export const DATAPOINT_FORMAT_BY_TYPE: Partial<
    Record<DatapointType, readonly string[]>
> = Object.fromEntries(
    DATAPOINT_BRANCHES.flatMap(([type, branch]) => {
        const format = branch.then?.properties?.format
        if (format === false) return []
        return [[type, format?.enum ?? []] as const]
    }),
)

export const DATAPOINT_FORMAT_TYPES = new Set<DatapointType>(
    Object.keys(DATAPOINT_FORMAT_BY_TYPE) as DatapointType[],
)

export const DATAPOINT_FORMAT_ENUMS: Partial<
    Record<DatapointType, readonly string[]>
> = Object.fromEntries(
    Object.entries(DATAPOINT_FORMAT_BY_TYPE).filter(
        ([, values]) => values.length > 0,
    ),
)

// §4.7 — a single datapoint definition. The per-type validation-applicability
// rules live as if/then conditionals on $defs.Datapoint.
export const DatapointSchema = rumlObjectDef<Datapoint>('Datapoint')

// §4.7 — root-level ruml:datapoints payload ({ data, sets? }).
export const CapabilityDatapointValueSchema =
    rumlObjectDef<DatapointsPayload>('DatapointsPayload')

// §4.7.4 — a reusable structured type, instantiated by `type: object`
// datapoints via `set`.
export const DatapointSetSchema = rumlObjectDef<DatapointSet>('DatapointSet')

export type DatapointValidationResult =
    | { ok: true }
    | { ok: false; message: string }

// Runtime §4.7.3 checks against an actual input value. Conventions for edge
// cases the spec leaves open:
// - `required:true` fails on `undefined`/`null`/`''` (JSON Schema convention).
//   Absent values without `required` short-circuit — nothing to check.
// - `pattern` is anchored implicitly per spec: `^(?:source)$`. The pattern is
//   an author-supplied source and is NOT ReDoS-checked — keep untrusted
//   patterns off this path, or validate them upstream.
// - Numeric `min`/`max` are inclusive ("minimum value" wording).
// - `duration` bounds are NOT enforced yet: §4.7.3 asks for a comparison by
//   value, but ISO-8601 durations with years or months have no fixed length.
// - `time` / `datetime` bounds: see `compareTemporal` for offsets.
export const validateDatapointValue = (
    datapoint: Datapoint,
    value: unknown,
): DatapointValidationResult => {
    const { type, options, validation } = datapoint
    const fail = (defaultMessage: string): DatapointValidationResult => ({
        ok: false,
        message: validation?.message ?? defaultMessage,
    })

    // §4.7.3 `required` — value MUST be present.
    const isAbsent = value === undefined || value === null || value === ''
    if (validation?.required && isAbsent) return fail('value is required')
    if (isAbsent) return { ok: true }

    // §4.7.1 `enum` type — value MUST be one of `options[].value`.
    if (type === 'enum' && !options?.some((option) => option.value === value)) {
        return fail('value is not one of the declared options')
    }

    // §4.7.3 `enum` — value MUST be in the allowed list.
    if (validation?.enum && !validation.enum.includes(value)) {
        return fail('value is not in the allowed enum')
    }

    // §4.7.3 `pattern` — compiled with implicit `^…$` anchoring per spec.
    if (validation?.pattern && typeof value === 'string') {
        // Pattern is necessarily dynamic (author-supplied regex source).
        // TODO: Correctly validate pattern in backend (for example with recheck package)
        // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
        const pattern = new RegExp(`^(?:${validation.pattern})$`)
        if (!pattern.test(value)) {
            return fail('value does not match the required pattern')
        }
    }

    // §4.7.3 `minLength`/`maxLength` — character-length bounds.
    if (typeof value === 'string') {
        const { minLength, maxLength } = validation ?? {}
        if (typeof minLength === 'number' && value.length < minLength) {
            return fail(`value is shorter than ${minLength} characters`)
        }
        if (typeof maxLength === 'number' && value.length > maxLength) {
            return fail(`value is longer than ${maxLength} characters`)
        }
    }

    // §4.7.3 `min`/`max` for numeric types — inclusive bounds.
    if (typeof value === 'number') {
        const { min, max } = validation ?? {}
        if (typeof min === 'number' && value < min) {
            return fail(`value is below ${min}`)
        }
        if (typeof max === 'number' && value > max) {
            return fail(`value is above ${max}`)
        }
    }

    // §4.7.3 `min`/`max` for date/datetime/time/duration — ISO-8601 strings,
    // compared by semantic value (see `compareTemporal`).
    if (DATAPOINT_RANGE_TYPES.has(type) && typeof value === 'string') {
        const { min, max } = validation ?? {}
        for (const bound of [min, max]) {
            if (typeof bound !== 'string') continue
            const order = compareTemporal(type, value, bound)
            if (order === null) {
                return fail(`value cannot be compared with ${bound}`)
            }
            if (bound === min && order < 0) {
                return fail(`value is before ${min}`)
            }
            if (bound === max && order > 0) {
                return fail(`value is after ${max}`)
            }
        }
    }

    return { ok: true }
}

// Sign of `value - bound` for two same-`type` temporal strings, or null when
// one of them is not a `datetime` / `time` — the check then fails instead of
// passing unchecked. `date` compares lexicographically (ISO dates are
// well-ordered); `duration` returns 0 (not enforced, see above).
//
// Offsets (the spec leaves this open): when both sides have one, the instants
// are compared; when at least one has none, both are compared as written, so a
// bound without offset means the clock time wherever the value was taken.
// Nothing depends on the time zone of the machine.
const compareTemporal = (
    type: Datapoint['type'],
    value: string,
    bound: string,
): number | null => {
    if (type === 'datetime' || type === 'time') {
        const parse = type === 'datetime' ? parseDateTime : parseTime
        const a = parse(value)
        const b = parse(bound)
        if (a === null || b === null) return null
        if (a.offset === null || b.offset === null) return a.written - b.written
        // A time of day wraps around midnight: 01:00+02:00 is 23:00Z.
        const instant = (written: number, offset: number) =>
            type === 'time'
                ? (((written - offset) % DAY) + DAY) % DAY
                : written - offset
        return instant(a.written, a.offset) - instant(b.written, b.offset)
    }
    if (type === 'duration') return 0
    return value < bound ? -1 : value > bound ? 1 : 0
}

// `written`: seconds on the clock as written (for a datetime, since the epoch);
// `offset`: seconds east of UTC, null when the string has none.
type Clock = { written: number; offset: number | null }

const DAY = 86_400

// The forms of $defs.DatapointTime / DatapointDateTime: HH:MM, optionally with
// seconds, a fraction and an offset (Z, ±HH, ±HHMM, ±HH:MM).
const TIME_SOURCE =
    '(\\d{2}):(\\d{2})(?::(\\d{2})(\\.\\d+)?)?(?:([Zz])|([+-])(\\d{2})(?::?(\\d{2}))?)?'
const TIME_PATTERN = new RegExp(`^${TIME_SOURCE}$`)
const DATE_TIME_PATTERN = new RegExp(
    `^(\\d{4})-(\\d{2})-(\\d{2})[Tt]${TIME_SOURCE}$`,
)

const clock = (parts: (string | undefined)[], days: number): Clock | null => {
    const [
        hours,
        minutes,
        seconds,
        fraction,
        utc,
        sign,
        offsetHours,
        offsetMinutes,
    ] = parts
    const h = Number(hours)
    const m = Number(minutes)
    const s = Number(seconds ?? 0)
    if (h > 23 || m > 59 || s > 60) return null
    // A leap second (`:60`) is the first second of the next minute.
    const second = s + Number(fraction ?? 0)
    const offset =
        (sign === '-' ? -1 : 1) *
        (Number(offsetHours ?? 0) * 3600 + Number(offsetMinutes ?? 0) * 60)
    return {
        written: days * DAY + h * 3600 + m * 60 + second,
        offset: utc !== undefined || sign !== undefined ? offset : null,
    }
}

const parseTime = (text: string): Clock | null => {
    const match = TIME_PATTERN.exec(text)
    return match ? clock(match.slice(1), 0) : null
}

const parseDateTime = (text: string): Clock | null => {
    const match = DATE_TIME_PATTERN.exec(text)
    if (!match) return null
    const [year, month, day] = match.slice(1, 4).map(Number) as [
        number,
        number,
        number,
    ]
    // The UTC setters read the fields as given; no time zone is involved.
    const date = new Date(0)
    date.setUTCFullYear(year, month - 1, day)
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return null
    }
    return clock(match.slice(4), date.getTime() / 1000 / DAY)
}

// §4.7.1/§4.7.3 — the parts of a datapoint definition the editors compose with.
export const ValidationSchema = rumlSubObjectDef<
    NonNullable<Datapoint['validation']>
>('$defs/Datapoint/properties/validation')

export const OptionSchema = rumlSubObjectDef<
    NonNullable<Datapoint['options']>[number]
>('$defs/Datapoint/properties/options/items')

// §4.7.2 — where a datapoint's value comes from. `type` selects the kind, so
// the kinds are not addressable as their own nodes.
export const DatapointBindingSchema = rumlSubDef(
    '$defs/Datapoint/properties/binding',
) as z.ZodType<NonNullable<Datapoint['binding']>>
