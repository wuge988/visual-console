# Visual Console — Scene Image Pipeline

Date: 2026-09-14  
Status: `R&D / AQUARIUM_FIRST / NOT_PRODUCTION_REGISTERED`

## Purpose

Generate realistic lifestyle/environment imagery for one Exact Piece while preserving the identity of the real sellable SKU.

This Pipeline is part of the single Visual Console Control Plane. It is not a separate application or backend.

## Production promise

When a Scene asset is represented as an Exact Piece derivative, the piece must retain recognizable real-world identity:

- silhouette;
- branch topology;
- major holes/voids;
- distinctive protrusions;
- relative proportions;
- material/texture cues where visible.

A beautiful scene with a different piece is a QA failure.

## Historical R&D conclusions retained

The previous P5/QA01 work is historical evidence and is not merged as production authority.

### Rejected or terminated patterns

1. **Whole-frame redraw / high denoise**  
   Environment quality can improve while Exact Piece geometry drifts.

2. **Low-denoise preservation as the only strategy**  
   Identity may survive while the scene remains weak or under-generated.

3. **Complete donor scene as a direct realism reference**  
   Can leak composition and produce reference replication instead of controlled realism transfer.

4. **Endless prompt/denoise tuning**  
   No longer accepted as an open-ended production strategy.

### Retained concepts

- protected subject / identity core;
- wood mask / subject-region control;
- material-only or anti-replication realism boards;
- separate environment generation from subject identity protection;
- contact, lighting and photometry repair as a distinct stage;
- Human Visual Gate;
- Engine benchmarking against the same source package.

## Canonical Aquarium MVP

```text
Exact Piece
→ Capture/Source Package
→ SC01/verified identity asset where appropriate
→ Subject/identity protection package
→ Scene brief
→ Engine Adapter
→ Candidate output(s)
→ automated structural checks where available
→ Human Visual Gate
→ QA PASS/FAIL
→ Asset Registry
→ Archive/Publish candidate
```

## Engine policy

The Pipeline may compare multiple Engines:

- local ComfyUI workflow;
- cloud image provider;
- future specialized editing/generation engine.

Every Engine receives an equivalent bounded brief/source package when benchmarked.

The benchmark decides which Engine is appropriate; Engine choice does not change SKU/Job/QA/Archive truth.

## Human Visual Gate dimensions

At minimum evaluate:

1. Exact Piece identity;
2. geometry drift;
3. wood texture/material plausibility;
4. water/plant/rock realism;
5. contact/shadow realism;
6. lighting integration;
7. scene composition;
8. template/repetition feel;
9. obvious AI artifacts;
10. cost and generation time as operational metrics.

## Donor/reference policy

Allowed:

- material board;
- water surface/material cue;
- rock type/texture cue;
- plant density/species mood cue;
- lighting/color-statistics cue;
- camera vocabulary without copying a complete scene layout.

Not allowed as production default:

- complete donor composition used as a layout template;
- reference that causes obvious scene replication;
- donor geometry that competes with Exact Piece identity.

## Current scope

Only **Aquarium** is in the active MVP.

Rainforest/Paludarium, Reptile and Collectible remain future modes. They may reuse the same Pipeline contract only after Aquarium establishes a repeatable identity-safe method.

## Production registration gate

Do not register a Scene workflow as production executable until:

- one pilot SKU has passed bounded Engine comparison;
- Exact Piece identity passes Human Gate;
- outputs have versioned provenance;
- failure/retry semantics are explicit;
- Archive path is defined;
- no silent cloud escalation exists;
- cost metadata is known for paid engines.

## Relationship to 3D

Scene and 3D Pipelines share Capture Session, SKU, masks/metadata where useful, Jobs, QA and Asset Registry.

They do not share the same execution algorithm and neither is upstream authority for the other.