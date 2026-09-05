# Galvani — domain glossary

Terms meaningful to someone doing bioelectric tissue modelling. Implementation
details live in CODE.md.

- **Cell** — one polygon of the cluster; carries ion concentrations (mol/m³),
  volume, and is the node of the gap-junction graph.
- **Membrane** — one edge of a cell polygon (face in 3D). Owns Vm, membrane
  permeabilities (Dm per ion), pump density. Every membrane belongs to exactly
  one cell. Two cells sharing a border have two membranes, one each.
- **Vm (membrane voltage)** — per membrane, inside minus outside, volts.
  Computed as surface charge / capacitance (BETSE model), not from a cable
  equation.
- **Gap junction** — the pairing of a membrane with its partner membrane on the
  neighbouring cell. Has an open fraction in [gj_min, 1] with voltage gating
  (Harris 1983 model). Boundary membranes have no partner.
- **Boundary membrane** — a membrane facing the bath rather than another cell.
- **Bath** — the extracellular medium. v1: well-mixed, single concentration per
  ion, finite volume (BETSE "no extracellular spaces"). Later: spatial grid.
- **Ion** — a mobile species with valence, cell/bath concentration, membrane
  permeability, free diffusion constant. Ion set is fixed per experiment.
  "P" (impermeant proteins) and "M" (balancing anion) are BETSE conventions.
- **Pump** — active transporter; v1 only Na/K-ATPase (3 Na out, 2 K in).
- **Channel** — a voltage-gated population on a set of membranes: Hodgkin-
  Huxley gates m, h per membrane give an open fraction P; the ion's
  permeability gets P × max permeability. Assigned to all cells or a region.
- **Initial Vm** — the membrane voltage the cluster starts at, produced by a
  small per-cell anion offset rather than by running the pump.
- **Tissue profile** — a named set of cells with membrane parameter overrides
  (permeabilities, pump rate, GJ). Painted in the UI.
- **Event** — a timed intervention on the run timeline: permeability change,
  cut (remove cells), clamp. Replaces BETSE's separate init/sim phases.
- **Experiment** — the whole JSON config: mesh generator settings, ions,
  parameters, profiles, events, run settings. Serialized into the URL.
- **Run** — one execution of an experiment from t = 0; produces a trajectory.
- **Probe** — a cell selected in the UI whose quantities are traced over time.
- **Parity case** — a validation fixture exported from BETSE (mesh, initial
  state, parameters, traces) that Galvani must reproduce to tolerance.
