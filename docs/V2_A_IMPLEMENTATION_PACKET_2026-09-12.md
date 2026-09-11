# Visual Console V2-A — Shell Implementation Packet

Date: 2026-09-12
Status: `IMPLEMENTATION_IN_PROGRESS / P5_ISOLATED`

## Scope

V2-A implements only the first runtime layer of the frozen V2 design:

- parallel V2 preview route under `/v2`;
- grouped SaaS sidebar;
- Global Job Monitor backed by a server-side summary endpoint;
- Dashboard answering running / failed / human-review / engine-health / cloud-cost questions;
- working handoffs to the existing production, jobs, QA, assets, workflow and system routes;
- no change to P5 QA01, production manifests, F archive semantics or enabled workflows.

## Safety boundary

The existing application remains the default runtime. V2-A is mounted only when the browser path begins with `/v2`. Existing routes and operational workflows are unchanged.

Cloud remains disabled. No provider adapter or paid model call is enabled by this packet.

## Acceptance

- `/v2` renders the new shell without changing legacy routes;
- `/api/v2/summary?site_id=...` returns server-derived generation / QA / archive / system / cloud-cost truth;
- summary counts are scoped to the current local calendar day;
- archive-ready excludes assets already present in the archive journal;
- ComfyUI/worker/queue truth is reported independently of the open page;
- CI server tests and web build pass.
