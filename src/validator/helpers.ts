// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import { z, type ZodError } from 'zod'
import {
    rumlJsonSchemaDocument,
    zodFromJsonSchema,
} from '../conversion/from-json-schema'
import {
    CORE_ROOT_CAPABILITY_VALUE_SCHEMAS,
    isUnregisteredRequiredCapability,
    TYPED_NODE_CAPABILITY_VALUE_SCHEMAS,
    unregisteredRequiredCapabilityMessage,
    type CapabilityValueRegistry,
} from '../capabilities/registry'
import { applyRumlRefinements } from '../ruml'
import type { RumlBase } from '../document/document'
import type { RumlWarning } from '../rules/refinements'
import type { CapabilityDefinition, RumlValidationIssue } from './types'

// Merges the core registries with the supplied external definitions. Supplying
// a `ruml:`-namespaced id is rejected: that prefix is reserved (spec §4.4), so
// callers must not override or squat core capabilities.
export const buildRegistries = (
    supportedCapabilities: CapabilityDefinition[],
): CapabilityRegistries => {
    const root: CapabilityValueRegistry = {
        ...CORE_ROOT_CAPABILITY_VALUE_SCHEMAS,
    }
    const node: CapabilityValueRegistry = {
        ...TYPED_NODE_CAPABILITY_VALUE_SCHEMAS,
    }

    for (const definition of supportedCapabilities) {
        if (definition.id.startsWith(RESERVED_CAPABILITY_PREFIX)) {
            throw new Error(
                `capability id "${definition.id}" uses the reserved "ruml:" prefix and cannot be supplied as an external capability`,
            )
        }
        if (definition.rootValueSchema) {
            root[definition.id] = definition.rootValueSchema
        }
        if (definition.nodeValueSchema) {
            node[definition.id] = definition.nodeValueSchema
        }
    }

    return { root, node }
}

type JsonNode = Record<string, unknown>

// Splice each external capability's payload schema into the document's `$defs`
// and route it from `targetDefName` (CapabilityEntry or NodeCapabilityEntry)
// with the same `if id const … then payload $ref …` member the core ids use.
// External schemas arrive as Zod (CapabilityDefinition) and are converted via
// `z.toJSONSchema` — the reverse of the core direction, so external plug-ins
// keep their Zod authoring API.
const injectExternalRoutes = (
    $defs: Record<string, JsonNode>,
    targetDefName: string,
    registry: CapabilityValueRegistry,
    coreRegistry: CapabilityValueRegistry,
    defPrefix: string,
) => {
    const target = $defs[targetDefName]
    if (!target) {
        throw new Error(`No $defs.${targetDefName} in the RUML JSON schema`)
    }
    const routes = [...((target.allOf as JsonNode[] | undefined) ?? [])]
    for (const [id, schema] of Object.entries(registry)) {
        if (coreRegistry[id]) continue // core ids are already routed
        const defName = `${defPrefix}${id.replace(/[^A-Za-z0-9]+/g, '_')}`
        const {
            $schema: _schema,
            $defs: nestedDefs = {},
            ...valueDef
        } = z.toJSONSchema(schema, {
            target: 'draft-2020-12',
            io: 'input',
            override(ctx) {
                delete ctx.jsonSchema.id
            },
        }) as JsonNode & { $defs?: Record<string, JsonNode> }
        $defs[defName] = valueDef
        for (const [name, def] of Object.entries(nestedDefs)) {
            if (!$defs[name]) $defs[name] = def
        }
        routes.push({
            title: `payload of ${id}`,
            if: { required: ['id'], properties: { id: { const: id } } },
            then: { properties: { payload: { $ref: `#/$defs/${defName}` } } },
        })
    }
    target.allOf = routes
}

// Composes a full RUML schema whose capability values route through the merged
// registry — external routes are injected into a clone of the JSON Schema
// document, converted, and refined on the SAME path as the core `RUMLSchema`,
// so core and external capabilities validate identically.
export const buildRumlSchema = (
    { root, node }: CapabilityRegistries,
    refinementOptions: Parameters<typeof applyRumlRefinements>[1] = {},
) => {
    const doc = JSON.parse(
        JSON.stringify(rumlJsonSchemaDocument),
    ) as JsonNode & { $defs: Record<string, JsonNode> }
    injectExternalRoutes(
        doc.$defs,
        'CapabilityEntry',
        root,
        CORE_ROOT_CAPABILITY_VALUE_SCHEMAS,
        'ExternalRoot',
    )
    injectExternalRoutes(
        doc.$defs,
        'NodeCapabilityEntry',
        node,
        TYPED_NODE_CAPABILITY_VALUE_SCHEMAS,
        'ExternalNode',
    )

    // CAP-01: a required draft or reverse-domain capability we have no schema
    // for is rejected — nothing can validate it. Registry-dependent, so it
    // lives here rather than in the schema document.
    const knownCapabilityIds = new Set([
        ...Object.keys(root),
        ...Object.keys(node),
    ])
    const base = (zodFromJsonSchema(doc) as z.ZodType<RumlBase>).superRefine(
        (rumlDoc, ctx) => {
            for (const [index, entry] of (
                rumlDoc.capabilities ?? []
            ).entries()) {
                if (
                    isUnregisteredRequiredCapability(entry, knownCapabilityIds)
                ) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['capabilities', index],
                        message: unregisteredRequiredCapabilityMessage(
                            entry.id,
                        ),
                    })
                }
            }
        },
    )
    return applyRumlRefinements(base, refinementOptions)
}

export const toErrors = (error: ZodError): RumlValidationIssue[] =>
    error.issues.map((issue) => ({
        message: issue.message,
        path: toPath(issue.path),
    }))

export const toWarnings = (warnings: RumlWarning[]): RumlValidationIssue[] =>
    warnings.map((warning) => ({
        message: warning.message,
        path: toPath(warning.path),
    }))

const RESERVED_CAPABILITY_PREFIX = 'ruml:'

type CapabilityRegistries = {
    root: CapabilityValueRegistry
    node: CapabilityValueRegistry
}

const toPath = (path: ReadonlyArray<PropertyKey>): string =>
    path.map(String).join('.')
