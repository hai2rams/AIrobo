# SPEC_M7_PHYSICS_MOTION_FUNDAMENTALS.md

## Goal

Add the first Physics Learning Layer to AIrobo without replacing the existing programming, sensor, mission, or simulation architecture.

M7 teaches the relationship between:

- distance
- speed
- time

The learner should be able to program motion using speed and time, observe the resulting robot movement, and see the physics relationship that produced it.

Example:

set speed 20 units/s
move for 5 seconds

Expected:

distance = 20 × 5 = 100 units

The physics layer must translate the physics command into the existing robot movement contract.

M7 must preserve the existing M1–M6 architecture.

Do not add acceleration, forces, friction, sensor noise, AI, advanced graphs, backend, database, or hardware integration.

---

## Learning Objective

The learner should understand:

distance = speed × time

and the equivalent relationships:

speed = distance / time

time = distance / speed

M7 should make this relationship visible through robot motion rather than presenting it only as an equation.

---

## Architecture

Blockly Physics Blocks
        ↓
Physics Program Layer
        ↓
Physics Motion Model
        ↓
RobotAction
        ↓
Existing M1 Simulation Kernel
        ↓
WorldState + SimulationEvents
        ↓
Existing Mission Evaluator
        ↓
Physics Telemetry / UI

The M1 simulation kernel remains the source of truth for robot position and heading.

The physics layer must not directly update x or y.

---

## Existing Architecture Preservation

Preserve all existing behavior from:

- M1 deterministic simulation kernel
- M2 visual playground
- M3 Blockly execution and highlighting
- M4 mission evaluation
- M5 front-distance sensor and IF / ELSE
- M6 finite repeat loops and runtime safety guards

Existing movement blocks must continue to work.

M7 adds physics-oriented motion blocks; it does not remove or redefine the existing programming blocks.

---

## Scope

Implement only:

- robot speed state for the physics learning layer
- Blockly `set speed` block
- Blockly `move for time` block
- deterministic distance calculation from speed × time
- conversion into the existing MOVE_FORWARD RobotAction
- physics telemetry panel
- structured physics calculation data/event
- one Motion Fundamentals learning mission
- tests for all M7 behavior

Do NOT implement:

- acceleration
- deceleration
- force
- mass
- Newton's laws
- friction
- wheel slip
- motor noise
- momentum
- collisions
- velocity vectors
- realistic motor dynamics
- continuous real-time integration
- AI coach
- AI models
- backend/API
- database
- authentication
- hardware integration

---

## Units

For M7 use simple simulation units.

Recommended:

- distance: world-units
- time: seconds
- speed: world-units/second

Do not introduce physical SI conversion complexity yet.

Learner-facing UI may display:

```text
Speed: 20 units/s
Time: 5 s
Distance: 100 units
```

---

## Physics State

Introduce a small physics learning state separate from the M1 RobotState.

Example:

```js
{
  speed: 0,
  lastDuration: null,
  lastDistance: null
}
```

This state belongs to the physics/program layer.

Do not modify the M1 kernel merely to store teaching metadata.

If the existing RobotState already contains a `speed` field, reuse it only if doing so does not change M1 semantics.

The preferred principle is:

- simulation position/heading truth belongs to M1 WorldState
- teaching/calculation metadata belongs to M7 physics state

---

## Blockly Block: Set Speed

Add:

```text
set speed [20] units/s
```

Default:

```text
20
```

The value must be editable.

Validation:

- finite
- greater than or equal to 0
- recommended maximum: 200 units/s

Define:

```text
MAX_PHYSICS_SPEED = 200
```

Invalid speed values must fail cleanly before corrupting execution state.

`SET_SPEED` must not directly move the robot.

---

## Blockly Block: Move For Time

Add:

```text
move for [5] seconds
```

Default:

```text
5
```

The duration must be editable.

Validation:

- finite
- greater than or equal to 0
- recommended maximum: 60 seconds

Define:

```text
MAX_MOVE_DURATION = 60
```

A duration of zero is valid and produces zero movement.

---

## Physics Motion Calculation

When executing:

```text
set speed S
move for T seconds
```

calculate:

```text
distance = S × T
```

Example:

```text
speed = 20
time = 5

distance = 100
```

Then translate this into the existing action:

```js
{
  type: "MOVE_FORWARD",
  distance: 100
}
```

That RobotAction must execute through the existing M1 simulation kernel.

Do not duplicate the trigonometric movement calculations from M1.

---

## Program Representation

Extend the existing program interpreter representation.

Possible representation:

```js
{
  type: "SET_SPEED",
  speed: 20
}
```

and:

```js
{
  type: "MOVE_FOR_TIME",
  duration: 5
}
```

Exact representation is flexible.

Architectural responsibilities must remain:

- Blockly: learner program structure
- program interpreter: execute SET_SPEED and MOVE_FOR_TIME
- physics model: calculate distance from speed and time
- M1 kernel: update robot position from MOVE_FORWARD
- mission layer: evaluate mission after resulting RobotAction

---

## Structured Physics Calculation

Whenever MOVE_FOR_TIME executes, produce structured calculation information.

Example:

```js
{
  type: "PHYSICS_CALCULATION",
  concept: "SPEED_DISTANCE_TIME",
  speed: 20,
  time: 5,
  distance: 100,
  equation: "distance = speed × time",
  unit: "world-units"
}
```

This event belongs to the learning/physics layer, not the M1 simulation kernel.

It may be added to the existing event log.

---

## Event Ordering

For:

```text
set speed 20
move for 5 seconds
```

recommended event ordering:

```text
SPEED_SET
PHYSICS_CALCULATION
ROBOT_MOVED
```

`SPEED_SET` is optional if the existing event model would be cleaner without it.

`PHYSICS_CALCULATION` must occur before the resulting movement event.

The resulting `ROBOT_MOVED` event must still come from the existing M1 kernel.

---

## Existing Sensor / IF / Repeat Integration

Physics blocks must work inside existing M5/M6 program structures.

Examples:

```text
repeat 4 times
    move for 1 second
```

and:

```text
if front distance < 50
    turn left 90
else
    move for 1 second
```

The latest speed value must be used each time `move for time` executes.

Do not cache a calculated distance across executions if speed or duration changes.

---

## Speed Persistence

Once speed is set:

```text
set speed 20
```

the speed remains active until:

- another SET_SPEED command changes it
- Reset restores the initial physics state

Example:

```text
set speed 20
move for 2 seconds
move for 3 seconds
```

Expected distances:

```text
40
60
```

Total:

```text
100 units
```

---

## Default Speed Behavior

Before any SET_SPEED block executes, define a deterministic default.

Recommended:

```text
DEFAULT_PHYSICS_SPEED = 0
```

If `move for 5 seconds` is executed with speed 0:

```text
distance = 0
```

Program completes without movement.

Do not silently assume a nonzero speed.

---

## Program Highlighting

Preserve existing block highlighting.

During:

```text
set speed 20
move for 5 seconds
```

highlight:

1. SET_SPEED block
2. MOVE_FOR_TIME block

The existing visual execution delay remains presentation-only.

Do not add timing delays to the M1 kernel.

The learner should be able to visually associate the highlighted physics block with the resulting movement and telemetry update.

---

## Physics Telemetry

Add a compact Physics panel.

Display at minimum:

```text
PHYSICS

Speed: 20 units/s
Time: 5 s
Distance: 100 units

distance = speed × time
100 = 20 × 5
```

Only show the last executed motion calculation.

The telemetry must use structured physics state/calculation data.

Do not recalculate values by reading DOM content.

---

## Learning Explanation

For M7 keep explanations deterministic and template-based.

Example after execution:

```text
The robot moved 100 units because:

distance = speed × time
100 = 20 × 5
```

Do not introduce an LLM/AI coach in M7.

---

## Motion Fundamentals Mission

Add one new learning mission:

```js
{
  id: "motion-fundamentals-01",
  title: "Speed × Time",
  description: "Use speed and time to move the robot to the target.",
  target: {
    x: 300,
    y: 200
  },
  successRadius: 15,
  concepts: [
    "distance",
    "speed",
    "time"
  ]
}
```

Initial robot:

```text
x = 100
y = 200
heading = 0
```

Required displacement:

```text
200 units
```

---

## Mission Learning Behavior

The learner may choose multiple correct speed/time combinations.

Examples:

```text
speed 20 × time 10 = 200
```

```text
speed 40 × time 5 = 200
```

```text
speed 50 × time 4 = 200
```

The mission must evaluate the actual robot state using the existing M4 mission evaluator.

Do not hard-code one "correct" Blockly solution.

This is important: physics understanding should permit mathematically equivalent solutions.

---

## Acceptance Scenario A — Basic Motion

Initial:

```text
x = 100
y = 200
heading = 0
```

Program:

```text
when start
set speed 20
move for 5 seconds
```

Expected physics:

```text
distance = 100
```

Expected robot final state:

```text
x = 200
y = 200
heading = 0
```

Expected events include:

```text
PHYSICS_CALCULATION
ROBOT_MOVED
```

---

## Acceptance Scenario B — Same Distance, Different Values

Program A:

```text
set speed 20
move for 10 seconds
```

Program B:

```text
set speed 40
move for 5 seconds
```

Both must produce:

```text
distance = 200
```

from the same heading/start state.

This demonstrates equivalent speed/time combinations.

---

## Acceptance Scenario C — Speed Persistence

Program:

```text
set speed 20
move for 2 seconds
move for 3 seconds
```

Expected:

```text
first distance = 40
second distance = 60
total movement = 100
```

---

## Acceptance Scenario D — Zero Speed

Program:

```text
set speed 0
move for 5 seconds
```

Expected:

```text
distance = 0
robot position unchanged
```

No invalid numeric state.

---

## Acceptance Scenario E — Invalid Input

Examples:

```text
set speed -10
move for 5 seconds
```

or:

```text
set speed 20
move for 100 seconds
```

when `MAX_MOVE_DURATION = 60`.

Expected:

- reject program cleanly
- do not corrupt WorldState
- no partial invalid physics movement
- show learner-friendly feedback

---

## Acceptance Scenario F — Physics Mission Success

Initial:

```text
robot x = 100
target x = 300
heading = 0
```

Program:

```text
set speed 40
move for 5 seconds
```

Expected:

```text
distance = 200
robot x = 300
mission status = SUCCESS
```

Existing M4 `TARGET_REACHED` semantics remain valid.

---

## Mission Integration

After MOVE_FOR_TIME calculates distance and sends MOVE_FORWARD through M1:

```text
Physics Calculation
    ↓
RobotAction
    ↓
M1 Kernel
    ↓
WorldState
    ↓
M4 Mission Evaluator
```

Mission evaluation must continue after every actual RobotAction.

Physics calculations alone do not count as robot movement.

---

## Reset Behavior

Reset must:

- restore robot state using existing reset behavior
- restore mission state using existing behavior
- reset M7 physics state
- set speed back to DEFAULT_PHYSICS_SPEED
- clear last time/distance calculation
- preserve Blockly workspace

Do not delete learner blocks.

---

## Clear Workspace

Existing behavior remains unchanged.

Clear Workspace:

- removes Blockly program blocks
- does not directly change robot state
- does not directly change mission state
- does not directly change physics state unless current architecture explicitly requires it

---

## Determinism

Given the same:

- initial WorldState
- initial physics state
- Blockly program

the same:

- speed values
- durations
- calculated distances
- RobotActions
- WorldState
- mission state
- ordered events

must be produced every time.

No randomness.

---

## Tests

Add tests for at minimum:

1. SET_SPEED stores valid speed
2. speed 20 × time 5 produces distance 100
3. MOVE_FOR_TIME generates existing MOVE_FORWARD action
4. M1 kernel performs the actual position update
5. physics layer does not duplicate movement trigonometry
6. PHYSICS_CALCULATION contains speed/time/distance
7. event ordering places calculation before ROBOT_MOVED
8. speed persists across multiple MOVE_FOR_TIME commands
9. setting new speed replaces previous speed
10. default speed is deterministic
11. zero speed causes zero movement
12. zero duration causes zero movement
13. negative speed rejected
14. speed above maximum rejected
15. negative duration rejected
16. duration above maximum rejected
17. equivalent speed/time combinations produce same distance
18. physics blocks work inside REPEAT
19. physics motion works inside IF / ELSE selected branch
20. M4 mission evaluator continues to work
21. motion fundamentals mission accepts multiple mathematically valid solutions
22. Reset restores physics state
23. M3 highlighting behavior remains intact
24. M5 sensing behavior remains intact
25. M6 loop behavior remains intact
26. existing M1 tests pass
27. existing M2 tests pass
28. existing M3 tests pass
29. existing M4 tests pass
30. existing M5 tests pass
31. existing M6 tests pass

---

## UI

Add the new physics blocks to the Blockly toolbox:

```text
set speed [20] units/s
move for [5] seconds
```

Add a compact Physics telemetry area.

Do not redesign the full interface in M7.

Preserve:

- Blockly workspace
- visual playground
- mission panel
- robot telemetry
- sensor telemetry
- event log
- debug controls

Layout optimization can remain deferred.

---

## Browser Verification

Use the in-app browser and verify:

### Scenario 1

```text
set speed 20
move for 5 seconds
```

Observe:

- physics calculation shows 100
- robot moves 100 units
- telemetry updates
- event order is correct

### Scenario 2

Compare:

```text
20 × 10
```

and:

```text
40 × 5
```

Both move the same distance.

### Scenario 3

Run the Motion Fundamentals mission:

```text
set speed 40
move for 5 seconds
```

Robot reaches the target and mission succeeds.

### Scenario 4

Invalid speed/duration fails cleanly.

---

## Error Handling

Invalid physics values must:

- stop cleanly
- not partially apply invalid movement
- preserve last valid WorldState
- clear active highlighting if execution stops
- restore Run Program availability
- display learner-friendly feedback

---

## Constraints

- Do not rewrite M1 simulation movement logic.
- Do not duplicate movement trigonometry in the physics layer.
- Physics layer converts speed/time into distance only.
- Preserve M1–M6 behavior.
- No acceleration.
- No forces.
- No friction.
- No sensor noise.
- No AI.
- No backend/database.
- No hardware integration.
- Do not proceed beyond M7.
