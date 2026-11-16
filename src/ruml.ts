// SPDX-FileCopyrightText: 2026 Rulemapping Group GmbH
// SPDX-License-Identifier: Apache-2.0
import type { z } from 'zod'
import { zodFromRumlJsonSchema } from './conversion/from-json-schema'
import type { RumlBase } from './document/document'
import {
    aiQueryContextResolvesToRootData,
    aiQueryDatapointsDeclared,
    aiQueryTextsDeclared,
    capabilityIdsUnique,
    combinersHaveDescription,
    combinersOnlyOnDelegatedNodes,
    contextRefsResolveToRootData,
    datapointSetsResolve,
    decisionNodesAreLeaves,
    delegatedNodesHaveOneCombiner,
    type ExpressionReads,
    metadataExpired,
    metadataTimestamps,
    metadataValidity,
    nodeCapabilitiesDeclaredAtRoot,
    nodeTextReferencesResolveToRootData,
    noNodeCapabilitiesWhenRootEmpty,
    operatorUndefinedOnlyInDraft,
    repeatedNodesAreModular,
    undeclaredExpressionReads,
    validityPeriodsOrdered,
} from './rules/refinements'

export type { ExpressionReads } from './rules/refinements'

// Cross-document refinements (referential integrity, status/operator rules).
// These are the semantic rules JSON Schema cannot express — every RUML
// implementation carries its own copy (spec prose is normative). Extracted so
// the `Validator` can apply the SAME refinements to a schema built from a
// custom capability registry.
export const applyRumlRefinements = <S extends z.ZodType<RumlBase>>(
    schema: S,
    { expressionReads }: { expressionReads?: ExpressionReads } = {},
) =>
    schema
        .refine(
            operatorUndefinedOnlyInDraft.check,
            operatorUndefinedOnlyInDraft.options,
        )
        .refine(
            nodeCapabilitiesDeclaredAtRoot.check,
            nodeCapabilitiesDeclaredAtRoot.options,
        )
        .refine(capabilityIdsUnique.check, capabilityIdsUnique.options)
        .refine(
            noNodeCapabilitiesWhenRootEmpty.check,
            noNodeCapabilitiesWhenRootEmpty.options,
        )
        .refine(
            contextRefsResolveToRootData.check,
            contextRefsResolveToRootData.options,
        )
        .refine(
            nodeTextReferencesResolveToRootData.check,
            nodeTextReferencesResolveToRootData.options,
        )
        .refine(decisionNodesAreLeaves.check, decisionNodesAreLeaves.options)
        .refine(
            delegatedNodesHaveOneCombiner.check,
            delegatedNodesHaveOneCombiner.options,
        )
        .refine(
            combinersOnlyOnDelegatedNodes.check,
            combinersOnlyOnDelegatedNodes.options,
        )
        .refine(
            combinersHaveDescription.check,
            combinersHaveDescription.options,
        )
        .refine(repeatedNodesAreModular.check, repeatedNodesAreModular.options)
        .superRefine((doc, ctx) => {
            for (const issue of undeclaredExpressionReads(
                doc,
                expressionReads,
            )) {
                ctx.addIssue({ code: 'custom', ...issue })
            }
        })
        .refine(datapointSetsResolve.check, datapointSetsResolve.options)
        .refine(
            aiQueryContextResolvesToRootData.check,
            aiQueryContextResolvesToRootData.options,
        )
        .refine(
            aiQueryDatapointsDeclared.check,
            aiQueryDatapointsDeclared.options,
        )
        .refine(aiQueryTextsDeclared.check, aiQueryTextsDeclared.options)
        .refine(metadataTimestamps.check, metadataTimestamps.options)
        .refine(metadataValidity.check, metadataValidity.options)
        .refine(metadataExpired.check, metadataExpired.options)
        .refine(validityPeriodsOrdered.check, validityPeriodsOrdered.options)

// The exported model — derived from schema/ruml.schema.json (structure via
// zod-from-json-schema, formats/backstop via AJV), plus the semantic-rule refinements
// above. There is no hand-written Zod model behind this.
export const RUMLSchema = applyRumlRefinements(
    zodFromRumlJsonSchema() as z.ZodType<RumlBase>,
).meta({ id: 'RUML' })
export type RUML = RumlBase
