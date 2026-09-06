# Galvani — code overview

Browser bioelectric tissue simulator. SvelteKit (Svelte 5 runes) + Tailwind v4 +
shadcn-svelte, bun, vitest. Charts and the cluster view are hand-drawn Canvas2D. Pure-TS physics core validated numerically against
BETSE (see PLAN.md, docs/adr/0001).

## Layout

- `src/lib/core/` — physics core, no Svelte imports, SI units, Float64Array.
  - `mesh.ts` — `Mesh`: cells + membranes (one per polygon edge), partner
    membrane index (self on the boundary), per-membrane area / radius / wedge
    volume, per-cell totals. `finishMesh()` derives the cell totals.
    Dimension-agnostic (`dim`, interleaved coords).
  - `generator.ts` — seeded (mulberry32) jittered-hex -> Voronoi (d3-delaunay,
    computed in micrometres for precision) -> mask clip (`Mask`: circle /
    ellipse / rect / packed bitmap over the world square) -> shrink polygons.
    Partners found by matching raw Voronoi edge midpoints.
  - `params.ts` — `Params` (dt, T, cm, tm, bath volume, GJ gating, Na/K pump
    constants), `Ion` (z, D_free, Dm, initial concs), constants F, R.
  - `state.ts` — `SimState` arrays; `createState()`; `updateV()` computes
    Vm = (rho_cell * cellVol/cellSa) / cm per membrane (charge-capacitor model).
  - `step.ts` — one forward-Euler step, mirroring BETSE's loop order exactly:
    Na/K-ATPase (thermodynamic MM), per ion: GHK membrane flux, Harris
    voltage-gated GJ update (run once per ion, as BETSE does), GHK GJ flux,
    membrane conc := cell conc; Ca-ATPase flux queued (if a Ca ion exists);
    channels; then apply fluxes (cells, well-mixed bath,
    then GJ), clamp negatives, updateV. `ccAtMem` lags GJ flux by one step,
    on purpose (BETSE parity). Adds BETSE's 1e-25 nonce to vm in place.
    Performance notes (≈0.5 µs per membrane-step at 1.5k cells): Harris
    gating exponentials computed once per step and reused per ion; GHK uses
    a single `expm1`; flux scatter uses `mesh.memSaOverVol`; NaN checks are
    `x !== x` (JavaScriptCore does not inline `Number.isNaN`). Parity holds
    to 1e-12. Bench: scratchpad `bench.ts` (excitable preset, 200 µm disc).
  - `channels.ts` — HH channel models ported from BETSE (Nav1.2/1.3/1.6, NavRat1/2,
    Na leak, Kv1.1–1.6, Kv2.x, Kv3.x, K fast, Kir2.1, K leak, Cav1.2/1.3,
    Cav2.1–2.3, Cav3.1/3.3, Ca L2/L3/G, Ca leak, Cl leak, HCN1/2/4 and
    nonspecific cation leaks as multi-ion channels with relative permeabilities): `rates(V mV)` →
    gate steady states / time constants; `ChannelInstance` holds m, h, mask
    per membrane; `runChannel()` = implicit gate update, GHK flux with
    P·maxDm, applied to concentrations immediately (BETSE run_loop_channels
    order: after the ion loop, before update_all_concs).
  - `network.ts` — port of BETSE's MasterOfNetworks (ECM-off): substances with
    growth/decay (Hill regulators, region targets), cell-zone reactions
    (MM or thermodynamic form), modulators of the pump / gap junctions,
    substance-gated ion permeabilities, channel regulators; substances
    diffuse across membranes (GHK) and through gap junctions, and their charge
    enters Vm (`state.extraRho`). Regulators are compiled to closures instead
    of BETSE's eval strings. Runs after channels each step (`runModulators`,
    `run`). Not ported: transporters, substance pumping, mitochondria,
    env-zone reactions, voltage-sensitive ('*') regulators.
  - `betse.ts` — loads parity fixtures into Mesh / Params / Ion / SimState.
  - `*.test.ts` — parity tests (basic, and Nav1p3+Kv1p5 channels; tolerances
    ~1e-10, measured ~1e-12, with a negative control) and generator/cut invariants.
- `tests/fixtures/betse-basic.json` — BETSE default config, ECM off, molecule
  network off, init phase: geometry, params, t0 state, 59 snapshots / 500 steps.
  `betse-channels.json` — same with the network on, no substances, Nav1p3 (2e-14)
  + Kv1p5 (1e-15) active during init (`dump.sh <out> --channels`).
  `betse-ca.json` — `basic_Ca` ion profile with the Ca-ATPase (`--ions basic_Ca`).
  `betse-ca-channels.json` — basic_Ca + Nav/Kv/Cav3p3 (`--ions basic_Ca --channels --cav`).
  `betse-network.json` — three substances (growth, charged + membrane-permeable
  + K gating, reaction product with intracellular diffusion), a reaction, a
  pump modulator and a substance-inhibited K leak (`--network`).
  `parity.test.ts` runs the same checks over all five.
- `tools/betse/` — `setup.sh` builds `.venv` (uv) from the cached BETSE
  checkout; `dump.sh` regenerates the fixture via `dump_parity.py`, which hooks
  BETSE's `check_v` (called once per step) to snapshot state. BETSE needs a
  writable `~/.betse`, so `dump.sh` points HOME at `tools/betse/.home`.

  - `experiment.ts` — zod `ExperimentSchema` (generator, ions, params, endTime,
    profiles = named cell sets, modifiers) = the URL-serialized document.
    A modifier targets a region (or all cells) from `t` to `tEnd` (null =
    forever): perm sets a value or scales by a factor (later wins), pump / GJ
    factors multiply, cut fires once; `enabled` flag. `applyModulation()`
    writes per-membrane Dm / pump / GJ factors from the modifiers active at t
    (every step only when some modifier is windowed, `hasTimedModifiers`);
    `needsReload()` decides live update vs rebuild.
  - `cut.ts` — `cutCells()`: remove cells, re-index mesh + state, returns cellMap.
  - `defaults.ts` — BETSE "basic" params/ions. `derived.ts` — Nernst and GHK
    voltage readouts shown in the config panel.
- `src/lib/sim/` — `worker.ts` runs the loop off-thread (ticks of ≤12 ms wall
  time; paced to a target speed factor × real time or 'max' via a wall/sim
  time anchor; snapshots ≤ 30 Hz plus one per endTime/600 of sim time, with
  transferable Float32Arrays; per-step probe samples batched into `TraceChunk`); `protocol.ts` message types;
  `session.svelte.ts` (`SimSession`, context) mirrors worker state with runes,
  keeps a snapshot `history` (≤3000 frames and ≤256 MB; worker records a
  frame at least every endTime/1000 of sim time) with `playhead` / `seek()`
  for scrubbing (views read `session.view`, the displayed frame); a probe
  added mid-run is backfilled from history (frame resolution, interpolated);
  remaps regions/probes to nearest cells when the cluster is rebuilt,
  applies edits (`edit()`), debounces the URL hash; traces share one time base
  (`traceT`, sampled every step even without probes) with null gaps for probes
  added later; bath concentrations are traced alongside (`traceBath`); probe colours are assigned
  on add and kept stable (`probeColors`); `view.svelte.ts` display
  state (field, colormap, tool, brush, zoom/pan; colour range per field in
  `ranges`: mode frame / run / fixed with stored min/max; `persist()` keeps
  ranges + trace selection in localStorage `galvani:view`).
- `src/lib/presets.ts` — starter experiments (resting = BETSE default, leaky K+
  patch, Na+ pulse, excitable sheet = the page default, wound); built from
  `baseExperiment`; region cells are picked by generating the mesh on the main
  thread. Loading a preset always resets the run.
- `src/lib/mask.ts` — rasterizes an SVG path (built-in planarian / heart / ring)
  or an uploaded SVG/PNG to a 160² bitmap mask (main thread, canvas).
- `src/lib/library.ts` — saved experiments in localStorage ("Saved in this browser").
- `src/lib/export.ts` — trace CSV download, experiment JSON download / file import.
- `src/lib/persist.ts` — experiment <-> deflate-raw + base64url hash
  (native CompressionStream). `src/lib/viz/colormap.ts` — viridis/coolwarm/magma LUTs.
- `src/lib/components/galvani/` — `Workbench` (owns session/view; header row + a horizontal Resizable PaneGroup: settings | canvas+playback+colorbar | traces; side panes collapsible by drag or `[` `]`, layout saved under `autoSaveId`),
  `ConfigPanel` (sections of `NumField`s bound via `session.edit`), `Toolbar`
  (run/step/reset, field, tools + active-region picker and brush size when
  painting, speed, theme), `ClusterView` (Canvas2D polygons, hit-test,
  paint brush: left adds / right or shift erases, cut brush, probes, hover
  readout, wheel zoom anchored on the pointer, middle/alt drag pans; for ion
  fields the background is tinted with the bath concentration),
  `TracePanel` (toggleable quantities, one stacked `TraceChart` per quantity:
  a small Canvas2D line chart with nice ticks, null gaps, half-pixel min/max
  column downsampling (stable as data grows),
  dashed bath series on the same axis as the probes when the bath is probed
  by clicking outside the cluster; charts are linked through `view.traceHoverT` /
  `view.traceRange`: hover or the playhead shows dots + values on every chart,
  left drag scrubs frames, middle drag pans, wheel zooms time about the
  pointer, shift+wheel / wheel over the axis zooms values (per chart),
  double-click resets, y auto-fits the visible window; wheel is attached
  non-passive by hand because Svelte registers it passive), `Playback`,
  `Colorbar` (limits for the current range mode; freeze copies them into a
  fixed range). ClusterView keeps `runExt`, the field's min/max over all
  recorded frames, rebuilt on field change or reset and folded per live
  frame. ConfigPanel is summary cards; each
  physics category opens a `SettingsDialog` (large shadcn Dialog: `BigField`
  form left, model explanation right). Regions/Modifiers stay inline (painting
  needs the canvas) using compact `NumField`s with tooltips.
  The network is edited as JSON in its dialog (validated by `NetworkSchema`).
  In dev, `window.galvani = { session, view }` for console poking.
- `src/routes/+layout.ts` — SPA (`ssr = false`), prerendered shell.
- `src/routes/learn/[slug]` + `src/lib/learn/` — "How the model works": eight
  chapters (the eighth describes the step loop and the model's limits) (`chapters/*.svelte`, registry in `index.ts`), each prose + a live
  demo and a static SVG figure (`figures/Fig*.svelte`; SVG text needs
  `fill="currentColor"`, arrowheads use `fill="context-stroke"`). Prose is
  pitched at a rusty biology bachelor: technical terms, reminded on first
  use. `minisim.svelte.ts` runs the real core on the main thread for 1–25
  cells (timer-driven, speed = sim s per real s, permeability-pulse
  `stimulate()`); `meshes.ts` builds one cell / two cells / a strip; the
  `components/learn/` set is `Lesson` (two-column layout), `Eq` (KaTeX, display/inline), `MiniChart`,
  `MiniCluster`, `Slider`.
- `src/lib/components/ui/` — shadcn-svelte components (style "nova", zinc,
  radius small): button, checkbox, dialog, input, input-group, label,
  native-select, resizable (PaneForge), select, separator, slider, switch,
  tabs, textarea, toggle, toggle-group, tooltip, badge, kbd, alert, table,
  scroll-area, field. Generated code; excluded from formatting via
  `.prettierignore`. App code defaults to these: NativeSelect for compact
  selects, Select (popover) in the toolbar, InputGroup for number+unit
  fields (`NumField`, `BigField`), ToggleGroup for chips, Checkbox + Label.
- BETSE's initial charge balancing (bal_charge) edits cell concentrations but
  not its membrane copy, so the first step uses stale membrane values.
  Fixtures therefore record `cc_at_mem`; Galvani's own `balanceCharge()`
  keeps both in sync.
- Network modulators write `state.nakMod` / `gjMod` (per membrane), which
  multiply the region factors `nakBlock` / `gjBlock`; substance-gated fluxes
  are applied immediately *and* queued into `fluxesMem` (BETSE does both).

- `initialVm` in the experiment is realized in `createState()` by adding
  balancing anion (M) per cell so that rho·diviterm/cm equals it: an instant
  polarized cluster without waiting for the pump.
- Channel instances live in the worker (`syncChannels()`): matched by id+type
  across live updates so gates persist; new ones init at the current vm;
  region masks recomputed from profiles; gate arrays re-indexed on cut.

- Cell indices change after a cut: worker and session both remap profiles,
  probes and traces through `cellMap`. Anything else holding cell ids must too.
- Theme: `.dark` on `<html>`, set by an inline script in app.html from
  localStorage / prefers-color-scheme; Toolbar toggles it. Inter font import
  removed from app.css in favour of the system stack.

- BETSE's `cc_env` in ECM-off mode is a finite bath (`vol_env`), updated as
  the mean of per-membrane deltas; not a fixed clamp.
- shadcn-svelte `init` is interactive-only; it was run with a preset code
  generated by `encodePreset()` from the package's `dist/preset` module and
  Enter piped to its prompts.
- d3-delaunay's Voronoi clipping returns null polygons for coordinates ~1e-5;
  always scale to O(1..100) before triangulating.
