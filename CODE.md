# Galvani — code overview

Browser bioelectric tissue simulator. SvelteKit (Svelte 5 runes) + Tailwind v4 +
shadcn-svelte, bun, vitest. Pure-TS physics core validated numerically against
BETSE (see PLAN.md, docs/adr/0001).

## Layout

- `src/lib/core/` — physics core, no Svelte imports, SI units, Float64Array.
  - `mesh.ts` — `Mesh`: cells + membranes (one per polygon edge), partner
    membrane index (self on the boundary), per-membrane area / radius / wedge
    volume, per-cell totals. `finishMesh()` derives the cell totals.
    Dimension-agnostic (`dim`, interleaved coords).
  - `generator.ts` — seeded (mulberry32) jittered-hex -> Voronoi (d3-delaunay,
    computed in micrometres for precision) -> circular clip -> shrink polygons.
    Partners found by matching raw Voronoi edge midpoints.
  - `params.ts` — `Params` (dt, T, cm, tm, bath volume, GJ gating, Na/K pump
    constants), `Ion` (z, D_free, Dm, initial concs), constants F, R.
  - `state.ts` — `SimState` arrays; `createState()`; `updateV()` computes
    Vm = (rho_cell * cellVol/cellSa) / cm per membrane (charge-capacitor model).
  - `step.ts` — one forward-Euler step, mirroring BETSE's loop order exactly:
    Na/K-ATPase (thermodynamic MM), per ion: GHK membrane flux, Harris
    voltage-gated GJ update (run once per ion, as BETSE does), GHK GJ flux,
    membrane conc := cell conc; then apply fluxes (cells, well-mixed bath,
    then GJ), clamp negatives, updateV. `ccAtMem` lags GJ flux by one step,
    on purpose (BETSE parity). Adds BETSE's 1e-25 nonce to vm in place.
  - `betse.ts` — loads parity fixtures into Mesh / Params / Ion / SimState.
  - `*.test.ts` — parity test (tolerances ~1e-10, measured ~1e-12) and
    generator invariants.
- `tests/fixtures/betse-basic.json` — BETSE default config, ECM off, molecule
  network off, init phase: geometry, params, t0 state, 59 snapshots / 500 steps.
- `tools/betse/dump_parity.py` — regenerates the fixture. Run from the pi-qa
  venv: `HOME=/home/xl0/pi-qa/.home /home/xl0/pi-qa/.venv/bin/python
  tools/betse/dump_parity.py tests/fixtures/betse-basic.json`.
  Hooks BETSE's `check_v` (called once per step) to snapshot state.

## Non-obvious

- BETSE's `cc_env` in ECM-off mode is a finite bath (`vol_env`), updated as
  the mean of per-membrane deltas; not a fixed clamp.
- d3-delaunay's Voronoi clipping returns null polygons for coordinates ~1e-5;
  always scale to O(1..100) before triangulating.
