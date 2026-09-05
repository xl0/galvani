# Galvani — plan

Browser-based interactive bioelectric tissue simulator. From-scratch reimplementation
of BETSE's core model (Voronoi cell cluster, per-membrane Vm, GHK flux, HH channels,
gated gap junctions, config-driven reaction/GRN networks). SvelteKit + shadcn-svelte,
custom compact theme. Dimension-agnostic core, 2D first, 3D later.
Validated against BETSE (venv at /home/xl0/pi-qa, source ~/.cache/checkouts/github.com/betsee/betse).

## Design question tree (grill session)

1. Purpose & scope
   - [x] First win: reproduce BETSE default sim (init phase, resting Vm from uniform concs), numeric match
   - [x] Fidelity: faithful membrane/GJ/pump/channel math; free to diverge on env, smoothing, flow, deform
2. Physics core
   - [x] v1 solver: full ion-concentration solver (needed to match BETSE init); fast equiv-circuit mode later
   - [x] v1 physics: Na/K-ATPase + GHK membrane flux, ions Na/K/P/M ('basic'), GJ w/ Harris gating.
         Phase 2: HH channels, Ca. Later: networks/GRN. Never (unless asked): flow, deformation
   - [x] Forward Euler, same dt as BETSE (parity). Step designed so a split integrator can be swapped in later
   - [x] v1 env: well-mixed bath, fixed concs (BETSE 'simulate extracellular spaces: false'). Grid = phase 2+
3. Architecture
   - [x] Core: TypeScript on typed arrays; WebGPU only on measured need
   - [x] Sim in Web Worker; typed-array snapshots to UI at display rate
   - [x] Mesh: cells, membranes (faces) with area/normal/midpoint, neighbor pairs; own generator for interactive,
         imported BETSE mesh for validation. Dimension-agnostic
   - [x] Svelte 5 runes, state classes (see svelte-state-classes skill). Theme: zinc, compact, light+dark
4. Model definition & persistence
   - [x] Typed JSON config = source of truth; shadcn forms edit it; BETSE YAML import script for validation cases
   - [x] Config compressed into URL hash (native CompressionStream, base64url). Mesh not stored:
         generator is seeded/deterministic. Later: server-side + login
5. Validation
   - [x] Harness: Python script (uses pi-qa venv) dumps BETSE mesh geometry + index maps + traces to JSON;
         vitest loads mesh, runs Galvani step loop, compares Vm/concs within tolerance
   - [x] Reference: BETSE default config with ECM off, init phase Vm + ion conc traces
6. UI
   - [x] Canvas2D behind small renderer interface; uPlot for traces
   - [x] 3-pane workbench (config | canvas+toolbar | traces). Interactions: probe cells -> live traces,
         live param edits while running, paint tissue profiles, cut cells mid-run
7. Tooling
   - [x] bun + SvelteKit + Tailwind v4 + shadcn-svelte + vitest + adapter-static
8. 3D
   - [ ] Only: keep mesh abstraction dimension-free; defer everything else

## Implementation plan

Core is pure TS in src/lib/core (no Svelte imports), Float64Array state, SI units
internally (mol/m3, V, s, m). Parity fixture: tests/fixtures/betse-basic.json
(exported by tools/betse/dump_parity.py from the pi-qa venv).

## TODO

- [x] Scaffold: SvelteKit + bun + Tailwind v4 + vitest; git init; docs (PLAN, CONTEXT, ADR 0001)
- [x] Parity fixture export script (tools/betse/dump_parity.py)
- [x] Core: mesh types + fixture loader; seeded generator (jittered hex -> Voronoi -> clip)
- [x] Core: state + step (pump, GHK flux, GJ Harris gating, bath update, Vm = Q/C), forward Euler
- [x] Parity test: 451 steps, |dVm| ~1e-12 V, rel dconc ~1e-14 (tolerances 1e-10 / 1e-11)
- [x] shadcn-svelte (zinc, nova), compact 13px base, light/dark toggle
- [x] Worker + snapshot protocol; zod experiment schema; deflate+base64url URL hash
- [x] Workbench UI: config panel, Canvas2D cluster view + toolbar + colorbar, probes + uPlot traces
- [x] Profiles painting, cut brush, timed events (perm / pump / GJ factor, cut)
- [x] Usability pass: presets, summary cards + explanatory settings dialogs, Nernst/GHK readouts, stacked traces, 14px base
- [x] Fixed-range editing (freeze), trace CSV export, experiment JSON import/export, Cav channels
- [x] Playback slider (frame history), bath probe, shape masks (built-in + SVG/PNG upload), saved-experiment library, excitable default
- [ ] Polish: relative (x) controls instead of raw SI, keyboard shortcuts; rerun parity after any step.ts change
- [x] HH channels (BETSE Na/K families) with parity fixture; initial Vm; excitable preset
- [x] Ca2+ + Ca-ATPase (basic_Ca profile) with parity fixture; ion-set switch in the Ions dialog
- [x] Per-membrane rendering (membranes checkbox) + channel open-fraction field
- [ ] Later: fast equivalent-circuit solver; env grid; Cl/HCN channel families; ER Ca dynamics; calcium-wave preset
