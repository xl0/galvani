# ADR 0001: BETSE-parity core (charge-capacitor Vm, GHK flux, forward Euler)

## Status
Accepted (2026-09-05)

## Context
Galvani is a from-scratch browser reimplementation of a bioelectric tissue
model. The only existing reference implementation is BETSE (Pietak & Levin),
whose numerics are idiosyncratic: per-membrane Vm = surface charge / Cm rather
than a cable/Poisson model, Goldman-Hodgkin-Katz flux for all membrane
transport, explicit forward Euler for the whole coupled system. Nothing else
exists to validate against; the risk of an LLM-assisted rewrite is
plausible-looking but wrong dynamics.

## Decision
Replicate BETSE's membrane, pump, gap-junction and channel mathematics and its
forward-Euler stepping exactly, so that Galvani reproduces BETSE trajectories
numerically (parity cases exported from BETSE runs). Diverge freely where
BETSE's own choices are heuristic and not load-bearing for the results people
cite: extracellular grid ("Method 7" screening, Gaussian smoothing), fluid
flow, deformation.

## Consequences
- Validation is numeric (tolerance-based) rather than qualitative.
- Forward Euler stays the default integrator; dt limits inherited from BETSE.
  A split implicit/explicit integrator may be added as a non-default option;
  parity tests always run the Euler path.
- Parity cases must be re-exported when BETSE's reference config changes.
- The environment model in Galvani will not match BETSE's ECM mode; parity
  cases are ECM-off only.
