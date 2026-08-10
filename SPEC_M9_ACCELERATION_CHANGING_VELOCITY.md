# SPEC_M9_ACCELERATION_CHANGING_VELOCITY.md

## Goal

Extend the AIrobo Physics Learning Layer from constant-speed motion into constant acceleration and changing velocity.

M9 teaches:
- acceleration as change in velocity over time
- initial and final velocity
- displacement under constant acceleration
- speeding up and slowing down
- velocity-time and position-time behavior

Core relationships:

```text
v_f = v_i + a t
d = v_i t + 1/2 a t^2
```

M9 must preserve the existing M1-M8 architecture.

Do not add force, mass, friction, momentum, collision physics, AI, backend, database, or hardware integration.

---

## Learning Objectives

The learner should understand:

1. Velocity can change over time.
2. Acceleration measures how quickly velocity changes.
3. Positive acceleration can increase velocity.
4. Negative acceleration can reduce velocity.
5. Zero acceleration means constant velocity.
6. Under constant acceleration, displacement is not generally final-speed × time.
7. Initial velocity, acceleration, and time jointly determine motion.

---

## Architecture

Blockly Physics Blocks
        ↓
Existing Program Interpreter
        ↓
M9 Constant-Acceleration Learning Layer
        ↓
derive final velocity + displacement
        ↓
Existing RobotAction
        ↓
Existing M1 Simulation Kernel
        ↓
WorldState
        ↓
Existing Mission Evaluator
        ↓
M9 Telemetry / Graphs

M9 may calculate scalar displacement and learning metadata.

It must not directly write robot x/y.

Actual movement remains authoritative through the existing M1 kernel.

---

## Existing Architecture Preservation

Preserve:
- M1 deterministic simulation kernel
- M2 visual playground
- M3 Blockly execution/highlighting
- M4 mission evaluation
- M5 sensor + IF/ELSE
- M6 finite repeat loops and safety limits
- M7 speed/time/distance
- M8 velocity/direction/vector learning

---

## Scope

Implement only:
- acceleration learning state
- Blockly `set acceleration` block
- Blockly `accelerate for time` block
- constant-acceleration final-velocity calculation
- constant-acceleration displacement calculation
- persistent speed update
- M8 vector/direction integration
- acceleration telemetry
- simple velocity-time and position-time learning visualization
- one acceleration learning mission
- structured M9 calculation event
- tests

Do NOT implement:
- force
- mass
- F = ma
- friction
- drag
- momentum
- collisions
- jerk
- variable acceleration
- numerical integration engine
- AI
- backend/API
- database
- hardware integration

---

## Units

Continue existing simplified units:
- velocity/speed: world-units/second
- acceleration: world-units/second^2
- time: seconds
- displacement: world-units

Example:

```text
Initial velocity: 10 units/s
Acceleration: 2 units/s^2
Time: 5 s
Final velocity: 20 units/s
Displacement: 75 units
```

---

## Physics State

Extend the existing physics learning state:

```js
{
  speed: 10,
  acceleration: 0,
  lastDuration: null,
  lastDistance: null,
  lastInitialVelocity: null,
  lastFinalVelocity: null,
  lastAcceleration: null
}
```

Use the existing scalar speed state as magnitude along current heading.

---

## Blockly Block: Set Acceleration

Add:

```text
set acceleration [2] units/s^2
```

Default:
```text
1
```

Validation:
- finite
- -50 <= acceleration <= 50

Define:
```text
MAX_ACCELERATION_MAGNITUDE = 50
```

Negative acceleration is valid.

SET_ACCELERATION must not move the robot.

---

## Blockly Block: Accelerate For Time

Add:

```text
accelerate for [5] seconds
```

Default:
```text
5
```

Validation:
- finite
- >= 0
- reuse M7 MAX_MOVE_DURATION where practical

A duration of 0 is valid and produces no movement or speed change.

---

## Velocity Calculation

For initial velocity `v_i`, acceleration `a`, and time `t`:

```text
v_f = v_i + a t
```

Example:

```text
v_i = 10
a = 2
t = 5
v_f = 20
```

After a valid segment, persistent speed becomes `v_f`.

---

## Displacement Calculation

For constant acceleration:

```text
d = v_i t + 1/2 a t^2
```

Example:

```text
v_i = 10
a = 2
t = 5
d = 75
```

Translate this scalar displacement into the existing movement action:

```js
{
  type: "MOVE_FORWARD",
  distance: 75
}
```

The existing M1 kernel performs the actual x/y update.

---

## Deceleration and Zero-Crossing Policy

For M9, scalar speed must not become negative.

If negative acceleration would drive velocity below zero during the requested time:

- calculate stopping time
- move only until velocity reaches zero
- clamp final speed to zero
- do not reverse direction
- ignore remaining requested time for motion

Example:

```text
v_i = 10
a = -5
requested t = 5

t_stop = 2 s
v_f = 0
d = 10
```

No automatic reversal in M9.

---

## Effective Duration

If velocity does not cross zero:

```text
effectiveTime = requestedTime
```

If deceleration reaches zero early:

```text
effectiveTime = v_i / |a|
```

Use effectiveTime for displacement.

Learner telemetry should explain early stopping.

---

## Zero Acceleration

If:

```text
a = 0
```

then:

```text
v_f = v_i
d = v_i t
```

This must agree with M7 constant-speed motion.

---

## Direction / Vector Integration

Acceleration acts along the robot's current heading.

After deriving scalar displacement `d`, M8 may derive:

```text
dx = d cos(theta)
dy = d sin(theta)

vfx = v_f cos(theta)
vfy = v_f sin(theta)
```

Actual x/y updates still come only from M1.

---

## Structured Acceleration Event

Emit structured learning data:

```js
{
  type: "ACCELERATION_CALCULATION",
  concept: "CONSTANT_ACCELERATION",
  initialVelocity: 10,
  acceleration: 2,
  requestedTime: 5,
  effectiveTime: 5,
  finalVelocity: 20,
  displacement: 75,
  headingDegrees: 0,
  stoppedEarly: false,
  equations: {
    velocity: "vf = vi + at",
    displacement: "d = vi t + 1/2 a t^2"
  }
}
```

For stopping cases also include:

```js
{
  stoppedEarly: true,
  stoppingTime: 2
}
```

This event belongs to M9, not M1.

---

## Event Ordering

Recommended:

```text
ACCELERATION_SET
ACCELERATION_CALCULATION
VECTOR_CALCULATION
ROBOT_MOVED
```

ACCELERATION_SET is optional.

M1-generated robot events remain authoritative.

---

## Speed Update Order

For each acceleration segment:

1. read current speed as v_i
2. validate inputs
3. calculate effective time
4. calculate displacement
5. calculate v_f
6. send MOVE_FORWARD to M1
7. update persistent speed to v_f
8. update M8/M9 telemetry

Do not leave physics speed inconsistent if movement execution fails.

---

## Physics Telemetry

Extend the Physics panel:

```text
PHYSICS — ACCELERATION

Initial velocity: 10 units/s
Acceleration: 2 units/s^2
Time: 5 s
Final velocity: 20 units/s
Displacement: 75 units

vf = vi + at
20 = 10 + 2×5

d = vi t + 1/2 a t^2
75 = 10×5 + 1/2×2×5^2
```

Stopping example:

```text
Robot stopped after 2.00 s
Requested time: 5 s
Final velocity: 0
```

Use deterministic/template explanations only.

---

## Velocity-Time Visualization

Add a minimal learning visualization for the last acceleration segment.

Requirements:
- starts at v_i
- ends at v_f
- straight line for constant acceleration
- slope represents acceleration

Use simple SVG/canvas/HTML.

No heavy charting framework is required.

---

## Position-Time Visualization

Add a minimal displacement/position-time visualization.

For nonzero constant acceleration, the curve should visibly differ from constant-speed linear motion.

The graph is teaching-only and must use structured M9 data.

---

## Graph Learning Relationship

Expose these conceptual links:

```text
slope of velocity-time graph = acceleration
```

and:

```text
area under velocity-time graph = displacement
```

For M9, the area relationship may be explanatory rather than an interactive numerical area tool.

---

## IF / Repeat / Sensor Integration

M9 blocks must work inside existing control flow.

Example:

```text
repeat 3 times
    accelerate for 1 second
```

Each iteration must use the final speed from the prior iteration.

Example:

```text
if front distance < 50
    set acceleration -5
    accelerate for 2 seconds
else
    set acceleration 2
    accelerate for 2 seconds
```

Only selected branch executes.

---

## Acceleration Learning Mission

Add:

```js
{
  id: "acceleration-fundamentals-01",
  title: "Speed Up to the Target",
  description: "Use initial speed, acceleration, and time to reach the target.",
  concepts: [
    "initial velocity",
    "acceleration",
    "final velocity",
    "displacement"
  ]
}
```

Recommended initial state:

```text
robot x = 100
robot y = 200
heading = 0
```

Recommended target:

```text
x = 175
y = 200
```

One valid solution:

```text
set speed 10
set acceleration 2
accelerate for 5 seconds
```

because displacement is 75.

Mission success remains authoritative through the existing M4 evaluator.

Do not hard-code one valid solution.

---

## Acceptance Scenario A — Positive Acceleration

```text
set speed 10
set acceleration 2
accelerate for 5 seconds
```

Expected:

```text
v_i = 10
v_f = 20
d = 75
```

At heading 0, x increases by 75.

Persistent speed becomes 20.

---

## Acceptance Scenario B — Zero Acceleration

```text
set speed 10
set acceleration 0
accelerate for 5 seconds
```

Expected:

```text
v_f = 10
d = 50
```

Must match M7 constant-speed behavior.

---

## Acceptance Scenario C — Deceleration Without Stopping

```text
set speed 20
set acceleration -2
accelerate for 5 seconds
```

Expected:

```text
v_f = 10
d = 75
```

No reversal.

---

## Acceptance Scenario D — Stop Early

```text
set speed 10
set acceleration -5
accelerate for 5 seconds
```

Expected:

```text
stopping time = 2
effective time = 2
v_f = 0
d = 10
```

Robot must not reverse.

---

## Acceptance Scenario E — Sequential Acceleration

```text
set speed 0
set acceleration 2
accelerate for 5 seconds
accelerate for 5 seconds
```

Expected:

```text
segment 1: v 0 -> 10, d = 25
segment 2: v 10 -> 20, d = 75
total distance = 100
```

---

## Acceptance Scenario F — Direction Integration

```text
set speed 10
set heading 90
set acceleration 2
accelerate for 5 seconds
```

Expected scalar displacement:

```text
75
```

Expected M8 vector teaching values approximately:

```text
dx = 0
dy = 75
vfx = 0
vfy = 20
```

Actual M1 movement must agree within tolerance.

---

## Acceptance Scenario G — Repeat

```text
set speed 0
set acceleration 2

repeat 3 times
    accelerate for 1 second
```

Expected final speed:

```text
6 units/s
```

Each iteration uses updated speed.

---

## Acceptance Scenario H — Invalid Acceleration

Example:

```text
set acceleration 100
```

when max magnitude is 50.

Expected:
- reject cleanly
- no invalid movement
- preserve last valid state
- learner-friendly error

---

## Acceptance Scenario I — Mission Success

Initial:

```text
x = 100
target x = 175
```

Program:

```text
set speed 10
set acceleration 2
accelerate for 5 seconds
```

Expected:

```text
robot x = 175
mission = SUCCESS
```

TARGET_REACHED must preserve existing M4 semantics.

---

## Reset Behavior

Reset must:
- preserve M1-M8 reset behavior
- acceleration -> 0
- clear last M9 calculation
- clear M9 graph/segment state
- restore existing M7 speed reset behavior
- preserve Blockly workspace

---

## Clear Workspace

Preserve established behavior.

Clear Workspace must not directly mutate robot/physics state unless already established.

---

## Execution Safety

Respect existing M6:

```text
MAX_EXECUTION_STEPS
MAX_REPEAT_COUNT
```

Do not create a second independent runaway runtime.

---

## Determinism

Given the same initial state and Blockly program, the same:
- effective time
- final velocity
- displacement
- vectors
- RobotActions
- WorldState
- mission state
- event order

must be produced every time.

No randomness.

---

## Tests

Add tests for at minimum:

1. SET_ACCELERATION stores valid acceleration
2. positive acceleration computes v_f correctly
3. positive acceleration computes displacement correctly
4. zero acceleration matches M7
5. deceleration without stopping works
6. stopping time calculation is correct
7. zero-crossing clamps velocity at zero
8. no automatic reversal
9. effective duration shortens when stopping early
10. persistent speed updates to v_f
11. sequential acceleration uses latest velocity
12. displacement becomes existing MOVE_FORWARD action
13. M1 performs actual x/y update
14. M9 never directly mutates x/y
15. ACCELERATION_CALCULATION event is structured
16. M8 vector components use current heading
17. derived displacement agrees with M1 movement
18. heading 90 moves in +Y world direction
19. acceleration works inside REPEAT
20. acceleration works in selected IF/ELSE branch
21. sensor behavior remains correct
22. mission evaluator remains authoritative
23. mission success works
24. Reset clears acceleration state
25. invalid acceleration rejected
26. invalid duration rejected
27. M6 safety limits remain effective
28. highlighting/delay remains intact
29. velocity-time visualization uses structured data
30. position-time visualization uses structured data
31. M1 tests pass
32. M2 tests pass
33. M3 tests pass
34. M4 tests pass
35. M5 tests pass
36. M6 tests pass
37. M7 tests pass
38. M8 tests pass

---

## Browser Verification

Use the in-app browser.

### 1. Speeding Up

```text
speed 10
acceleration 2
accelerate 5 s
```

Verify:

```text
vf = 20
d = 75
```

### 2. Constant Velocity

```text
speed 10
acceleration 0
accelerate 5 s
```

Verify:

```text
vf = 10
d = 50
```

### 3. Stop Early

```text
speed 10
acceleration -5
accelerate 5 s
```

Verify:

```text
stop after 2 s
vf = 0
d = 10
```

No reversal.

### 4. Direction

Set heading 90 and repeat the positive-acceleration case.

Verify +Y world motion and M8 vector agreement.

### 5. Graphs

Verify:
- velocity-time graph is linear
- position-time graph shows accelerated/nonlinear motion

### 6. Mission

Complete the acceleration mission with a mathematically valid program.

---

## Error Handling

Invalid M9 input must:
- stop cleanly
- not partially apply invalid movement
- preserve last valid WorldState
- preserve last valid physics state
- clear active highlighting if needed
- restore Run Program availability
- show learner-friendly feedback

---

## Constraints

- Do not rewrite M1 movement logic.
- Do not directly mutate robot x/y from M9.
- Do not add negative-speed reversal.
- Do not implement variable acceleration.
- Do not add force/mass.
- Do not add friction.
- Do not add momentum/collision physics.
- Preserve M1-M8 architecture.
- No AI.
- No backend/database.
- No hardware integration.
- Do not proceed beyond M9.
