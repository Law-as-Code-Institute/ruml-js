// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest'
import { RUMLSchema } from '../ruml'
import {
    TYPED_NODE_CAPABILITY_VALUE_SCHEMAS,
    nodeCapabilityPayload,
} from './registry'
import { TreeIncludeNodeSchema, TreeReferencesNodeSchema } from './values'

const GMBHG = 'https://rulemapping.org/rulemapping/gmbhg:2025-01-01'
const anchor = (nodeId: string) => `${GMBHG}#node/${nodeId}`
const LAW_NODE = '6e51c5a6-f7ff-43e1-b211-c70bd69937d7'
const OTHER_LAW_NODE = '7791005b-3d30-455b-a538-6d96f04680d9'

const treeDoc = (
    nodeCapabilities: unknown[],
    node: Record<string, unknown> = {},
) => ({
    $format: 'RUML',
    $specVersion: '1.0',
    metadata: {
        id: '415729b7-293c-421d-adde-0bb209a9c9a9',
        version: '1.0.0',
        created: '2025-01-01T00:00:00.000Z',
        modified: '2025-01-01T00:00:00.000Z',
        status: 'review',
    },
    capabilities: [
        { id: 'ruml:tree-reference' },
        { id: 'ruml:tree-include' },
    ] as unknown[],
    rulemap: {
        nodes: {
            '1': {
                id: '6d42c343-376d-4a7d-98aa-06a0b0789c43',
                label: 'Gesellschaftsvertrag notariell beurkundet',
                capabilities: nodeCapabilities,
                ...node,
            },
            '2': {
                id: '9f1b6f2e-5d0c-4c47-9a57-2f0b1c7c3e11',
                label: 'Child',
            },
        },
    },
})

const reference = (payload: unknown) => ({
    id: 'ruml:tree-reference',
    payload,
})
const include = (nodeId: string = LAW_NODE) => ({
    id: 'ruml:tree-include',
    payload: { uri: anchor(nodeId) },
})

describe('TreeReferencesNodeSchema', () => {
    it.each([
        ['represents', { represents: { uri: anchor(LAW_NODE) } }],
        ['refersTo', { refersTo: [{ uri: anchor(LAW_NODE) }] }],
        [
            'several refersTo next to one represents',
            {
                represents: { uri: anchor(LAW_NODE) },
                refersTo: [
                    { uri: anchor(OTHER_LAW_NODE) },
                    { uri: anchor('0b0f4a55-7a3b-4f0e-8a3e-2f6f3f0f2c11') },
                ],
            },
        ],
    ])('accepts %s', (_label, payload) => {
        expect(TreeReferencesNodeSchema.safeParse(payload).success).toBe(true)
    })

    it.each([
        ['an empty payload', {}],
        ['an empty refersTo list', { refersTo: [] }],
        ['a represents list', { represents: [{ uri: anchor(LAW_NODE) }] }],
        [
            'an entry with a type',
            { refersTo: [{ uri: anchor(LAW_NODE), type: 'refers-to' }] },
        ],
        ['an entry without uri', { refersTo: [{}] }],
        [
            'the same uri twice in refersTo',
            {
                refersTo: [
                    { uri: anchor(LAW_NODE) },
                    { uri: anchor(LAW_NODE) },
                ],
            },
        ],
        [
            'a same-document anchor',
            { refersTo: [{ uri: `#node/${LAW_NODE}` }] },
        ],
        [
            'an anchor without a node path',
            { refersTo: [{ uri: `${GMBHG}#ruml:text-reference/x` }] },
        ],
        [
            'the former refs list',
            { refs: [{ uri: anchor(LAW_NODE), type: 'refers-to' }] },
        ],
        ['an includes field', { includes: { uri: anchor(LAW_NODE) } }],
    ])('rejects %s', (_label, payload) => {
        expect(TreeReferencesNodeSchema.safeParse(payload).success).toBe(false)
    })
})

describe('TreeIncludeNodeSchema', () => {
    it('accepts a node anchor', () => {
        expect(
            TreeIncludeNodeSchema.safeParse({ uri: anchor(LAW_NODE) }).success,
        ).toBe(true)
    })

    it.each([
        ['an empty payload', {}],
        ['a same-document anchor', { uri: `#node/${LAW_NODE}` }],
        [
            'an anchor without a node path',
            { uri: `${GMBHG}#ruml:text-reference/x` },
        ],
        ['an unknown field', { uri: anchor(LAW_NODE), type: 'includes' }],
    ])('rejects %s', (_label, payload) => {
        expect(TreeIncludeNodeSchema.safeParse(payload).success).toBe(false)
    })

    it('is the registered node payload of ruml:tree-include', () => {
        const schema = TYPED_NODE_CAPABILITY_VALUE_SCHEMAS['ruml:tree-include']
        expect(schema?.safeParse({ uri: anchor(LAW_NODE) }).success).toBe(true)
        expect(schema?.safeParse({}).success).toBe(false)
    })
})

describe('ruml:tree-reference in a document', () => {
    const refersTo = reference({ refersTo: [{ uri: anchor(LAW_NODE) }] })

    it('accepts a declared reference', () => {
        expect(RUMLSchema.safeParse(treeDoc([refersTo])).success).toBe(true)
    })

    it('rejects a payload at the root', () => {
        const doc = treeDoc([refersTo])
        doc.capabilities = [
            { id: 'ruml:tree-reference', payload: { data: {} } },
        ]
        expect(RUMLSchema.safeParse(doc).success).toBe(false)
    })

    it('rejects a node entry without payload', () => {
        expect(
            RUMLSchema.safeParse(treeDoc([{ id: 'ruml:tree-reference' }]))
                .success,
        ).toBe(false)
    })

    it('rejects two ruml:tree-reference entries on one node', () => {
        expect(
            RUMLSchema.safeParse(
                treeDoc([
                    reference({ represents: { uri: anchor(LAW_NODE) } }),
                    reference({ refersTo: [{ uri: anchor(OTHER_LAW_NODE) }] }),
                ]),
            ).success,
        ).toBe(false)
    })

    it('keeps children allowed for a node that only refers to another file', () => {
        expect(
            RUMLSchema.safeParse(
                treeDoc([refersTo], { operator: 'AND', children: ['2'] }),
            ).success,
        ).toBe(true)
    })

    it('reads the typed payload', () => {
        const parsed = RUMLSchema.parse(
            treeDoc([reference({ represents: { uri: anchor(LAW_NODE) } })]),
        )
        expect(
            nodeCapabilityPayload(
                parsed.rulemap.nodes['1']?.capabilities,
                'ruml:tree-reference',
            )?.represents?.uri,
        ).toBe(anchor(LAW_NODE))
    })
})

describe('ruml:tree-include in a document', () => {
    it('accepts an including node without children', () => {
        expect(RUMLSchema.safeParse(treeDoc([include()])).success).toBe(true)
    })

    it('rejects an including node with children', () => {
        expect(
            RUMLSchema.safeParse(
                treeDoc([include()], { operator: 'AND', children: ['2'] }),
            ).success,
        ).toBe(false)
    })

    it('rejects a payload at the root', () => {
        const doc = treeDoc([include()])
        doc.capabilities = [
            { id: 'ruml:tree-include', payload: { uri: anchor(LAW_NODE) } },
        ]
        expect(RUMLSchema.safeParse(doc).success).toBe(false)
    })

    it('rejects a node entry without payload', () => {
        expect(
            RUMLSchema.safeParse(treeDoc([{ id: 'ruml:tree-include' }]))
                .success,
        ).toBe(false)
    })

    it('rejects an undeclared ruml:tree-include', () => {
        const doc = treeDoc([include()])
        doc.capabilities = [{ id: 'ruml:tree-reference' }]
        expect(RUMLSchema.safeParse(doc).success).toBe(false)
    })

    it('rejects represents next to an include (TREE-08)', () => {
        expect(
            RUMLSchema.safeParse(
                treeDoc([
                    include(),
                    reference({ represents: { uri: anchor(OTHER_LAW_NODE) } }),
                ]),
            ).success,
        ).toBe(false)
    })

    it('accepts refersTo next to an include', () => {
        expect(
            RUMLSchema.safeParse(
                treeDoc([
                    include(),
                    reference({ refersTo: [{ uri: anchor(OTHER_LAW_NODE) }] }),
                ]),
            ).success,
        ).toBe(true)
    })

    it('accepts two includes on one node (a decision id may repeat)', () => {
        expect(
            RUMLSchema.safeParse(
                treeDoc([include(), include(OTHER_LAW_NODE)], {
                    decisionMode: 'agreement',
                }),
            ).success,
        ).toBe(true)
    })
})
