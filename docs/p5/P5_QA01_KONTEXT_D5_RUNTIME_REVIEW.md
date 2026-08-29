# P5 QA01 Kontext D5 Runtime Review

## Result

`D5_LOCAL_PREP_PASS / D5_MULTI_REFERENCE_SCHEMA_PROBE_PASS / D5_RUNTIME_FAIL / QA01_DISABLED`

Target Windows reached actual ComfyUI execution after selecting the user-approved Aquarium realism reference. The previous schema false-negative was corrected: the target runtime exposes the typed `COMBO` schema and the requested `index_timestep_zero` method is available.

The next run progressed into sampling and then failed during the chained multi-reference latent execution path. The terminal history dump shows the sampler received conditioning carrying `reference_latents_method=index_timestep_zero` and multiple reference-latent conditioning data, so this is no longer a node-discovery or prompt-submission failure.

## Architectural decision

Do not continue tuning the experimental chained `ReferenceLatent -> ReferenceLatent -> FluxKontextMultiReferenceLatentMethod` graph on FLUX.1 Kontext dev.

The official ComfyUI FLUX.1 Kontext template demonstrates its multiple-image reference path by stitching images into one canvas before `FluxKontextImageScale -> VAEEncode -> ReferenceLatent`. D5.1 adopts that model-compatible pattern while preserving the same safety boundary and the separated semantic roles:

- left reference panel: exact sellable driftwood identity;
- right reference panel: user-approved photographic realism only, no layout copy.

D5.1 remains evaluation-only. QA01 is not registered or executable, and no production Manifest/F archive mutation is permitted.
