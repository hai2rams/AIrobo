# SPEC_M12_WORK_ENERGY.md

## Goal

Extend AIrobo from force-driven realistic motion into a deterministic Work + Energy learning layer.

M12 teaches:
- force
- displacement
- work
- kinetic energy
- speed
- mass
- the work-energy theorem

Core relationships:

```text
W = F d cos(theta)
KE = 1/2 m v^2
W_net = ΔKE
```

For M12 motion remains one-dimensional along the robot heading. When force and displacement are aligned:

```text
W = F d
```

M12 must preserve M1-M11 architecture.

Do not add gravitational potential energy, springs, power, thermal energy accounting, momentum, collisions, torque, AI, backend, database, or hardware integration.

---

## Learning Objectives

The learner should understand:

1. Work requires both force and displacement.
2. More force over the same displacement means more work.
3. More displacement under the same force means more work.
4. Kinetic energy depends on mass and speed.
5. Kinetic energy depends on speed squared.
6. Net work changes kinetic energy.
7. Friction can do negative work.
8. Force without displacement produces zero mechanical work.

---

## Architecture

Blockly / Existing Physics Program
        ↓
M11 Friction
        ↓
M10 Force/Mass
        ↓
M9 Acceleration
        ↓
M8 Vectors
        ↓
RobotAction
        ↓
M1 Kernel
        ↓
Actual displacement
        ↓
M12 Work/Energy Learning Layer
        ↓
Telemetry / Visualization / Mission

M12 is a derived learning layer.

It must not directly control movement or mutate robot x/y.

---

## Existing Architecture Preservation

Preserve all behavior from M1-M11, including:
- simulation kernel
- playground
- Blockly
- mission evaluation
- sensors
- IF/ELSE
- repeat loops
- speed/time/distance
- vectors
- acceleration
- force/mass
- friction

---

## Scope

Implement only:
- kinetic energy calculation
- applied work calculation
- friction work calculation
- net work calculation
- change in kinetic energy
- work-energy consistency check
- deterministic work/energy telemetry
- simple energy visualization
- one M12 learning mission
- structured WORK_ENERGY_CALCULATION event
- tests

Do NOT implement:
- potential energy
- springs
- power
- heat/temperature
- efficiency
- momentum/collisions
- torque
- rotational energy
- AI
- backend/API
- database
- hardware

---

## Units

Use simplified learning units:
- mass: mass-units
- speed: world-units/s
- force: force-units
- displacement: world-units
- work/energy: energy-units

Define:

```text
1 force-unit × 1 world-unit = 1 energy-unit
```

---

## Kinetic Energy

Use:

```text
KE = 1/2 m v^2
```

Example:

```text
m = 2
v = 10
KE = 100
```

Kinetic energy must always be non-negative.

---

## Initial and Final KE

For each force-driven motion segment:

```text
KE_initial = 1/2 m v_i^2
KE_final   = 1/2 m v_f^2
ΔKE        = KE_final - KE_initial
```

Use the existing scalar speed state.

---

## Applied Work

For M12 force remains collinear with robot motion.

Same direction:

```text
W_applied = |F_applied| × |d|
```

Opposite direction:

```text
W_applied = -|F_applied| × |d|
```

Use a sign-safe implementation based on scalar force direction and scalar displacement direction.

---

## Friction Work

When friction is enabled:

```text
W_friction = F_friction × signedDisplacement
```

During normal motion this should be negative because friction opposes motion.

If displacement is zero:

```text
W_friction = 0
```

even if static friction force is nonzero.

---

## Net Work

Use:

```text
W_net = W_applied + W_friction
```

For frictionless mode:

```text
W_friction = 0
W_net = W_applied
```

---

## Work-Energy Theorem

Compare:

```text
W_net
```

with:

```text
ΔKE
```

Use tolerance:

```text
ENERGY_EPSILON = 1e-8
```

Expected:

```text
W_net ≈ ΔKE
```

M12 must not correct underlying state if the values disagree; tests should reveal the inconsistency.

---

## Actual Displacement Source

Use actual structured displacement from the completed motion segment.

Do not calculate work from intended movement alone.

This is important because friction changes actual motion.

---

## Structured Event

Emit after each applicable motion segment:

```js
{
  type: "WORK_ENERGY_CALCULATION",
  concept: "WORK_ENERGY",
  mass: 2,
  initialSpeed: 4,
  finalSpeed: 8,
  displacement: 12,
  appliedForce: 10,
  frictionForce: -3,
  appliedWork: 120,
  frictionWork: -36,
  netWork: 84,
  initialKineticEnergy: 16,
  finalKineticEnergy: 64,
  deltaKineticEnergy: 48,
  workEnergyResidual: 36
}
```

The numbers above are illustrative only.

For valid physical scenarios:

```text
workEnergyResidual ≈ 0
```

where:

```text
workEnergyResidual = W_net - ΔKE
```

---

## Event Ordering

Recommended:

```text
FRICTION_CALCULATION
FORCE_CALCULATION
ACCELERATION_CALCULATION
VECTOR_CALCULATION
ROBOT_MOVED
WORK_ENERGY_CALCULATION
```

TARGET_REACHED may follow according to existing M4 semantics.

---

## Zero Displacement

If displacement = 0:

```text
W_applied = 0
W_friction = 0
W_net = 0
```

Examples:
- static friction holds robot
- zero-duration segment
- zero net movement

---

## Negative Work

If force opposes motion:

```text
W_applied < 0
```

If friction slows the robot:

```text
W_friction < 0
```

Learner should see:

```text
KE_final < KE_initial
ΔKE < 0
W_net < 0
```

---

## Frictionless Comparison

In frictionless/ideal mode:

```text
W_applied = W_net
```

and:

```text
W_net ≈ ΔKE
```

Compare this with rough-surface motion.

---

## Physics Telemetry

Extend Physics panel:

```text
PHYSICS — WORK & ENERGY

Mass: 2
Initial speed: 4
Final speed: 8
Displacement: 12

Applied work: 120
Friction work: -36
Net work: 84

Initial KE: 16
Final KE: 64
ΔKE: 48
```

Also show:

```text
Net Work ≈ Change in Kinetic Energy
```

when within tolerance.

---

## Energy Visualization

Add a simple bar/card/SVG visualization for:
- initial KE
- final KE
- applied work
- friction work/loss

Do not add a heavy charting dependency.

Visualization must consume structured M12 data.

---

## Learning Explanation

Use deterministic templates only.

Examples:

```text
The applied force added kinetic energy to the robot.
```

```text
Friction did negative work and reduced the robot's kinetic energy.
```

```text
No displacement occurred, so no mechanical work was done.
```

No AI coach in M12.

---

## Blockly Integration

No new Blockly blocks are required.

Existing blocks already provide:
- mass
- force
- surface
- force duration

M12 observes these executions.

---

## Repeat / IF / Sensor Integration

Produce an M12 calculation for every applicable force-driven segment inside existing control flow.

Example:

```text
repeat 3 times
    apply force for 1 second
```

Each segment uses the current speed and actual displacement.

---

## Run Summary

At valid program start capture:

```text
runInitialKE
```

Accumulate:

```text
totalAppliedWork
totalFrictionWork
totalNetWork
```

At program completion derive:

```text
runFinalKE
runDeltaKE
```

Expected:

```text
totalNetWork ≈ runDeltaKE
```

within tolerance.

---

## Work + Energy Mission

Add:

```js
{
  id: "work-energy-01",
  title: "Give the Robot Enough Energy",
  description: "Use force and motion to reach the target while observing work and kinetic energy.",
  concepts: [
    "work",
    "force",
    "displacement",
    "kinetic energy",
    "work-energy theorem",
    "friction"
  ]
}
```

Recommended initial state:

```text
robot x = 100
y = 200
speed = 0
heading = 0
mass = 2
surface = Normal
```

Choose a target with multiple valid force/time solutions.

Mission success remains authoritative through M4.

---

## Comparison Learning Scenario

Run identical mass, applied force, duration, and initial speed on:

```text
Frictionless
Rough
```

Expected:

```text
Frictionless:
more net work
more final KE
greater displacement

Rough:
negative friction work
less net work
less final KE
less displacement
```

---

## Acceptance Scenario A — Basic KE

Given:

```text
mass = 2
speed = 10
```

Expected:

```text
KE = 100
```

---

## Acceptance Scenario B — Zero Displacement

Static friction prevents movement.

Expected:

```text
displacement = 0
applied work = 0
friction work = 0
net work = 0
ΔKE = 0
```

---

## Acceptance Scenario C — Frictionless Positive Work

Use a deterministic frictionless force-driven segment.

Expected:

```text
W_applied > 0
W_friction = 0
W_net ≈ ΔKE
```

---

## Acceptance Scenario D — Friction Does Negative Work

Use a moving robot on Rough surface.

Expected:

```text
W_friction < 0
W_net < W_applied
```

and:

```text
W_net ≈ ΔKE
```

---

## Acceptance Scenario E — Braking

Start with nonzero speed and apply opposing force and/or friction.

Expected:

```text
KE_final < KE_initial
ΔKE < 0
W_net < 0
```

Preserve M9 no-reversal semantics.

---

## Acceptance Scenario F — Same Inputs, Different Surface

Compare frictionless and rough with same:
- mass
- force
- duration
- initial speed

Expected:

```text
rough final KE < ideal final KE
rough net work < ideal net work
rough displacement < ideal displacement
```

---

## Acceptance Scenario G — Speed Squared

Same mass:

```text
v = 10
v = 20
```

Expected:

```text
KE(20) = 4 × KE(10)
```

---

## Acceptance Scenario H — Mass Relationship

Same speed:

```text
mass = 2
mass = 4
```

Expected:

```text
KE(m=4) = 2 × KE(m=2)
```

---

## Acceptance Scenario I — Repeat

Apply force in multiple segments.

Expected:
- one M12 calculation per segment
- run work totals accumulate
- total net work ≈ overall ΔKE

---

## Acceptance Scenario J — Mission

Complete the M12 mission using a mathematically valid program.

Expected:

```text
mission = SUCCESS
```

with existing TARGET_REACHED semantics.

---

## Reset Behavior

Reset must:
- preserve M1-M11 behavior
- clear last M12 calculation
- clear run energy summary
- clear energy visualization state
- preserve Blockly workspace

---

## Clear Workspace

Preserve established behavior.

---

## Determinism

Given the same initial state and program, the same:
- work
- kinetic energy
- run totals
- mission state
- event order

must be produced every time.

No randomness.

---

## Tests

Add tests for at minimum:

1. KE = 1/2 m v²
2. KE = 0 at zero speed
3. KE scales linearly with mass
4. KE scales with speed squared
5. zero displacement gives zero work
6. aligned force gives positive work
7. opposing force gives negative work
8. moving friction gives negative work
9. static friction with no displacement gives zero work
10. net work = applied work + friction work
11. ΔKE = KE_final - KE_initial
12. work-energy theorem holds within tolerance
13. M12 uses actual displacement
14. M12 never mutates x/y
15. frictionless behavior remains intact
16. braking gives negative ΔKE
17. repeat produces per-segment calculations
18. run totals accumulate correctly
19. run net work agrees with overall ΔKE
20. mission evaluator remains authoritative
21. visualization uses structured M12 data
22. reset clears M12 state
23. sensor behavior remains correct
24. IF/ELSE remains correct
25. repeat safety remains correct
26. highlighting/delay remains intact
27. M1 tests pass
28. M2 tests pass
29. M3 tests pass
30. M4 tests pass
31. M5 tests pass
32. M6 tests pass
33. M7 tests pass
34. M8 tests pass
35. M9 tests pass
36. M10 tests pass
37. M11 tests pass

---

## Browser Verification

Use the in-app browser.

### Scenario 1 — KE

```text
mass = 2
speed = 10
```

Verify:

```text
KE = 100
```

### Scenario 2 — No Movement

Use sub-threshold static friction.

Verify:

```text
work = 0
ΔKE = 0
```

### Scenario 3 — Frictionless Work

Run an ideal force-driven segment.

Verify:

```text
W_net ≈ ΔKE
```

### Scenario 4 — Rough Surface

Run same command on Rough.

Verify:

```text
friction work < 0
final KE lower
displacement lower
```

### Scenario 5 — Braking

Start moving and apply opposing force.

Verify:

```text
net work < 0
ΔKE < 0
```

### Scenario 6 — Energy Comparison

Compare ideal and rough with same inputs.

Verify energy telemetry/visualization differs correctly.

### Scenario 7 — Mission

Complete M12 Work + Energy mission.

---

## Error Handling

Invalid M12 calculation state must:
- fail cleanly
- never produce NaN/Infinity
- preserve last valid state
- not alter robot movement
- restore Run Program availability if aborted
- show learner-friendly feedback

---

## Constraints

- Do not rewrite M1 movement.
- M12 is derived/observational and must not move the robot.
- Reuse M11 force/friction results.
- Reuse M10/M9/M8 motion results.
- No potential energy.
- No power.
- No thermal accounting.
- No momentum/collisions.
- No torque.
- Preserve M1-M11.
- No AI.
- No backend/database.
- No hardware integration.
- Do not proceed beyond M12.
