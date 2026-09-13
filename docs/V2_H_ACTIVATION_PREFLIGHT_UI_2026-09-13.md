# V2-H Activation Preflight UI — 2026-09-13

## Goal

Expose the server-authoritative Cloud Activation Preflight on `/v2/cloud` as a read-only operator checklist without adding any Cloud/Provider/Model enablement or paid submission authority.

## Surface

A new `CLOUD ACTIVATION PREFLIGHT / 云端启用前检查` panel is inserted after the Budget Policy panel and before the final authority boundary.

The panel:

- reads Provider / Model candidates from `GET /api/v2/cloud`;
- lets the operator select a declared Provider / Model;
- sends only `provider_key` + `model_key` to `POST /api/v2/cloud/activation-preflight`;
- renders server-authoritative blockers;
- shows credential presence as boolean only;
- shows Runtime Budget source/persistence state;
- surfaces `CLOUD_ACTIVATION_PREFLIGHT_ONLY` authority;
- verifies the returned audit object remains entirely read-only.

## Fail-closed behavior

The UI never infers readiness from client-side Provider/model flags. If the API is unavailable or the returned audit boundary contains any mutation/provider-call authority, the panel renders fail closed.

Current OpenAI Image candidates are expected to remain blocked while any of these remain true:

- Cloud disabled;
- Provider disabled;
- Provider Adapter not READY;
- credential absent;
- model disabled;
- Provider submission adapter absent.

The persisted local Budget Policy can remove budget-not-configured blockers, but does not itself activate Cloud execution.

Seedance remains additionally blocked while authoritative pricing is unresolved.

## Authority boundary

The panel contains no control to:

- enable Cloud;
- enable a Provider or Model;
- save credentials;
- call OpenAI, Seedance or another Provider;
- create/retry a Job;
- mark QA PASS;
- archive output;
- alter RAW/source truth.

`Preflight ≠ activation authority.`

## Human Visual Gate

After CI PASS, review `/v2/cloud` on the target Windows runtime and confirm:

1. the new preflight panel appears after Budget Policy without shell/sidebar regression;
2. `READ ONLY / NO EXECUTION` are visible;
3. selecting OpenAI Image + GPT-Image-2.5 Sunburst and clicking `运行预检查` returns `BLOCKED`;
4. with the persisted `$1 / $5 / $20 / $100` policy, budget-not-configured blockers are absent;
5. current execution blockers remain visible, especially `CLOUD_DISABLED`, Provider/model disabled/not-ready state and `PROVIDER_SUBMISSION_ADAPTER_ABSENT`;
6. no credential value or environment variable name is exposed;
7. bottom authority continues to show no execution/mutation rights.

Do not merge the UI slice before this Human Visual Gate passes.

## Gate

`ACTIVATION_PREFLIGHT_UI_IMPLEMENTED / READ_ONLY / NO_PROVIDER_CALL / CI_PENDING / WINDOWS_HUMAN_VISUAL_GATE_NEXT`
