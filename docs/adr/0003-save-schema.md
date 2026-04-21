# ADR 0003 — Save schema + forward-compatible back-fill

- **Status**: Accepted
- **Date**: 2026-04-21

## Context

`localStorage` saves the full game state as JSON. As we add new fields to state (deployCount, population, advisors, …), old saves written before those fields existed must either:

1. Get rejected with an error (poor UX — players lose progress across game updates).
2. Get silently loaded with missing fields (crashes downstream in systems that assume the field exists).
3. Get back-filled at load time.

## Decision

Adopt option (3) with an explicit contract. `saveLoad.js` holds a single `SCHEMA` integer (currently `1`). On `deserialize(blob)`:

1. Reject blobs where `blob.schema !== SCHEMA`. Migrations bump the schema version.
2. For fields added *within* the current schema version, back-fill sane defaults at load time. Examples in current code:
   ```js
   s.world.deployCount ||= {};
   s.world.populationHistory ||= [0];
   for (const c of Object.values(s.countries || {})) {
     if (c.populationM == null) c.populationM = byId.get(c.id)?.populationM ?? 0;
   }
   ```
3. Always keep one **fixture save** per "era" in `src/save/__tests__/fixtures/` and a matching migration test that proves the back-fill paths are wired.

Non-JSON members (RNG, `Set` of researched) are re-constructed from their JSON-safe counterparts (seed number, array).

## Consequences

**Positive**

- Players don't lose saves across game updates. Ever — unless we bump `SCHEMA`, which we only do when a structural change is truly incompatible.
- Regression: a forgotten back-fill line breaks the migration test at CI, not at runtime in production.
- Future-proofs state additions: the default move is "add field to `createState`, add a back-fill line to `deserialize`".

**Negative**

- `deserialize` grows over time. Acceptable — each back-fill is one line and clearly attributed.
- Large rewrites (e.g. restructuring `countries` keyed-by-id → array) will force a schema bump. That's by design.

## Future work

- Add a save-inspector dev tool (gated behind `?debug=1`) that dumps the loaded state, its schema, and which back-fills ran.
- Compress large saves with LZString before writing to localStorage if we start exceeding ~100 KB.
