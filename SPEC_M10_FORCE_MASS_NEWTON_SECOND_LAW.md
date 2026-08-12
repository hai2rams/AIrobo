# SPEC_M10_FORCE_MASS_NEWTON_SECOND_LAW.md

## Goal

Extend AIrobo from directly commanded acceleration into force-driven motion using mass and Newton's Second Law.

M10 teaches the causal chain:

```text
net force + mass
      ↓
acceleration
      ↓
changing velocity
      ↓
displacement
      ↓
robot movement
```

Core relationship:

```text
F_net = m a
```

and therefore:

```text
a = F_net / m
```

M10 must reuse the existing M9 acceleration layer after deriving acceleration from force and mass.

Actual robot position updates must remain authoritative through the existing M1 simulation kernel.

M10 must preserve M1–M9 behavior.

Do not add friction, gravity, energy, momentum, collision physics, torque, AI, backend, database, or hardware integration.

---

## Learning Objectives

The learner should understand:

1. Force can cause acceleration.
2. Acceleration depends on net force and mass.
3. For the same mass, greater force produces greater acceleration.
4. For the same force, greater mass produces smaller acceleration.
5. Zero net force produces zero acceleration.
6. Force does not directly determine velocity; it changes velocity through acceleration over time.
7. Existing M9 kinematics describe the motion after acceleration is known.

---

## Architecture

Blockly Force Blocks
        ↓
Existing Program Interpreter
        ↓
M10 Force/Mass Learning Layer
        ↓
derive acceleration = netForce / mass
        ↓
Existing M9 Acceleration Layer
        ↓
derive final velocity + displacement
        ↓
Existing RobotAction
        ↓
Existing M1 Kernel
        ↓
WorldState
        ↓
Existing Mission Evaluator
        ↓
M10 Telemetry / Visualization

Architectural rule:

M10 derives acceleration.

M9 remains responsible for constant-acceleration kinematics.

M1 remains responsible for authoritative x/y movement.

Do not duplicate M9 equations or M1 movement calculations unnecessarily.

---

## Existing Architecture Preservation

Preserve:

- M1 deterministic simulation kernel
- M2 visual playground
- M3 Blockly execution/highlighting
- M4 mission evaluator
- M5 sensors + IF/ELSE
- M6 finite repeat loops and execution budget
- M7 speed/time/distance
- M8 velocity/direction/vectors
- M9 acceleration/changing velocity

M10 extends the causal model above M9.

---

## Scope

Implement only:

- mass learning state
- applied/net-force learning state
- Blockly `set mass` block
- Blockly `set net force` block
- Blockly `apply force for time` block
- acceleration derivation from F/m
- reuse of M9 acceleration semantics
- force/mass/acceleration telemetry
- force and acceleration arrows
- simple comparison learning views
- one Newton's Second Law mission
- structured M10 calculation event
- tests

Do NOT implement:

- friction
- gravity
- weight
- multiple simultaneous force vectors
- force decomposition
- torque
- energy/work
- momentum
- collisions
- springs
- drag
- motor models
- AI
- backend/API
- database
- hardware integration

---

## Units

Use learner-friendly simulation units:

- mass: mass-units
- force: force-units
- acceleration: world-units/second²
- speed: world-units/second
- time: seconds
- displacement: world-units

For M10 define the simplified relationship:

```text
1 force-unit / 1 mass-unit = 1 world-unit/s²
```

This avoids SI conversion complexity while preserving the correct proportional physics.

---

## Mass State

Extend physics state with:

```js
{
  mass: 1
}
```

Recommended default:

```text
DEFAULT_MASS = 1
```

Recommended valid range:

```text
0.1 <= mass <= 100
```

Define:

```text
MIN_MASS = 0.1
MAX_MASS = 100
```

Mass must never be zero or negative.

---

## Blockly Block: Set Mass

Add:

```text
set mass [5] mass-units
```

Default:

```text
1
```

Validation:

- finite
- >= MIN_MASS
- <= MAX_MASS

Setting mass must not move the robot.

---

## Net Force State

Add:

```js
{
  netForce: 0
}
```

Recommended valid range:

```text
-500 <= netForce <= 500
```

Define:

```text
MAX_FORCE_MAGNITUDE = 500
```

Positive force acts along the robot's current heading.

Negative force acts opposite the current heading for acceleration purposes.

However, preserve M9's no-automatic-reversal policy when velocity would cross zero.

---

## Blockly Block: Set Net Force

Add:

```text
set net force [10] force-units
```

Default:

```text
10
```

Validation:

- finite
- absolute value <= MAX_FORCE_MAGNITUDE

Setting force alone does not move the robot.

---

## Blockly Block: Apply Force For Time

Add:

```text
apply force for [5] seconds
```

Default:

```text
5
```

Validation:

- finite
- >= 0
- reuse M7/M9 duration maximum where practical

Execution:

1. read current mass
2. read current net force
3. calculate acceleration
4. invoke/reuse M9 acceleration execution for the requested time
5. update velocity/displacement through existing architecture

---

## Newton's Second Law Calculation

Use:

```text
a = F_net / m
```

Example:

```text
F = 20
m = 4

a = 20 / 4
a = 5
```

This calculated acceleration must flow into M9.

Do not separately duplicate the full constant-acceleration implementation in M10.

---

## M9 Reuse Contract

Preferred conceptual call:

```text
applyForceForTime(...)
    ↓
calculate a = F/m
    ↓
executeConstantAcceleration(...)
    ↓
M9 result
```

If M9 does not currently expose a reusable function, refactor minimally so M9 remains the single authoritative implementation of:

```text
vf = vi + at
d = vi t + 1/2 a t²
zero-crossing / stopping
speed caps
```

Refactoring must preserve all existing M9 tests and behavior.

Do not rewrite these equations separately inside M10.

---

## Zero Net Force

If:

```text
F_net = 0
```

then:

```text
a = 0
```

Applying zero force for time must reduce exactly to M9 zero-acceleration / M7 constant-speed behavior.

---

## Same Force, Different Mass

Example:

```text
Force = 20

Mass = 2 -> acceleration = 10
Mass = 4 -> acceleration = 5
Mass = 10 -> acceleration = 2
```

This proportional relationship should be visible to the learner.

---

## Same Mass, Different Force

Example:

```text
Mass = 4

Force = 8  -> acceleration = 2
Force = 20 -> acceleration = 5
Force = 40 -> acceleration = 10
```

The learning UI should make this relationship clear.

---

## Structured Force Calculation Event

Whenever APPLY_FORCE_FOR_TIME executes, produce structured M10 learning data:

```js
{
  type: "FORCE_CALCULATION",
  concept: "NEWTON_SECOND_LAW",
  mass: 4,
  netForce: 20,
  acceleration: 5,
  requestedTime: 3,
  equation: "a = F_net / m"
}
```

The associated M9 event should still record the resulting kinematics.

Recommended event order:

```text
FORCE_CALCULATION
ACCELERATION_CALCULATION
VECTOR_CALCULATION
ROBOT_MOVED
```

M1 robot events remain authoritative.

---

## Force Direction

For M10, force is one-dimensional along the robot heading axis.

Positive:

```text
force along heading
```

Negative:

```text
force opposing heading
```

Do not introduce general 2D force-vector decomposition yet.

M8 may visualize the robot heading and resulting velocity vector.

---

## Negative Force and Stopping

Negative force produces negative acceleration:

```text
a = negative force / positive mass
```

Then M9's existing zero-crossing policy applies.

Example:

```text
speed = 10
mass = 2
force = -10

a = -5
```

If applied for 5 seconds, M9 should stop the robot after 2 seconds and not reverse it.

M10 must not add a second stopping/reversal implementation.

---

## Mass Change During Program

Mass persists until changed.

Example:

```text
set mass 2
set force 10
apply force for 2 seconds

set mass 5
apply force for 2 seconds
```

Each APPLY_FORCE operation must use the current mass.

---

## Force Persistence

Net force persists until changed.

Example:

```text
set mass 5
set net force 10

apply force for 1 second
apply force for 1 second
```

Both force applications use force = 10 unless changed.

Each segment starts with the latest velocity from the previous segment.

---

## Physics Telemetry

Extend the Physics panel:

```text
PHYSICS — NEWTON'S SECOND LAW

Mass: 4 mass-units
Net force: 20 force-units

Acceleration:
5 units/s²

a = F / m
5 = 20 / 4

Initial velocity: 10
Final velocity: 25
Time: 3 s
Displacement: 52.5
```

Keep the causal chain visible:

```text
Force + Mass
→ Acceleration
→ Velocity Change
→ Motion
```

---

## Force Arrow

Render a learner-facing force arrow from the robot.

Requirements:

- aligned with heading for positive force
- opposite heading for negative force
- bounded visual length represents force magnitude
- zero force shows no force arrow or a clear zero state
- visualization only
- must not control physics

---

## Acceleration Arrow

Render an acceleration arrow derived from:

```text
a = F/m
```

Its magnitude should reflect acceleration in a bounded way.

The learner should be able to compare force and acceleration visually.

---

## Comparison Learning View

Add a minimal deterministic comparison view or mission feedback capable of showing:

```text
same force + larger mass -> smaller acceleration
```

and:

```text
same mass + larger force -> larger acceleration
```

This can be simple telemetry/comparison cards.

Do not build a separate analytics application.

---

## Existing M8 Direction Integration

Force-driven acceleration acts along the robot's current heading.

M8 vector values should update from the resulting M9 final speed and displacement.

Example heading 90°:

```text
force = 20
mass = 4
a = 5
```

M9 scalar displacement is converted through existing movement/vector paths into +Y world movement.

M10 must not directly compute/write final x/y.

---

## Existing Control-Flow Integration

M10 blocks must work inside M5/M6 control flow.

Example:

```text
if front distance < 50
    set net force -20
else
    set net force 20

apply force for 1 second
```

and:

```text
repeat 3 times
    apply force for 1 second
```

Each iteration uses the latest velocity, mass, and force.

---

## Newton's Second Law Mission

Add:

```js
{
  id: "newton-second-law-01",
  title: "Force, Mass, Motion",
  description: "Choose mass, force, and time to reach the target.",
  concepts: [
    "force",
    "mass",
    "acceleration",
    "velocity",
    "displacement",
    "Newton's Second Law"
  ]
}
```

Recommended initial state:

```text
robot x = 100
robot y = 200
heading = 0
speed = 0
```

Choose a target that has multiple mathematically valid solutions.

Example:

```text
target x = 200
target y = 200
```

Possible solution:

```text
set mass 2
set net force 4
apply force for 10 seconds
```

Here:

```text
a = 2
d = 1/2 × 2 × 10² = 100
```

Mission success must remain determined by the existing M4 evaluator.

Do not hard-code this solution.

---

## Acceptance Scenario A — Basic F = ma

Program:

```text
set speed 0
set mass 4
set net force 20
apply force for 2 seconds
```

Expected:

```text
a = 5
vf = 10
d = 10
```

At heading 0:

```text
x increases by 10
```

---

## Acceptance Scenario B — Same Force, Larger Mass

Compare:

```text
mass 2, force 20 -> a = 10
mass 4, force 20 -> a = 5
```

Expected:

larger mass produces smaller acceleration.

---

## Acceptance Scenario C — Same Mass, Larger Force

Compare:

```text
mass 4, force 8  -> a = 2
mass 4, force 20 -> a = 5
```

Expected:

larger force produces larger acceleration.

---

## Acceptance Scenario D — Zero Force

```text
set speed 10
set mass 4
set net force 0
apply force for 5 seconds
```

Expected:

```text
a = 0
vf = 10
d = 50
```

Must agree with M9/M7 constant-velocity behavior.

---

## Acceptance Scenario E — Negative Force / Braking

```text
set speed 10
set mass 2
set net force -10
apply force for 5 seconds
```

Expected:

```text
a = -5
stop after 2 seconds
vf = 0
d = 10
```

No automatic reversal.

---

## Acceptance Scenario F — Heading Integration

```text
set speed 0
set heading 90
set mass 4
set net force 20
apply force for 2 seconds
```

Expected:

```text
a = 5
vf = 10
d = 10
```

M8 vector/actual world movement should be approximately:

```text
dx = 0
dy = 10
```

---

## Acceptance Scenario G — Sequential Force Application

```text
set speed 0
set mass 2
set net force 4

apply force for 2 seconds
apply force for 2 seconds
```

First:

```text
a = 2
v: 0 -> 4
d = 4
```

Second:

```text
v: 4 -> 8
d = 12
```

Total:

```text
16 units
```

---

## Acceptance Scenario H — Mass Changes

```text
set speed 0
set net force 20

set mass 2
apply force for 1 second

set mass 4
apply force for 1 second
```

Expected:

- first acceleration = 10
- second acceleration = 5
- second segment begins from first segment's final velocity

---

## Acceptance Scenario I — Invalid Mass

Examples:

```text
mass = 0
mass = -2
mass = Infinity
mass > MAX_MASS
```

Expected:

- reject cleanly
- no division by zero
- no movement
- preserve valid state
- learner-friendly error

---

## Acceptance Scenario J — Mission

Using a mathematically valid combination of mass, force, and time, reach the Newton mission target.

Expected:

```text
mission = SUCCESS
```

with existing TARGET_REACHED semantics.

---

## Reset Behavior

Reset must:

- preserve established M1-M9 behavior
- reset mass to DEFAULT_MASS
- reset net force to 0
- clear last M10 force calculation
- clear force/acceleration arrows as appropriate
- preserve Blockly workspace

---

## Clear Workspace

Preserve established behavior.

Do not directly mutate physics/world state merely because blocks were cleared unless this is already part of existing architecture.

---

## Execution Safety

Respect M6:

```text
MAX_EXECUTION_STEPS
MAX_REPEAT_COUNT
```

Do not create a competing runtime safety system.

---

## Determinism

Given the same:

- initial WorldState
- speed
- mass
- force
- heading
- Blockly program

the same:

- acceleration
- M9 kinematics
- vector values
- RobotActions
- final WorldState
- mission state
- event order

must result every time.

No randomness.

---

## Tests

Add tests for at minimum:

1. valid mass is stored
2. zero mass rejected
3. negative mass rejected
4. mass above max rejected
5. valid force is stored
6. excessive force rejected
7. a = F/m is correct
8. same force + larger mass gives smaller acceleration
9. same mass + larger force gives larger acceleration
10. zero force gives zero acceleration
11. FORCE_CALCULATION event is structured
12. M10 delegates/reuses M9 kinematics
13. no duplicate M9 acceleration equations in M10 where avoidable
14. resulting displacement goes through existing M1 movement
15. M10 never directly mutates x/y
16. negative force uses M9 stopping semantics
17. no automatic reversal
18. force persists across segments
19. mass persists across segments
20. changed mass affects next segment
21. latest velocity flows to next force segment
22. heading integration agrees with M8
23. heading 90 produces +Y world movement
24. force works inside REPEAT
25. force works with IF/ELSE
26. sensors remain correct
27. mission evaluator remains authoritative
28. Newton mission accepts valid solution
29. Reset restores mass/force state
30. force arrow uses structured force state
31. acceleration arrow uses derived acceleration
32. M6 safety limits remain effective
33. highlighting/delay remains intact
34. all existing M1 tests pass
35. all existing M2 tests pass
36. all existing M3 tests pass
37. all existing M4 tests pass
38. all existing M5 tests pass
39. all existing M6 tests pass
40. all existing M7 tests pass
41. all existing M8 tests pass
42. all existing M9 tests pass

---

## Browser Verification

Use the in-app browser.

### Scenario 1 — Basic Newton's Second Law

```text
mass 4
force 20
apply for 2 s
```

Verify:

```text
a = 5
vf = 10
d = 10
```

### Scenario 2 — Mass Comparison

Hold force constant and compare two masses.

Verify larger mass produces smaller acceleration.

### Scenario 3 — Force Comparison

Hold mass constant and compare two forces.

Verify larger force produces larger acceleration.

### Scenario 4 — Zero Force

Start with nonzero velocity and apply zero force.

Verify constant velocity.

### Scenario 5 — Braking

Use negative force.

Verify M9 stopping behavior and no reversal.

### Scenario 6 — Direction

Set heading 90° and apply force.

Verify +Y movement and M8 vector agreement.

### Scenario 7 — Mission

Complete Newton's Second Law mission with a mathematically valid solution.

---

## Error Handling

Invalid M10 inputs must:

- stop cleanly
- never divide by zero
- not partially apply invalid motion
- preserve last valid WorldState
- preserve last valid physics state
- clear execution highlighting if necessary
- restore Run Program availability
- show learner-friendly feedback

---

## Constraints

- Do not rewrite M1 movement logic.
- Do not directly mutate x/y.
- Reuse M9 acceleration implementation.
- Do not add friction.
- Do not add gravity/weight.
- Do not add energy/work.
- Do not add momentum/collisions.
- Do not add torque.
- Preserve M1-M9 architecture.
- No AI.
- No backend/database.
- No hardware integration.
- Do not proceed beyond M10.
