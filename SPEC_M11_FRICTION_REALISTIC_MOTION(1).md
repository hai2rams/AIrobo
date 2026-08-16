# SPEC_M11_FRICTION_REALISTIC_MOTION.md

## Goal

Extend AIrobo from ideal force-driven motion into a first deterministic model of realistic resistance using friction.

M11 teaches the causal chain:

```text
applied force
    ↓
friction opposes motion
    ↓
net force
    ↓
acceleration
    ↓
changing velocity
    ↓
robot movement
```

M11 should make the learner see why the same commanded force does not always produce the same motion on different surfaces.

M11 must preserve the existing M1-M10 architecture.

Do not add gravity on slopes, air drag, wheel slip randomness, motor noise, energy losses, momentum, collision physics, AI, backend, database, or hardware integration.

---

## Learning Objectives

The learner should understand:

1. Friction is a force that opposes relative motion or attempted motion.
2. Applied force and friction combine to produce net force.
3. Net force, not applied force alone, determines acceleration.
4. Larger friction reduces acceleration for the same applied force.
5. A moving robot can slow down when no driving force is applied because friction acts against its motion.
6. Different surfaces can have different friction.
7. A sufficiently small applied force may fail to start a stationary robot because static friction can balance it.
8. Once moving, kinetic friction can be different from static friction.

M11 is the first "ideal vs realistic" physics layer.

---

## Architecture

Blockly / Surface Configuration
        ↓
M11 Friction Layer
        ↓
Applied Force + Friction
        ↓
Net Force
        ↓
Existing M10 Force/Mass Layer
        ↓
Existing M9 Acceleration Layer
        ↓
Existing M8 Vector Layer
        ↓
Existing RobotAction
        ↓
Existing M1 Kernel
        ↓
WorldState + Mission + Telemetry

Architectural rule:

M11 calculates friction and resulting net force.

M10 remains authoritative for:

```text
a = F_net / m
```

M9 remains authoritative for kinematics/stopping.

M1 remains authoritative for final x/y movement.

Do not duplicate M10 or M9 logic in M11.

---

## Existing Architecture Preservation

Preserve:

- M1 deterministic simulation kernel
- M2 visual playground
- M3 Blockly execution/highlighting
- M4 mission evaluation
- M5 sensors + IF/ELSE
- M6 repeat loops and execution limits
- M7 speed/time/distance
- M8 velocity/direction/vectors
- M9 constant acceleration
- M10 force/mass/Newton's Second Law

M11 adds resistance above M10.

---

## Scope

Implement only:

- deterministic surface/friction state
- static friction coefficient
- kinetic friction coefficient
- simplified normal-force model
- static-friction threshold
- kinetic friction opposing motion
- applied force versus net force telemetry
- surface selection block
- friction arrow
- surface visualization
- one friction learning mission
- structured friction event/calculation
- tests

Do NOT implement:

- inclined planes
- variable gravity
- air resistance
- rolling resistance as a separate force
- wheel slip
- random sensor/motor noise
- temperature effects
- deformation
- energy/heat accounting
- momentum/collision physics
- torque
- AI
- backend/API
- database
- hardware integration

---

## Simplified Normal Force Model

M11 operates on a flat horizontal world.

Use a deterministic constant learning gravity:

```text
LEARNING_GRAVITY = 10
```

Normal-force magnitude:

```text
N = m g
```

This is used only for friction calculations.

Do not add vertical motion or gravity-driven falling in M11.

Example:

```text
mass = 2
g = 10
N = 20
```

---

## Surface Definition

Define deterministic surfaces separately from rendering.

Recommended examples:

```js
const SURFACES = {
  SMOOTH: {
    id: "smooth",
    label: "Smooth",
    muStatic: 0.10,
    muKinetic: 0.05
  },
  NORMAL: {
    id: "normal",
    label: "Normal",
    muStatic: 0.30,
    muKinetic: 0.20
  },
  ROUGH: {
    id: "rough",
    label: "Rough",
    muStatic: 0.60,
    muKinetic: 0.45
  }
};
```

Default:

```text
DEFAULT_SURFACE = NORMAL
```

---

## Friction State

Extend learning physics state with:

```js
{
  surfaceId: "normal",
  muStatic: 0.30,
  muKinetic: 0.20,
  lastNormalForce: null,
  lastFrictionForce: null,
  lastAppliedForce: null,
  lastNetForce: null,
  lastFrictionMode: null
}
```

Friction metadata belongs to M11.

---

## Blockly Block: Set Surface

Add:

```text
set surface [Smooth | Normal | Rough]
```

Default:

```text
Normal
```

This changes friction coefficients.

Setting a surface does not move the robot.

Prefer a dropdown rather than free-text coefficients for M11.

---

## Static Friction

When the robot is stationary:

```text
speed = 0
```

static friction may oppose the applied force up to:

```text
F_static_max = muStatic × N
```

If:

```text
|F_applied| <= F_static_max
```

then friction balances applied force:

```text
F_friction = -F_applied
F_net = 0
```

Result:

```text
acceleration = 0
robot remains stationary
```

---

## Static Friction Breakaway

If stationary and:

```text
|F_applied| > F_static_max
```

then static friction is overcome.

Motion begins and kinetic friction applies:

```text
F_kinetic = muKinetic × N
```

For positive applied force:

```text
F_net = F_applied - F_kinetic
```

For negative applied force:

```text
F_net = F_applied + F_kinetic
```

Use a sign-safe implementation.

---

## Kinetic Friction While Moving

When speed > 0, kinetic friction acts opposite current motion.

Magnitude:

```text
F_k = muKinetic × N
```

If applied force acts along heading:

```text
F_net = F_applied - F_k
```

If applied force opposes the movement direction, friction also opposes motion, so both may decelerate the robot.

Preserve M9 zero-crossing semantics.

---

## No Applied Force While Moving

If:

```text
speed > 0
applied force = 0
```

then kinetic friction produces:

```text
F_net = -F_k
```

This should slow the robot through the existing M10 -> M9 path until speed reaches zero.

---

## Stationary Robot With Zero Force

If:

```text
speed = 0
applied force = 0
```

then:

```text
friction = 0
net force = 0
```

No movement.

---

## Direction Policy

M11 remains one-dimensional along the robot heading axis.

Positive scalar motion means along heading.

Friction opposes current scalar motion.

Do not introduce sideways tire friction or general 2D force decomposition yet.

---

## Structured Friction Calculation

Whenever force is applied through realistic-motion mode, emit:

```js
{
  type: "FRICTION_CALCULATION",
  concept: "FRICTION",
  surface: "normal",
  mass: 2,
  gravity: 10,
  normalForce: 20,
  muStatic: 0.30,
  muKinetic: 0.20,
  appliedForce: 10,
  frictionMode: "KINETIC",
  frictionForce: -4,
  netForce: 6
}
```

Static example:

```js
{
  frictionMode: "STATIC",
  appliedForce: 5,
  staticLimit: 6,
  frictionForce: -5,
  netForce: 0,
  motionStarted: false
}
```

This event belongs to M11.

---

## Event Ordering

Recommended:

```text
FRICTION_CALCULATION
FORCE_CALCULATION
ACCELERATION_CALCULATION
VECTOR_CALCULATION
ROBOT_MOVED
```

If static friction prevents motion, no misleading movement event should be introduced beyond established zero-distance semantics.

---

## M10 Reuse

M11 must pass calculated net force into the existing M10 runtime:

```text
applied force
    ↓
M11 friction
    ↓
net force
    ↓
M10
    ↓
a = net force / mass
    ↓
M9
```

If M10 currently uses `netForce` for learner-applied force, refactor naming carefully to distinguish:

```text
appliedForce
netForce
```

Preserve M10 behavior and tests.

---

## Ideal Mode Compatibility

Support either:

- friction toggle ON/OFF, or
- a frictionless surface.

When friction is disabled:

```text
friction = 0
net force = applied force
```

Results must reproduce M10 behavior within tolerance.

Do not create a second motion engine.

---

## Blockly / Program Flow

Recommended learner blocks:

```text
set surface Rough
set mass 2
set applied force 20
apply force for 3 seconds
```

If M10 block is named `set net force`, preserve compatibility but clarify learner-facing wording in realistic mode.

---

## Telemetry

Extend Physics panel:

```text
PHYSICS — FRICTION

Surface: Rough

Mass: 2
Normal force: 20

Applied force: 20
Friction force: 9
Net force: 11

Acceleration:
5.5 units/s²

Mode:
KINETIC
```

Static case:

```text
Applied force: 5
Maximum static friction: 6
Static friction: 5
Net force: 0

Robot does not move.
```

Show:

```text
Applied Force
- Friction
= Net Force
→ Acceleration
→ Motion
```

---

## Friction Arrow

Render a friction arrow:

- from robot center
- opposite motion direction when moving
- opposite attempted force direction under static friction
- bounded length based on magnitude
- labeled `friction`
- visualization only

---

## Applied Force Arrow

Preserve M10 force arrow, but label it clearly:

```text
applied force
```

---

## Surface Visualization

Render a subtle deterministic visual distinction among:

- Smooth
- Normal
- Rough

Do not rely only on color.

The renderer must read surface definition data; visual appearance is not the source of physics values.

---

## Friction Learning Mission

Add:

```js
{
  id: "friction-realistic-motion-01",
  title: "Move Across a Rough Surface",
  description: "Choose enough force to overcome friction and reach the target.",
  concepts: [
    "applied force",
    "friction",
    "net force",
    "mass",
    "acceleration"
  ]
}
```

Recommended initial state:

```text
robot x = 100
target x = 200
heading = 0
speed = 0
mass = 2
surface = Rough
```

Mission success remains authoritative through M4.

Do not hard-code one solution.

---

## Comparison Learning Scenario

Provide a learner-visible way to compare the same program on two surfaces.

Example:

```text
mass = 2
applied force = 20
time = 3
```

Run on Smooth and Rough.

Expected:

```text
Smooth -> lower friction -> larger acceleration -> farther motion
Rough  -> higher friction -> smaller acceleration -> shorter motion
```

---

## Acceptance Scenario A — Static Friction Holds Robot

Given:

```text
mass = 2
g = 10
muStatic = 0.30

F_static_max = 6
```

Program:

```text
speed = 0
applied force = 5
apply for 3 s
```

Expected:

```text
friction = -5
net force = 0
acceleration = 0
robot remains stationary
```

---

## Acceptance Scenario B — Break Static Friction

Same mass/surface:

```text
F_static_max = 6
muKinetic = 0.20
F_k = 4
```

Applied force:

```text
10
```

Expected:

```text
motion starts
friction = -4
net force = 6
acceleration = 3
```

M9 then determines velocity/displacement.

---

## Acceptance Scenario C — Same Force, Different Surfaces

Given:

```text
mass = 2
applied force = 20
```

Compare Smooth and Rough.

Expected:

```text
rough friction > smooth friction
rough net force < smooth net force
rough acceleration < smooth acceleration
rough displacement < smooth displacement
```

for the same duration and initial state.

---

## Acceptance Scenario D — Coasting Slows Down

Initial:

```text
speed = 10
mass = 2
applied force = 0
surface = Normal
```

Expected:

```text
speed decreases
```

If duration is long enough, M9 clamps at zero without reversal.

---

## Acceptance Scenario E — Frictionless Compatibility

With friction disabled:

```text
friction = 0
net force = applied force
```

Results must match M10 within tolerance.

---

## Acceptance Scenario F — Heading Integration

Set heading 90° and apply realistic force.

Friction modifies scalar force only.

Actual movement must still occur along +Y world direction through M8/M1.

---

## Acceptance Scenario G — Repeat

```text
repeat 3 times
    apply force for 1 second
```

Friction must be recalculated every segment using current movement state.

---

## Acceptance Scenario H — IF / Sensor

Example:

```text
if front distance < 50
    set applied force 0
else
    set applied force 20

apply force for 1 second
```

Only selected branch executes.

---

## Acceptance Scenario I — Invalid Surface

Invalid surface IDs or invalid coefficient data must:

- fail cleanly
- not produce NaN/Infinity
- not corrupt state
- not partially move robot

---

## Acceptance Scenario J — Mission

Use a mathematically valid program to overcome friction and reach the M11 target.

Expected:

```text
mission = SUCCESS
```

with established TARGET_REACHED semantics.

---

## Reset Behavior

Reset must:

- preserve M1-M10 reset behavior
- restore DEFAULT_SURFACE
- clear last friction calculation
- restore friction default mode
- clear friction visualization state
- preserve Blockly workspace

---

## Clear Workspace

Preserve established behavior.

---

## Execution Safety

Respect existing:

```text
MAX_EXECUTION_STEPS
MAX_REPEAT_COUNT
```

No competing runtime.

---

## Determinism

Given the same state, surface, coefficients, and program, the same:

- friction mode
- friction force
- net force
- acceleration
- displacement
- final state
- mission state
- event order

must be produced every time.

No randomness.

---

## Tests

Add tests for at minimum:

1. normal force = mass × learning gravity
2. valid surface loads coefficients
3. invalid surface rejected
4. static friction limit correct
5. static friction balances sub-threshold force
6. sub-threshold force gives zero net force
7. stationary robot does not move below threshold
8. threshold boundary is deterministic
9. above threshold switches to kinetic friction
10. kinetic friction magnitude correct
11. kinetic friction opposes motion
12. net force after friction correct
13. M11 delegates net force to M10
14. M10 derives acceleration
15. M9 remains authoritative for stopping
16. M11 never directly mutates x/y
17. coasting slows moving robot
18. long coast stops without reversal
19. rough surface gives more friction than smooth
20. rough surface gives less acceleration for same force/mass
21. frictionless mode matches M10
22. heading 90 remains +Y
23. M8 vector calculations remain correct
24. friction recalculates in REPEAT
25. IF/ELSE integration remains correct
26. sensor behavior remains correct
27. mission evaluator remains authoritative
28. M11 mission accepts valid solution
29. reset restores friction state
30. friction arrow uses structured state
31. applied force arrow remains correct
32. no randomness introduced
33. M6 execution safety remains effective
34. highlighting/delay remains intact
35. M1 tests pass
36. M2 tests pass
37. M3 tests pass
38. M4 tests pass
39. M5 tests pass
40. M6 tests pass
41. M7 tests pass
42. M8 tests pass
43. M9 tests pass
44. M10 tests pass

---

## Browser Verification

Use the in-app browser.

### Scenario 1 — Static Friction

Normal surface:

```text
mass = 2
applied force = 5
```

Verify no motion and:

```text
static max = 6
friction = 5
net force = 0
```

### Scenario 2 — Breakaway

```text
mass = 2
applied force = 10
```

Verify motion starts and kinetic friction applies.

### Scenario 3 — Surface Comparison

Run same mass/force/time on Smooth and Rough.

Verify different acceleration and displacement.

### Scenario 4 — Coasting

Give robot initial speed, then apply zero force.

Verify friction slows it.

### Scenario 5 — Frictionless Compatibility

Disable friction.

Verify M10 result is reproduced.

### Scenario 6 — Direction

Heading 90°, realistic force.

Verify +Y motion.

### Scenario 7 — Mission

Complete rough-surface mission.

---

## Error Handling

Invalid M11 state must:

- stop cleanly
- never produce NaN/Infinity
- not partially apply invalid motion
- preserve last valid WorldState
- preserve last valid physics state
- clear active highlighting if required
- restore Run Program availability
- show learner-friendly feedback

---

## Constraints

- Do not rewrite M1 movement logic.
- Do not directly mutate x/y.
- Reuse M10 for force/mass acceleration.
- Reuse M9 for kinematics and stopping.
- Keep friction deterministic.
- No random noise.
- No air resistance.
- No inclined planes.
- No energy/heat layer.
- No momentum/collision physics.
- No torque.
- Preserve M1-M10 architecture.
- No AI.
- No backend/database.
- No hardware integration.
- Do not proceed beyond M11.
