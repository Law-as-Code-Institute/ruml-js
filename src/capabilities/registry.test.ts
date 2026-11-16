// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
    buildCapabilitiesSchema,
    buildNodeCapabilitiesSchema,
    CapabilitiesSchema,
    capabilityPayload,
    capabilityRole,
    CapabilityEntrySchema,
    CapabilityIdSchema,
    CORE_ROOT_CAPABILITY_VALUE_SCHEMAS,
    duplicateCapabilityIds,
    duplicateNodeCapabilityIds,
    findCapability,
    NodeCapabilitiesSchema,
    nodeCapabilityPayload,
    nodeCapabilityPayloads,
    NodeCapabilityEntrySchema,
    OFFICIAL_CAPABILITY_ROLES,
    OFFICIAL_RUML_CAPABILITY_IDS,
    TYPED_NODE_CAPABILITY_VALUE_SCHEMAS,
} from './registry'

// A root entry: official ids carry no role, every other id must declare one.
const entryOf = (id: string) =>
    id.startsWith('ruml:') && !id.startsWith('ruml:draft/')
        ? { id }
        : { id, role: 'data' }

describe('CapabilityIdSchema', () => {
    it.each([
        'ruml:datapoints',
        'ruml:query',
        'ruml:ai-query',
        'ruml:actions',
        'ruml:text-reference',
        'ruml:context',
        'ruml:protocol',
    ])('accepts official ruml capability id %s', (id) => {
        expect(CapabilityIdSchema.safeParse(id).success).toBe(true)
    })

    it('rejects an empty string', () => {
        expect(CapabilityIdSchema.safeParse('').success).toBe(false)
    })

    it('rejects an id longer than 128 characters', () => {
        const id = `com.example/${'a'.repeat(128)}`
        expect(id.length).toBeGreaterThan(128)
        expect(CapabilityIdSchema.safeParse(id).success).toBe(false)
    })

    it.each([
        'ruml: datapoints',
        'ruml :datapoints',
        'foo bar',
        '\truml:datapoints',
        'ruml:datapoints\n',
    ])('rejects id containing whitespace: %j', (id) => {
        expect(CapabilityIdSchema.safeParse(id).success).toBe(false)
    })

    it.each(['ruml:data!points', 'ruml:data@points', 'ruml:data#points'])(
        'rejects id with illegal character: %s',
        (id) => {
            expect(CapabilityIdSchema.safeParse(id).success).toBe(false)
        },
    )

    it.each(['ruml:unknown', 'ruml:foo', 'ruml:layout', 'ruml:texts'])(
        'rejects unknown ruml local name: %s',
        (id) => {
            expect(CapabilityIdSchema.safeParse(id).success).toBe(false)
        },
    )

    it.each(['ruml:Datapoints', 'ruml:DATAPOINTS', 'ruml:Layout'])(
        'is case-sensitive and rejects %s',
        (id) => {
            expect(CapabilityIdSchema.safeParse(id).success).toBe(false)
        },
    )

    it.each([
        'ruml:draft/foo',
        'ruml:draft/my-capability',
        'ruml:draft/some_name',
    ])('accepts ruml:draft/ id: %s', (id) => {
        expect(CapabilityIdSchema.safeParse(id).success).toBe(true)
    })

    it.each([
        'ruml:draft/',
        'ruml:draft',
        'ruml:draft/foo bar',
        'ruml:draft/Mixed-Case_99',
    ])('rejects malformed ruml:draft id: %j', (id) => {
        expect(CapabilityIdSchema.safeParse(id).success).toBe(false)
    })

    it.each([
        'com.example/foo',
        'org.acme/my-capability',
        'io.github.user/some_name',
        'a.b/x',
        'io.acme/v2/legal-refs',
    ])('accepts reverse-domain id: %s', (id) => {
        expect(CapabilityIdSchema.safeParse(id).success).toBe(true)
    })

    it.each([
        'noPrefix',
        'example/foo',
        'com.example',
        'com.example/',
        'com.example/foo/',
        '/foo',
        '.com/foo',
        'com./foo',
    ])('rejects malformed reverse-domain id: %j', (id) => {
        expect(CapabilityIdSchema.safeParse(id).success).toBe(false)
    })
})

describe('CapabilityEntrySchema', () => {
    it('accepts an entry with only an id', () => {
        expect(
            CapabilityEntrySchema.safeParse({ id: 'ruml:query' }).success,
        ).toBe(true)
    })

    it('accepts id, required and payload', () => {
        const result = CapabilityEntrySchema.safeParse({
            id: 'com.example/foo',
            required: true,
            role: 'data',
            payload: { data: { items: [] }, config: { mode: 'strict' } },
        })
        expect(result.success).toBe(true)
    })

    it.each(['data', 'decision', 'combiner', 'reaction'])(
        'accepts role %s on a non-official id',
        (role) => {
            expect(
                CapabilityEntrySchema.safeParse({ id: 'com.example/foo', role })
                    .success,
            ).toBe(true)
        },
    )

    it.each(['com.example/foo', 'ruml:draft/foo'])(
        'requires a role on the non-official id %s (CAP-03)',
        (id) => {
            expect(CapabilityEntrySchema.safeParse({ id }).success).toBe(false)
        },
    )

    it('rejects a role on an official id (CAP-05)', () => {
        expect(
            CapabilityEntrySchema.safeParse({
                id: 'ruml:query',
                role: 'decision',
            }).success,
        ).toBe(false)
    })

    it('rejects an unknown role and the former roles list', () => {
        expect(
            CapabilityEntrySchema.safeParse({
                id: 'com.example/foo',
                role: 'observer',
            }).success,
        ).toBe(false)
        expect(
            CapabilityEntrySchema.safeParse({
                id: 'com.example/foo',
                roles: ['data'],
            }).success,
        ).toBe(false)
        expect(
            CapabilityEntrySchema.safeParse({
                id: 'com.example/foo',
                role: ['data'],
            }).success,
        ).toBe(false)
    })

    it('rejects an entry without an id', () => {
        expect(CapabilityEntrySchema.safeParse({ payload: {} }).success).toBe(
            false,
        )
    })

    it('rejects unknown extra properties', () => {
        const result = CapabilityEntrySchema.safeParse({
            id: 'ruml:query',
            data: {},
        })
        expect(result.success).toBe(false)
    })
})

describe('NodeCapabilityEntrySchema', () => {
    it('rejects a required flag (root-only)', () => {
        const result = NodeCapabilityEntrySchema.safeParse({
            id: 'ruml:query',
            required: true,
            payload: { expression: 'true' },
        })
        expect(result.success).toBe(false)
    })
})

describe('CapabilitiesSchema', () => {
    it('accepts an empty list', () => {
        expect(CapabilitiesSchema.safeParse([]).success).toBe(true)
    })

    it('rejects the id-keyed object shape', () => {
        expect(
            CapabilitiesSchema.safeParse({ 'ruml:datapoints': {} }).success,
        ).toBe(false)
    })

    it('keeps entry order', () => {
        const ids = ['ruml:protocol', 'ruml:datapoints', 'com.example/foo']
        const result = CapabilitiesSchema.parse(ids.map(entryOf))
        expect(result.map((entry) => entry.id)).toEqual(ids)
    })

    it.each(['ruml:datapoints', 'ruml:draft/foo', 'com.example/foo'])(
        'accepts a valid id: %s',
        (id) => {
            expect(CapabilitiesSchema.safeParse([entryOf(id)]).success).toBe(
                true,
            )
        },
    )

    it.each(['ruml:unknown', 'noPrefix', 'ruml: datapoints', ''])(
        'rejects an invalid id: %j',
        (id) => {
            const result = CapabilitiesSchema.safeParse([{ id }])
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual([0, 'id'])
        },
    )

    it('rejects a duplicate id (CAP-10)', () => {
        const result = CapabilitiesSchema.safeParse([
            { id: 'ruml:query' },
            { id: 'ruml:datapoints' },
            { id: 'ruml:query' },
        ])
        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues[0]?.path).toEqual([2, 'id'])
    })

    it('accepts a generic payload on a reverse-domain id', () => {
        const result = CapabilitiesSchema.safeParse([
            {
                id: 'com.example/foo',
                role: 'data',
                payload: { data: { items: [] } },
            },
        ])
        expect(result.success).toBe(true)
    })

    it.each(['ruml:datapoints', 'ruml:ai-query', 'ruml:protocol'])(
        'rejects an unknown payload key on official id %s',
        (id) => {
            const result = CapabilitiesSchema.safeParse([
                { id, payload: { unknown: true } },
            ])
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual([0, 'payload'])
        },
    )

    describe('ruml:datapoints typed payload', () => {
        const datapoint = {
            name: 'Annual income',
            type: 'currency',
            unit: 'EUR',
            binding: { type: 'input' },
        }

        it('accepts a typed datapoint', () => {
            const result = CapabilitiesSchema.safeParse([
                {
                    id: 'ruml:datapoints',
                    payload: { data: { dp_income: datapoint } },
                },
            ])
            expect(result.success).toBe(true)
        })

        it('rejects generic, untyped data', () => {
            const result = CapabilitiesSchema.safeParse([
                { id: 'ruml:datapoints', payload: { data: { items: [] } } },
            ])
            expect(result.success).toBe(false)
        })

        it.each(['bad-key', 'dp-income'])(
            'rejects a malformed datapoint id key: %s',
            (key) => {
                const result = CapabilitiesSchema.safeParse([
                    {
                        id: 'ruml:datapoints',
                        payload: { data: { [key]: datapoint } },
                    },
                ])
                expect(result.success).toBe(false)
            },
        )

        it('reports an invalid datapoint at its path', () => {
            const result = CapabilitiesSchema.safeParse([
                {
                    id: 'ruml:datapoints',
                    payload: {
                        data: {
                            dp_income: { ...datapoint, type: 'not-a-type' },
                        },
                    },
                },
            ])
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual([
                0,
                'payload',
                'data',
                'dp_income',
                'type',
            ])
        })

        // §4.7 defines no `config` shape for ruml:datapoints.
        it('rejects a config field (spec §4.7 defines none)', () => {
            const result = CapabilitiesSchema.safeParse([
                {
                    id: 'ruml:datapoints',
                    payload: { config: { anything: true } },
                },
            ])
            expect(result.success).toBe(false)
        })

        it('accepts sets instantiated by an object datapoint', () => {
            const result = CapabilitiesSchema.safeParse([
                {
                    id: 'ruml:datapoints',
                    payload: {
                        data: {
                            dp_address: {
                                name: 'Address',
                                type: 'object',
                                set: 'set_address',
                                binding: { type: 'input' },
                            },
                        },
                        sets: {
                            set_address: {
                                name: 'Address',
                                fields: {
                                    dp_street: {
                                        name: 'Street',
                                        type: 'string',
                                        binding: { type: 'input' },
                                    },
                                },
                            },
                        },
                    },
                },
            ])
            expect(result.success).toBe(true)
        })

        it('rejects a malformed set id key', () => {
            const result = CapabilitiesSchema.safeParse([
                {
                    id: 'ruml:datapoints',
                    payload: { sets: { address: { name: 'A', fields: {} } } },
                },
            ])
            expect(result.success).toBe(false)
        })

        it('rejects an object datapoint without a set', () => {
            const result = CapabilitiesSchema.safeParse([
                {
                    id: 'ruml:datapoints',
                    payload: {
                        data: {
                            dp_address: {
                                name: 'Address',
                                type: 'object',
                                binding: { type: 'input' },
                            },
                        },
                    },
                },
            ])
            expect(result.success).toBe(false)
        })
    })

    describe('ruml:text-reference typed payload', () => {
        // The type-specific carriers (text/url/containerPath/ref) may all be
        // present; the if/then conditionals only add requirements per `type`.
        const text = {
            title: '§ 823 BGB',
            uri: 'https://www.gesetze-im-internet.de/bgb/__823.html',
            timestamp: '2024-01-01T00:00:00Z',
            status: 'inForce',
            type: 'embedded',
            text: 'Wer vorsätzlich oder fahrlässig...',
            url: 'https://www.gesetze-im-internet.de/bgb/__823.html',
            containerPath: '.texts/bgb-823.txt',
            ref: 'bgb:823',
            version: '2002-01-01',
            validFrom: '2002-01-01T00:00:00Z',
            validUntil: '2030-12-31T23:59:59Z',
            language: 'de',
            isReferenced: true,
        }

        it('accepts a text entry with every field populated', () => {
            const result = CapabilitiesSchema.safeParse([
                {
                    id: 'ruml:text-reference',
                    payload: { data: { text_bgb_823: text } },
                },
            ])
            expect(result.success).toBe(true)
        })

        it('reports an invalid text under the entry payload', () => {
            const result = CapabilitiesSchema.safeParse([
                {
                    id: 'ruml:text-reference',
                    payload: {
                        data: { text_bgb_823: { ...text, status: 'unknown' } },
                    },
                },
            ])
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path.slice(0, 4)).toEqual([
                0,
                'payload',
                'data',
                'text_bgb_823',
            ])
        })
    })

    describe('ruml:context typed payload', () => {
        const context = {
            title: 'BGH zur Auslegung des Wohnsitzbegriffs',
            category: 'courtDecision',
            type: 'embedded',
            timestamp: '2024-01-15T10:00:00Z',
        }

        it('accepts a typed context', () => {
            const result = CapabilitiesSchema.safeParse([
                {
                    id: 'ruml:context',
                    payload: { data: { ctx_bgh_2024: context } },
                },
            ])
            expect(result.success).toBe(true)
        })

        it.each(['bad-key', 'ctx-bgh-2024'])(
            'rejects a malformed context id key: %s',
            (key) => {
                const result = CapabilitiesSchema.safeParse([
                    {
                        id: 'ruml:context',
                        payload: { data: { [key]: context } },
                    },
                ])
                expect(result.success).toBe(false)
            },
        )

        it('reports an invalid context under the entry payload', () => {
            const result = CapabilitiesSchema.safeParse([
                {
                    id: 'ruml:context',
                    payload: {
                        data: {
                            ctx_bgh_2024: { ...context, category: 'nope' },
                        },
                    },
                },
            ])
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path.slice(0, 4)).toEqual([
                0,
                'payload',
                'data',
                'ctx_bgh_2024',
            ])
        })
    })

    // §4.9 "Root-Level Declaration": ruml:ai-query carries no `data`, but its
    // payload may type a `config.systemPrompt`.
    describe('ruml:ai-query root config', () => {
        it('accepts an empty declaration', () => {
            expect(
                CapabilitiesSchema.safeParse([{ id: 'ruml:ai-query' }]).success,
            ).toBe(true)
        })

        it('accepts a config with a systemPrompt', () => {
            const result = CapabilitiesSchema.safeParse([
                {
                    id: 'ruml:ai-query',
                    payload: { config: { systemPrompt: 'You are a judge.' } },
                },
            ])
            expect(result.success).toBe(true)
        })

        it('rejects an unknown config key', () => {
            const result = CapabilitiesSchema.safeParse([
                {
                    id: 'ruml:ai-query',
                    payload: { config: { unknown: 'foo' } },
                },
            ])
            expect(result.success).toBe(false)
        })

        it('rejects a data field', () => {
            const result = CapabilitiesSchema.safeParse([
                { id: 'ruml:ai-query', payload: { data: {} } },
            ])
            expect(result.success).toBe(false)
        })

        it('rejects a non-string systemPrompt at its path', () => {
            const result = CapabilitiesSchema.safeParse([
                {
                    id: 'ruml:ai-query',
                    payload: { config: { systemPrompt: 42 } },
                },
            ])
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual([
                0,
                'payload',
                'config',
                'systemPrompt',
            ])
        })
    })

    // §4.13
    describe('ruml:protocol root config', () => {
        it('accepts a required declaration with a level', () => {
            const result = CapabilitiesSchema.safeParse([
                {
                    id: 'ruml:protocol',
                    required: true,
                    payload: { config: { level: 'verbose' } },
                },
            ])
            expect(result.success).toBe(true)
        })

        it('rejects an unknown level at its path', () => {
            const result = CapabilitiesSchema.safeParse([
                { id: 'ruml:protocol', payload: { config: { level: 'loud' } } },
            ])
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual([
                0,
                'payload',
                'config',
                'level',
            ])
        })
    })
})

describe('NodeCapabilitiesSchema', () => {
    it('accepts a typed payload', () => {
        const result = NodeCapabilitiesSchema.safeParse([
            { id: 'ruml:query', payload: { expression: 'dp_age >= 18' } },
        ])
        expect(result.success).toBe(true)
    })

    it('accepts any payload object on a generic capability id', () => {
        const result = NodeCapabilitiesSchema.safeParse([
            {
                id: 'ruml:draft/ai-annotations',
                payload: {
                    annotations: [
                        { type: 'confidence', value: 0.92 },
                        { type: 'source', value: 'gpt-4o' },
                    ],
                },
            },
            { id: 'com.acme/reviewed', payload: { reviewed: true } },
        ])
        expect(result.success).toBe(true)
    })

    it.each([true, 0.97, 'approved', null, []])(
        'rejects a non-object payload: %j',
        (payload) => {
            const result = NodeCapabilitiesSchema.safeParse([
                { id: 'com.acme/reviewed', payload },
            ])
            expect(result.success).toBe(false)
        },
    )

    it('rejects an invalid capability id', () => {
        const result = NodeCapabilitiesSchema.safeParse([
            { id: 'ruml:unknown', payload: { expression: 'x' } },
        ])
        expect(result.success).toBe(false)
    })

    it('rejects a repeated data capability id (CAP-06)', () => {
        const result = NodeCapabilitiesSchema.safeParse([
            { id: 'ruml:context', payload: { refs: ['ctx_a'] } },
            { id: 'ruml:context', payload: { refs: ['ctx_b'] } },
        ])
        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues[0]?.path).toEqual([1, 'id'])
    })

    it('rejects a repeated combiner capability id (OP-02)', () => {
        const expression = (text: string) => ({
            id: 'ruml:expression',
            payload: { expression: text, description: 'rule' },
        })
        const result = NodeCapabilitiesSchema.safeParse([
            expression('$count($children[status = "true"]) >= 2'),
            expression('$count($children[status = "true"]) >= 3'),
        ])
        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues[0]?.path).toEqual([1, 'id'])
    })

    it('accepts repeated decision and reaction capability ids (CAP-06)', () => {
        const action = { operation: 'createDocument', ref: 'document-service' }
        const result = NodeCapabilitiesSchema.safeParse([
            { id: 'ruml:query', payload: { expression: 'true' } },
            { id: 'ruml:query', payload: { expression: 'false' } },
            { id: 'ruml:actions', payload: { onTrue: action } },
            { id: 'ruml:actions', payload: { onFalse: action } },
        ])
        expect(result.success).toBe(true)
    })

    it.each([
        [{ id: 'ruml:protocol', payload: {} }],
        [{ id: 'ruml:protocol' }],
    ])('rejects ruml:protocol on a node (CAP-18): %j', (entry) => {
        expect(NodeCapabilitiesSchema.safeParse([entry]).success).toBe(false)
    })

    it.each(['ruml:query', 'ruml:context', 'com.acme/reviewed'])(
        'rejects an entry of %s without payload (CAP-17)',
        (id) => {
            expect(NodeCapabilitiesSchema.safeParse([{ id }]).success).toBe(
                false,
            )
        },
    )

    // §4.10
    describe('ruml:actions typed payload', () => {
        const actions = {
            onTrue: { operation: 'createDocument', ref: 'document-service' },
        }

        it('accepts a typed actions payload', () => {
            expect(
                NodeCapabilitiesSchema.safeParse([
                    { id: 'ruml:actions', payload: actions },
                ]).success,
            ).toBe(true)
        })

        it('rejects an actions payload with no on* branch', () => {
            const result = NodeCapabilitiesSchema.safeParse([
                { id: 'ruml:actions', payload: { description: 'no reaction' } },
            ])
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path.slice(0, 2)).toEqual([
                0,
                'payload',
            ])
        })

        it('reports an invalid nested action at its path', () => {
            const result = NodeCapabilitiesSchema.safeParse([
                {
                    id: 'ruml:actions',
                    payload: { onTrue: { operation: 'createDocument' } },
                },
            ])
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual([
                0,
                'payload',
                'onTrue',
                'ref',
            ])
        })
    })

    // §4.11
    describe('ruml:context typed payload', () => {
        it('accepts a refs payload', () => {
            expect(
                NodeCapabilitiesSchema.safeParse([
                    { id: 'ruml:context', payload: { refs: ['ctx_guidance'] } },
                ]).success,
            ).toBe(true)
        })

        it('reports an empty refs payload at its path', () => {
            const result = NodeCapabilitiesSchema.safeParse([
                { id: 'ruml:context', payload: { refs: [] } },
            ])
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual([0, 'payload', 'refs'])
        })
    })

    // §4.12
    describe('ruml:text-reference typed payload', () => {
        it('accepts a refs payload', () => {
            expect(
                NodeCapabilitiesSchema.safeParse([
                    {
                        id: 'ruml:text-reference',
                        payload: {
                            refs: [{ id: 'text_bgb_823', type: 'refers-to' }],
                        },
                    },
                ]).success,
            ).toBe(true)
        })

        it('rejects the removed normRef payload', () => {
            expect(
                NodeCapabilitiesSchema.safeParse([
                    {
                        id: 'ruml:text-reference',
                        payload: { normRef: { id: 'text_bgb_823' } },
                    },
                ]).success,
            ).toBe(false)
        })

        it('rejects a payload without refs', () => {
            const result = NodeCapabilitiesSchema.safeParse([
                { id: 'ruml:text-reference', payload: {} },
            ])
            expect(result.success).toBe(false)
        })

        it('reports an empty refs payload under the entry payload', () => {
            const result = NodeCapabilitiesSchema.safeParse([
                { id: 'ruml:text-reference', payload: { refs: [] } },
            ])
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path.slice(0, 2)).toEqual([
                0,
                'payload',
            ])
        })

        it('reports an invalid ref id at its path', () => {
            const result = NodeCapabilitiesSchema.safeParse([
                {
                    id: 'ruml:text-reference',
                    payload: {
                        refs: [{ id: 'text-bgb-823', type: 'refers-to' }],
                    },
                },
            ])
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path.map(String)).toEqual([
                '0',
                'payload',
                'refs',
                '0',
                'id',
            ])
        })
    })

    describe('ruml:query typed payload', () => {
        it('accepts a valid query payload', () => {
            const result = NodeCapabilitiesSchema.safeParse([
                { id: 'ruml:query', payload: { expression: 'dp_age >= 18' } },
            ])
            expect(result.success).toBe(true)
        })

        it('rejects a query payload missing the expression', () => {
            const result = NodeCapabilitiesSchema.safeParse([
                { id: 'ruml:query', payload: { description: 'no expression' } },
            ])
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual([
                0,
                'payload',
                'expression',
            ])
        })
    })
})

describe('registries', () => {
    it('route every official root payload', () => {
        expect(Object.keys(CORE_ROOT_CAPABILITY_VALUE_SCHEMAS).sort()).toEqual([
            'ruml:actions',
            'ruml:ai-query',
            'ruml:context',
            'ruml:datapoints',
            'ruml:expression',
            'ruml:protocol',
            'ruml:query',
            'ruml:text-reference',
        ])
    })

    it('route every official node payload', () => {
        expect(Object.keys(TYPED_NODE_CAPABILITY_VALUE_SCHEMAS).sort()).toEqual(
            [
                'ruml:actions',
                'ruml:ai-query',
                'ruml:context',
                'ruml:expression',
                'ruml:query',
                'ruml:text-reference',
                'ruml:tree-include',
                'ruml:tree-reference',
            ],
        )
    })

    it('validate an externally registered root payload', () => {
        const schema = buildCapabilitiesSchema({
            ...CORE_ROOT_CAPABILITY_VALUE_SCHEMAS,
            'com.acme/review': z.strictObject({ reviewer: z.string() }),
        })
        expect(
            schema.safeParse([
                {
                    id: 'com.acme/review',
                    role: 'data',
                    payload: { reviewer: 'Ada' },
                },
            ]).success,
        ).toBe(true)
        const result = schema.safeParse([
            { id: 'com.acme/review', role: 'data', payload: { reviewer: 1 } },
        ])
        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues[0]?.path).toEqual([0, 'payload', 'reviewer'])
    })

    it('validate an externally registered node payload', () => {
        const schema = buildNodeCapabilitiesSchema({
            ...TYPED_NODE_CAPABILITY_VALUE_SCHEMAS,
            'com.acme/review': z.strictObject({ score: z.number() }),
        })
        expect(
            schema.safeParse([
                { id: 'com.acme/review', payload: { score: 'x' } },
            ]).success,
        ).toBe(false)
    })

    it.each(['com.acme/unknown', 'com.my_co/foo', 'ruml:draft/a/b'])(
        'reject an unregistered required %s when asked to',
        (id) => {
            const schema = buildCapabilitiesSchema(
                CORE_ROOT_CAPABILITY_VALUE_SCHEMAS,
                { rejectUnregisteredRequired: true },
            )
            const result = schema.safeParse([
                { id, role: 'data', required: true },
            ])
            expect(result.success).toBe(false)
            if (result.success) return
            expect(result.error.issues[0]?.path).toEqual([0])
            expect(
                schema.safeParse([{ id, role: 'data', required: false }])
                    .success,
            ).toBe(true)
        },
    )

    it('reject a duplicate id at root level (CAP-10)', () => {
        const schema = buildCapabilitiesSchema(
            CORE_ROOT_CAPABILITY_VALUE_SCHEMAS,
        )
        const entry = { id: 'com.acme/a', role: 'decision', payload: {} }
        expect(schema.safeParse([entry]).success).toBe(true)
        const result = schema.safeParse([entry, entry])
        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.error.issues[0]?.path).toEqual([1, 'id'])
    })

    it('reject a duplicate data id at node level (CAP-06)', () => {
        const schema = buildNodeCapabilitiesSchema(
            TYPED_NODE_CAPABILITY_VALUE_SCHEMAS,
        )
        const result = schema.safeParse([
            { id: 'ruml:text-reference', payload: { refs: [] } },
            { id: 'ruml:text-reference', payload: { refs: [] } },
        ])
        expect(result.success).toBe(false)
    })

    // The role of a non-official id is declared at root, which a node list
    // alone does not see; RUMLSchema judges it (see ruml.test.ts).
    it('do not judge a repeated non-official id on a standalone node list', () => {
        const schema = buildNodeCapabilitiesSchema(
            TYPED_NODE_CAPABILITY_VALUE_SCHEMAS,
        )
        expect(
            schema.safeParse([
                { id: 'com.acme/a', payload: { n: 1 } },
                { id: 'com.acme/a', payload: { n: 2 } },
            ]).success,
        ).toBe(true)
    })
})

describe('entry accessors', () => {
    const capabilities = CapabilitiesSchema.parse([
        { id: 'ruml:datapoints', payload: { data: {} } },
        { id: 'com.acme/review', role: 'data', payload: { reviewer: 'Ada' } },
    ])
    const nodeCapabilities = NodeCapabilitiesSchema.parse([
        { id: 'ruml:query', payload: { expression: 'true' } },
    ])

    it('findCapability returns the entry with the id', () => {
        expect(findCapability(capabilities, 'com.acme/review')).toEqual({
            id: 'com.acme/review',
            role: 'data',
            payload: { reviewer: 'Ada' },
            required: false,
        })
        expect(findCapability(capabilities, 'ruml:context')).toBeUndefined()
        expect(findCapability(undefined, 'ruml:context')).toBeUndefined()
    })

    it('capabilityPayload returns the payload', () => {
        expect(capabilityPayload(capabilities, 'ruml:datapoints')).toEqual({
            data: {},
        })
        expect(capabilityPayload(capabilities, 'ruml:context')).toBeUndefined()
    })

    it('nodeCapabilityPayload returns the node payload', () => {
        expect(
            nodeCapabilityPayload(nodeCapabilities, 'ruml:query')?.expression,
        ).toBe('true')
    })

    it('duplicateCapabilityIds lists each repeated id once', () => {
        expect(
            duplicateCapabilityIds([
                { id: 'a' },
                { id: 'b' },
                { id: 'a' },
                { id: 'a' },
            ]),
        ).toEqual(['a'])
        expect(duplicateCapabilityIds(undefined)).toEqual([])
    })

    it('nodeCapabilityPayloads returns the payload of every entry', () => {
        const repeated = NodeCapabilitiesSchema.parse([
            { id: 'ruml:query', payload: { expression: 'true' } },
            { id: 'ruml:query', payload: { expression: 'false' } },
        ])
        expect(
            nodeCapabilityPayloads(repeated, 'ruml:query').map(
                (payload) => payload.expression,
            ),
        ).toEqual(['true', 'false'])
        expect(nodeCapabilityPayloads(repeated, 'ruml:actions')).toEqual([])
        expect(nodeCapabilityPayloads(undefined, 'ruml:query')).toEqual([])
    })

    it('capabilityRole is fixed for official ids and declared for others', () => {
        expect(capabilityRole(capabilities, 'ruml:tree-include')).toBe(
            'decision',
        )
        expect(capabilityRole(capabilities, 'ruml:expression')).toBe('combiner')
        expect(capabilityRole(capabilities, 'com.acme/review')).toBe('data')
        expect(capabilityRole(capabilities, 'com.acme/other')).toBeUndefined()
        expect(Object.keys(OFFICIAL_CAPABILITY_ROLES).sort()).toEqual(
            [...OFFICIAL_RUML_CAPABILITY_IDS].sort(),
        )
    })

    it('duplicateNodeCapabilityIds lists repeated data and combiner ids', () => {
        const entries = [
            'ruml:context',
            'ruml:context',
            'ruml:query',
            'ruml:query',
            'com.acme/review',
            'com.acme/review',
            'com.acme/other',
            'com.acme/other',
        ].map((id) => ({ id }))
        expect(duplicateNodeCapabilityIds(entries)).toEqual(['ruml:context'])
        expect(duplicateNodeCapabilityIds(entries, capabilities)).toEqual([
            'ruml:context',
            'com.acme/review',
        ])
    })
})
