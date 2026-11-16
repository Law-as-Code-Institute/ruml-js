// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
    CapabilityDatapointValueSchema,
    CORE_ROOT_CAPABILITY_VALUE_SCHEMAS,
    DatapointSchema,
    MetadataSchema,
    NodeSchema,
    OFFICIAL_RUML_CAPABILITY_IDS_WITH_DATA,
    OperatorSchema,
    RUMLSchema,
    capabilityPayload,
} from '../index'
import { rumlJsonSchemaDocument } from './from-json-schema'

const jsonDefs = (rumlJsonSchemaDocument as { $defs: Record<string, unknown> })
    .$defs

describe('extraction from $defs', () => {
    it('exposes each extracted definition as a composable object', () => {
        // A refined schema would throw here; consumers extend these.
        expect(() => NodeSchema.extend({ extra: OperatorSchema })).not.toThrow()
    })

    it('carries the enum values from the schema document', () => {
        const fromDoc = (jsonDefs.Operator as { enum: readonly string[] }).enum
        expect(OperatorSchema.options).toEqual([...fromDoc])
    })

    it('rejects a value the definition forbids', () => {
        expect(NodeSchema.safeParse({ label: '' }).success).toBe(false)
    })

    it('enforces a definition-level conditional', () => {
        // §4.7.3: an integer datapoint may not carry a decimals validation.
        const bad = DatapointSchema.safeParse({
            name: 'Alter',
            type: 'integer',
            binding: { type: 'input' },
            validation: { decimals: 2 },
        })
        expect(bad.success).toBe(false)
    })
})

describe('defaults agree between entry points', () => {
    const datapoint = {
        name: 'Alter',
        type: 'integer' as const,
        binding: { type: 'input' as const },
    }

    it('the per-definition schema fills sensitive', () => {
        expect(DatapointSchema.parse(datapoint)).toMatchObject({
            sensitive: false,
        })
    })

    it('the whole document fills the same field identically', () => {
        const parsed = RUMLSchema.parse({
            $format: 'RUML',
            $specVersion: '1.0',
            metadata: {
                id: 'ec36948d-fbb2-4815-985a-bd5e9375d934',
                version: '1.0.0',
                created: '2024-01-01T00:00:00Z',
                modified: '2024-01-01T00:00:00Z',
                status: 'draft',
            },
            capabilities: [
                {
                    id: 'ruml:datapoints',
                    payload: { data: { dp_age: datapoint } },
                },
            ],
            rulemap: {
                nodes: {
                    '1': {
                        id: 'ec36948d-fbb2-4815-985a-bd5e9375d934',
                        operator: 'AND',
                        label: 'Wurzel',
                    },
                },
            },
        })
        const viaDocument = capabilityPayload(
            parsed.capabilities,
            'ruml:datapoints',
        )?.data?.['dp_age']
        const viaDefinition = DatapointSchema.parse(datapoint)
        expect(viaDocument).toEqual(viaDefinition)
    })
})

describe('metadata definition', () => {
    it('requires the fields the schema marks required', () => {
        const missing = MetadataSchema.safeParse({ version: '1.0.0' })
        expect(missing.success).toBe(false)
    })
})

// A `data` map whose values are a `$ref` to a definition carrying `allOf`
// (Datapoint, Text, Context): the value schema goes through the same
// extractor as the definition itself, so it stays an introspectable object —
// the capability editors read `.shape` off it to build their forms — and the
// conditionals still apply.
describe('record values referencing a definition', () => {
    const dataValueSchema = (schema: z.ZodType): z.ZodType => {
        const data = (schema as unknown as z.ZodObject).shape[
            'data'
        ] as z.ZodOptional<z.ZodRecord>
        return data.unwrap().valueType as z.ZodType
    }

    it.each([...OFFICIAL_RUML_CAPABILITY_IDS_WITH_DATA])(
        '%s keeps one entry introspectable',
        (id) => {
            const schema = CORE_ROOT_CAPABILITY_VALUE_SCHEMAS[id]
            expect(schema).toBeDefined()
            const entry = dataValueSchema(schema as z.ZodType)
            expect(
                Object.keys((entry as z.ZodObject).shape).length,
            ).toBeGreaterThan(0)
        },
    )

    it('is the same schema the package exports for that definition', () => {
        expect(dataValueSchema(CapabilityDatapointValueSchema)).toBe(
            DatapointSchema,
        )
    })

    it('still enforces the definition-level conditional', () => {
        const entry = dataValueSchema(CapabilityDatapointValueSchema)
        const bad = entry.safeParse({
            name: 'Alter',
            type: 'integer',
            binding: { type: 'input' },
            validation: { decimals: 2 },
        })
        expect(bad.success).toBe(false)
    })
})
