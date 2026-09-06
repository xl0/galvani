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
   - [x] env: well-mixed bath by default; BETSE's extracellular grid as an option
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
   - [x] Canvas2D for the cluster view and for the trace charts (no chart library)
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
- [x] Workbench UI: config panel, Canvas2D cluster view + toolbar + colorbar, probes + traces
- [x] Regions (painted cell sets), cut brush, modifiers (perm value/factor, pump, GJ, cut; optional time window)
- [x] Usability pass: presets, summary cards + explanatory settings dialogs, Nernst/GHK readouts, stacked traces, 14px base
- [x] Fixed-range editing (freeze), trace CSV export, experiment JSON import/export, Cav channels
- [x] Playback slider (frame history), bath probe, shape masks (built-in + SVG/PNG upload), saved-experiment library, excitable default
- [x] Learn section: chapters 1–7 (ions, leak/GHK, pump, charge, gates, junction, tissue)
- [x] Learn chapter 8 (the solver loop and what is not modelled)
- [x] Learn chapters: morphogens / gene networks, extracellular space
- [ ] Polish: relative (x) controls instead of raw SI, keyboard shortcuts; rerun parity after any step.ts change
- [x] HH channels (BETSE Na/K families) with parity fixture; initial Vm; excitable preset
- [x] Ca2+ + Ca-ATPase (basic_Ca profile) with parity fixture; ion-set switch in the Ions dialog
- [x] Per-membrane rendering (membranes checkbox) + channel open-fraction field
- [x] Substance/GRN network engine with parity fixture; JSON network dialog; morphogen + gene-network presets
- [ ] Network UI beyond JSON (forms per substance); transporters / substance pumps if needed
- [x] Cl / HCN / cation channel families
- ER calcium: skipped for v1. BETSE's `Ca_dyn` is dead code (hard-coded False, `EndoRetic` references undefined parameters), so there is nothing to reproduce. An own CICR model was built and reverted (commit b4ef755): its tuned constants were ~10× off Li–Rinzel-family values and waves needed a 10× junction boost because real waves are IP3-carried (P_Ca ≈ 0.01 P_IP3). If revisited: Li–Rinzel gating with a physical 0.5 mM store (release ≈4e-16 m²/s, SERCA ≈0.9 µM/s), IP3 as a network substance with its own junctional permeability (~2 µm/s), and realistic junction fraction (~1e-5) which needs the implicit solver for dt.
- [x] Init phase (`initTime`), bath-concentration modifier, GJ open / pump rate / membrane current display fields
- [ ] Larger time steps. Tried an implicit voltage predictor (Newton on the linearised cell circuit): 500× on stiff leaks but no help for spikes (gate kinetics set dt), so dropped for simplicity. Revisit only if slow, leaky experiments become a real use case.
- [x] Extracellular spaces: BETSE's ECM ported with parity (grid, electrodiffusion, env voltage, junctions, applied edge voltage); UI dialog, heatmap, voltage modifier, Applied field preset. Open: networks + ECM, fluid flow / deformation (BETSE experimental).
