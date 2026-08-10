# SPEC_M8_VELOCITY_DIRECTION_VECTORS.md

## Goal

Extend the M7 Physics Learning Layer from scalar speed/distance/time into the first vector-based motion concepts:

- speed versus velocity
- heading / direction
- displacement
- x and y motion components
- velocity components

The learner should be able to connect a robot's direction of travel with the mathematics of vectors.

Example:

set speed 20 units/s
set heading 30 degrees
move for 5 seconds

Physics result:

distance = speed × time = 100 units

displacement components:

dx = distance × cos(30°)
dy = distance × sin(30°)

velocity components:

vx = speed × cos(30°)
vy = speed × sin(30°)

Actual robot position updates must still occur through the existing M1 MOVE_FORWARD / TURN behavior.

M8 must preserve the existing M1–M7 architecture.

Do not add acceleration, forces, friction, AI, matrices, path planning, backend, database, or hardware integration.

---

## Learning Objectives

The learner should understand:

1. Speed has magnitude only.
2. Velocity has magnitude and direction.
3. Heading determines the direction of robot motion.
4. A two-dimensional motion can be represented using x and y components.
5. Distance and displacement are related but not always identical.
6. The same speed with different headings produces different x/y motion.

M8 should teach these ideas through observable robot movement.

---

## Architecture

Blockly Program
      ↓
Existing Program Interpreter
      ↓
M8 Vector Learning Layer
      ↓
derive direction / vector teaching data
      ↓
Existing RobotAction
      ↓
Existing M1 Kernel
      ↓
WorldState
      ↓
M8 Vector Telemetry + Existing Mission Layer

Architectural rule:

The M8 layer may calculate vector components for learning/explanation.

It must NOT independently calculate and write the robot's final x/y position.

Actual robot movement remains authoritative through M1.

---

## Existing Architecture Preservation

Preserve all behavior from:

- M1 deterministic movement kernel
- M2 visual playground
- M3 Blockly execution/highlighting
- M4 mission evaluator
- M5 sensor + IF / ELSE
- M6 finite repeat loops and safety budget
- M7 speed/time/distance physics layer

M8 extends M7.

Do not redefine existing blocks unless explicitly required.

---

## Scope

Implement only:

- heading/direction physics learning support
- Blockly `set heading` block or reuse existing deterministic turning contract cleanly
- velocity vector representation
- vx and vy calculations
- displacement dx and dy calculations
- vector telemetry
- visible direction/velocity arrow on the robot
- one vector/direction learning mission
- structured M8 vector calculation event
- tests for vector relationships

Do NOT implement:

- acceleration
- force
- mass
- friction
- momentum
- collision response
- matrices
- coordinate transformations beyond basic trig
- path planning
- autonomous steering algorithms
- AI
- backend/API
- database
- hardware integration

---

## Coordinate Convention

Preserve the existing AIrobo convention:

- heading 0° points along +X/right
- positive rotation is counter-clockwise
- +Y is the simulation's mathematical positive Y direction

The browser renderer may invert screen Y visually if required, but all physics calculations must use simulation/world coordinates.

Do not calculate vector values from DOM/screen pixels.

---

## Speed Versus Velocity

M7 speed remains a scalar:

```text
speed = 20 units/s
```

M8 introduces velocity as:

```text
velocity = speed + direction
```

Learner-facing representation:

```text
Speed: 20 units/s
Heading: 30°
Velocity: 20 units/s @ 30°
```

Do not replace speed with a vector internally if doing so would destabilize M7.

A derived vector-learning representation is preferred.

---

## Blockly Block: Set Heading

Add:

```text
set heading [30] degrees
```

Default:

```text
0
```

Allowed learner input may be any finite degree value.

Normalize for learner-facing/vector calculations to:

```text
0 <= heading < 360
```

Examples:

```text
450° -> 90°
-90° -> 270°
```

Important:

Do not silently change existing M1 heading accumulation semantics.

If M1 preserves unnormalized headings, M8 may normalize only in its teaching/vector view.

Setting heading must use existing robot-action semantics where practical.

Preferred implementation:

1. read current heading
2. determine deterministic turn delta needed to reach requested heading
3. execute existing TURN action through M1
4. derive normalized teaching heading separately

Do not directly mutate M1 robot heading.

---

## Alternative Heading Implementation

If a `SET_HEADING` operation cannot be cleanly expressed through the existing M1 action contract without creating ambiguity, M8 may initially expose direction using existing turn blocks instead.

In that case:

```text
set speed 20
turn left 30
move for 5 seconds
```

must still produce all M8 vector calculations.

Do not add a new kernel action merely for UI convenience without architectural justification.

---

## Distance Calculation

Continue using M7:

```text
distance = speed × time
```

Example:

```text
speed = 20
time = 5
distance = 100
```

M8 then derives components from that distance and the robot heading.

---

## Displacement Components

For heading θ:

```text
dx = distance × cos(θ)
dy = distance × sin(θ)
```

Angles must be converted correctly to radians for JavaScript trig functions.

Example:

```text
distance = 100
heading = 30°

dx ≈ 86.6025
dy = 50
```

These calculations are learning metadata.

Actual position changes must still come from the M1 kernel.

---

## Velocity Components

For speed v and heading θ:

```text
vx = speed × cos(θ)
vy = speed × sin(θ)
```

Example:

```text
speed = 20
heading = 30°

vx ≈ 17.3205
vy = 10
```

M8 telemetry should make this visible.

---

## Structured Vector Calculation

Whenever a physics motion occurs, produce structured learning data such as:

```js
{
  type: "VECTOR_CALCULATION",
  concept: "VELOCITY_DIRECTION",
  speed: 20,
  headingDegrees: 30,
  duration: 5,
  distance: 100,
  velocity: {
    magnitude: 20,
    x: 17.3205,
    y: 10
  },
  displacement: {
    magnitude: 100,
    x: 86.6025,
    y: 50
  },
  equations: {
    vx: "vx = v cos(theta)",
    vy: "vy = v sin(theta)",
    dx: "dx = d cos(theta)",
    dy: "dy = d sin(theta)"
  }
}
```

This event belongs to the M8 learning layer.

Do not modify M1 simulation event semantics.

---

## Cross-Check Against Actual M1 Movement

M8 should verify internally/tests that its derived dx/dy values agree with the displacement actually produced by the M1 kernel within a small floating-point tolerance.

Example:

```text
M8 predicted:
dx = 86.6025
dy = 50

M1 actual:
newX - oldX ≈ 86.6025
newY - oldY ≈ 50
```

If they disagree beyond tolerance, this should be treated as an architectural/test failure.

Do not "correct" M1 state from M8.

---

## Floating Point Tolerance

Use a deterministic tolerance for comparisons.

Recommended:

```text
EPSILON = 1e-9
```

Learner-facing values may be rounded.

Example:

```text
vx: 17.32 units/s
vy: 10.00 units/s
```

Internal calculations/tests should retain higher precision.

---

## Distance Versus Displacement

Add a simple learning distinction.

For a single straight motion segment:

```text
distance magnitude = displacement magnitude
```

For multi-step motion:

```text
total distance = sum of path lengths
```

while net displacement is:

```text
final position - starting position
```

M8 should track enough program-run metadata to show both after a run.

Example:

```text
move east 100
turn 180
move west 100
```

Expected:

```text
total distance = 200
net displacement = 0
```

This is a learning-layer calculation.

Do not change mission logic.

---

## Program-Run Vector Summary

At the start of a valid program run, capture:

```text
runStartX
runStartY
```

Accumulate:

```text
totalDistanceTraveled
```

At program completion derive:

```text
netDx = finalX - runStartX
netDy = finalY - runStartY
netDisplacement = sqrt(netDx² + netDy²)
```

Display:

```text
Total distance: 200 units
Net displacement: 0 units
```

Reset this run summary at the next valid program run or Reset according to existing UX conventions.

---

## Vector Telemetry

Extend the Physics panel with:

```text
PHYSICS — VELOCITY

Speed: 20 units/s
Heading: 30°

Velocity components
vx: 17.32 units/s
vy: 10.00 units/s

Last movement
Distance: 100 units
dx: 86.60 units
dy: 50.00 units

Run summary
Total distance: 100 units
Net displacement: 100 units
```

Keep learner-facing values concise.

Do not expose implementation-heavy internal structures.

---

## Velocity Arrow

Render a visible arrow indicating current velocity direction.

Requirements:

- starts from the robot center
- points in the current heading direction
- length represents speed in a bounded learner-friendly way
- speed 0 results in no arrow or a clearly zero-length representation
- renderer reads structured speed/heading state
- renderer does not control robot physics

The velocity arrow is visualization only.

---

## Program Highlighting

Preserve existing M3–M7 highlighting and delays.

For:

```text
set speed 20
set heading 30
move for 5 seconds
```

highlight each learner block in execution order.

Telemetry should update alongside the corresponding operation.

---

## Existing IF / Sensor / Repeat Integration

M8 physics/vector calculations must work inside existing control flow.

Example:

```text
repeat 4 times
    if front distance < 50
        turn left 90
    else
        move for 1 second
```

Every MOVE_FOR_TIME execution must derive components using the heading at that exact moment.

Do not cache one heading or one vector across iterations.

---

## Vector Learning Mission

Add:

```js
{
  id: "velocity-direction-01",
  title: "Move in Two Dimensions",
  description: "Choose a speed, direction, and time to reach the target.",
  concepts: [
    "speed",
    "velocity",
    "direction",
    "displacement",
    "components"
  ]
}
```

Recommended initial state:

```text
robot:
x = 100
y = 100
heading = 0
```

Recommended target:

```text
x = 300
y = 300
```

The exact values may be adjusted to fit the existing canvas cleanly.

Mission success must still use the existing M4 mission evaluator.

---

## Mission Philosophy

Do not encode one required solution.

Different mathematically valid combinations should be accepted if the resulting actual robot state reaches the target.

The mission should encourage understanding of:

- direction
- component motion
- speed/time relationship

without hard-coding a Blockly sequence.

---

## Acceptance Scenario A — Heading 0°

Program:

```text
set speed 20
set heading 0
move for 5 seconds
```

Expected:

```text
distance = 100
vx = 20
vy = 0
dx = 100
dy = 0
```

Actual M1 displacement must match:

```text
(+100, 0)
```

---

## Acceptance Scenario B — Heading 90°

Program:

```text
set speed 20
set heading 90
move for 5 seconds
```

Expected approximately:

```text
distance = 100
vx = 0
vy = 20
dx = 0
dy = 100
```

Actual M1 displacement must match within floating-point tolerance.

---

## Acceptance Scenario C — Heading 30°

Program:

```text
set speed 20
set heading 30
move for 5 seconds
```

Expected approximately:

```text
distance = 100
vx = 17.3205
vy = 10
dx = 86.6025
dy = 50
```

M1 movement must agree.

---

## Acceptance Scenario D — Same Speed, Different Direction

Compare:

```text
speed 20
heading 0
time 5
```

with:

```text
speed 20
heading 90
time 5
```

Expected:

- same speed
- same distance
- different velocity vectors
- different dx/dy components
- different final positions

This explicitly teaches the difference between speed and velocity.

---

## Acceptance Scenario E — Distance Versus Displacement

Program:

```text
set speed 20
set heading 0
move for 5 seconds

set heading 180
move for 5 seconds
```

Expected approximately:

```text
total distance = 200
net displacement = 0
```

Robot should return to its starting position within tolerance.

---

## Acceptance Scenario F — Zero Speed

Program:

```text
set speed 0
set heading 45
move for 5 seconds
```

Expected:

```text
vx = 0
vy = 0
distance = 0
dx = 0
dy = 0
```

Robot remains stationary.

---

## Acceptance Scenario G — Heading Normalization

Learner requests:

```text
set heading 450
```

Learner-facing M8 vector heading:

```text
90°
```

Learner requests:

```text
set heading -90
```

Learner-facing M8 vector heading:

```text
270°
```

Existing M1 heading semantics must not be silently rewritten globally.

---

## Reset Behavior

Reset must:

- preserve existing M1–M7 Reset behavior
- reset M8 vector-learning state
- clear last vector calculation
- reset run total distance
- reset run displacement summary
- preserve Blockly workspace

---

## Clear Workspace

Preserve existing behavior.

Clear Workspace must not directly alter robot/vector state unless required by established architecture.

---

## Determinism

Given the same:

- initial WorldState
- physics state
- Blockly program

the following must be identical:

- speed
- headings
- vector components
- distance calculations
- displacement calculations
- RobotActions
- M1 final state
- mission state
- event ordering

No randomness.

---

## Tests

Add tests for at minimum:

1. heading 0 produces +X velocity
2. heading 90 produces +Y velocity
3. heading 180 produces -X velocity
4. heading 270 produces -Y velocity
5. heading 30 component calculations are correct
6. vx = speed × cos(theta)
7. vy = speed × sin(theta)
8. dx = distance × cos(theta)
9. dy = distance × sin(theta)
10. derived displacement agrees with actual M1 movement
11. M8 does not directly mutate robot x/y
12. speed remains scalar M7 state
13. heading normalization works in learner/vector layer
14. zero speed produces zero vector
15. same speed/different headings produce different velocity vectors
16. total distance accumulates across motion segments
17. net displacement uses final minus initial position
18. round trip may have nonzero distance and zero displacement
19. vector calculations work inside REPEAT
20. heading is re-read for each MOVE_FOR_TIME
21. vector calculations work inside selected IF/ELSE branches
22. M4 mission evaluation remains authoritative
23. velocity arrow uses structured speed/heading state
24. Reset clears M8 run summary
25. M3 highlighting remains intact
26. M5 sensor behavior remains intact
27. M6 repeat behavior remains intact
28. M7 physics behavior remains intact
29. all existing M1 tests pass
30. all existing M2 tests pass
31. all existing M3 tests pass
32. all existing M4 tests pass
33. all existing M5 tests pass
34. all existing M6 tests pass
35. all existing M7 tests pass

---

## Browser Verification

Use the in-app browser to verify:

### Scenario 1 — East

```text
speed 20
heading 0
time 5
```

Verify arrow and +X motion.

### Scenario 2 — North

```text
speed 20
heading 90
time 5
```

Verify arrow and +Y world-coordinate motion.

### Scenario 3 — Diagonal

```text
speed 20
heading 30
time 5
```

Verify vector telemetry and actual robot movement agree.

### Scenario 4 — Round Trip

Move 100 units in one direction, reverse direction, and move 100 units back.

Verify:

```text
distance = 200
net displacement ≈ 0
```

### Scenario 5 — Mission

Use speed/direction/time to reach the M8 two-dimensional target.

Verify existing mission success behavior.

---

## Error Handling

Invalid/non-finite heading or vector input must:

- stop cleanly
- not corrupt WorldState
- not partially apply an invalid movement
- show learner-friendly feedback
- clear execution highlighting if needed
- restore Run Program availability

---

## Constraints

- Do not rewrite M1 simulation movement logic.
- Do not directly set x/y from M8.
- Do not duplicate authoritative movement calculations.
- Vector calculations are learning/derived metadata.
- Preserve M1–M7 architecture.
- No acceleration.
- No forces.
- No friction.
- No matrices.
- No path planning.
- No AI.
- No backend/database.
- No hardware integration.
- Do not proceed beyond M8.
