# P5 QA01 v3 Geometry-First — Human Visual Review

Status: `V3_RUNTIME_PASS / V3_OCCLUSION_MECHANISM_PASS / V3_BACKPLATE_REGISTRATION_FAIL / V31_FOREGROUND_PLATE_RECOVERY_REQUIRED / QA01_DISABLED`

## Reviewed evidence

- target Windows exact head: `a49f996a0231ada244415c1cd569967799905729`
- Blender: `5.2.1 LTS`
- source SC01 SHA256: `f31c77589ab71874655744f8f5dc92f2ece77fbf5b7b52f22e53476836a62399`
- D5.3 backplate SHA256: `79c78c8ba14f168c96b112ba50ccee27dedea168b13ebb36156e51838dd99117`
- v3 render SHA256: `85511acc4ac10855d99c6af0be9cd484613bb01a224fdf0a07f8671df26a135c`

## Human visual decision

### PASS — renderer-enforced foreground occlusion mechanism

The Geometry-First proof establishes the architectural capability that the D5.x / D6 diffusion route could not reliably produce:

- foreground epiphyte leaves visibly occupy a nearer layer and cover portions of the driftwood;
- foreground hardscape/substrate geometry visibly occupies a nearer layer and covers lower wood regions;
- these occlusion events are enforced by renderer Z-order rather than inferred by a diffusion prompt;
- no whole-subject diffusion repaint is involved.

Therefore the central Geometry-First hypothesis is accepted:

`RENDERER_Z_ORDER_CAN_FORCE_REAL_FOREGROUND_OCCLUSION = PASS`

### FAIL — photographic backplate screen-space registration

The right-side Blender proof does not preserve the D5.3 backplate framing. Relative to the audited D5.3 backplate, the rendered background/wood is visibly enlarged and cropped. The proof therefore cannot yet serve as a stable base for higher-quality foreground assets.

This is not a reason to reopen Kontext or D5/D6. It is a compositing/registration defect in the current v3 implementation: the photographic backplate is being passed through Blender as a textured plane and therefore through Blender camera/image sampling/color-management behavior.

Frozen decision:

- do not tune the old Blender backplate plane;
- do not add photoreal materials/assets on top of the misregistered frame;
- do not reopen D5/D6 masked-inpaint;
- preserve the validated renderer Z-order foreground mechanism;
- move the photographic backplate completely outside Blender.

## v3.1 recovery architecture

`FOREGROUND_RGBA_PLATE_PLUS_DETERMINISTIC_PIXEL_COMPOSITE`

1. Blender renders only foreground hardscape/substrate/epiphyte geometry to a transparent RGBA plate at the exact target dimensions.
2. No photographic backplate plane is created inside Blender.
3. The audited D5.3 Aquarium candidate remains outside Blender and is never resampled by Blender.
4. A deterministic local compositor alpha-composites the transparent foreground plate over the exact D5.3 pixels.
5. Pixels where foreground alpha is zero must remain pixel-exact to D5.3.
6. Review must show D5.3 backplate, transparent foreground plate, final composite and exact SC01 identity source separately.

## v3.1 acceptance gate

Runtime / deterministic:

- foreground plate dimensions exactly equal D5.3 dimensions;
- foreground plate contains non-zero alpha and transparent background;
- final composite dimensions exactly equal D5.3 dimensions;
- outside-foreground pixels equal D5.3 exactly;
- no diffusion inference;
- no donor conditioning;
- no Manifest/F production archive mutation;
- QA01 remains disabled.

Human visual:

- final frame/camera/background registration matches D5.3 exactly;
- foreground stones/substrate visibly cover lower wood regions;
- epiphyte leaves visibly cover/cross wood regions;
- Exact Piece landmarks remain readable;
- proxy-material realism is not yet the acceptance criterion for this gate.

Only after v3.1 registration + occlusion passes may the project proceed to photoreal foreground assets/materials/lighting.
