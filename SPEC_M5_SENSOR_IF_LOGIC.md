# SPEC_M5_SENSOR_IF_LOGIC.md

## Goal

Add the first deterministic sensor + conditional programming capability to AIrobo.

The learner should be able to write a Blockly program that senses an obstacle in front of the robot and chooses an action using IF / ELSE logic.

Example:

when start
if front distance < 50
    turn left 90
else
    move forward 25

M5 must preserve the existing M1–M4 architecture.

Do not add loops, AI, camera vision, advanced physics, backend, database, or hardware integration.

---

## Architecture

WorldState
    ↓
Sensor Model
    ↓
Structured Sensor Reading
    ↓
Blockly Condition
    ↓
IF / ELSE Decision
    ↓
RobotAction
    ↓
Existing M1 Simulation Kernel
    ↓
WorldState + Events
    ↓
Existing Mission Evaluator / UI

The sensor layer is responsible for calculating sensor readings.

Blockly must not calculate geometry directly.

---

## Scope

Implement only:

- one deterministic front-distance sensor
- one deterministic obstacle in the simulation world
- structured sensor readings
- sensor reading events
- Blockly `front distance` value block
- numeric comparison support
- Blockly `if / else`
- conditional program execution
- visual representation of obstacle
- sensor value display in telemetry
- tests for sensing and branching

Do NOT implement:

- loops
- repeat blocks
- variables
- multiple sensors
- side/rear sensors
- collision physics
- sensor noise
- friction
- camera
- AI classification
- AI coach
- reinforcement learning
- backend/API
- database
- authentication
- hardware integration

---

## World Obstacle

Add one obstacle to the world definition.

Example:

```js
{
  id: "obstacle-01",
  type: "wall",
  x: 300,
  y: 200,
  width: 20,
  height: 120
}
```

The obstacle must belong to world/simulation data.

Do not hard-code obstacle geometry inside Blockly logic.

The renderer may draw the obstacle from WorldState or a world definition.

---

## Sensor Model

Create a deterministic front-distance sensor.

The sensor should report the distance from the robot to the nearest obstacle directly in front of it.

For M5, keep the sensor model simple and deterministic.

Recommended contract:

```js
readFrontDistance(
  worldState,
  worldDefinition
)
```

returns:

```js
{
  sensor: "FRONT_DISTANCE",
  value: 75,
  unit: "world-units"
}
```

The sensor function must not mutate its inputs.

---

## Sensor Direction

The front sensor uses the robot's current heading.

Coordinate convention remains the existing one:

- heading 0° = positive X / right
- positive rotation = counter-clockwise

The sensor must use the robot's actual state.

Do not use screen/DOM coordinates.

---

## Sensor Range

Use a maximum sensor range.

Recommended:

```text
MAX_SENSOR_RANGE = 500
```

If no obstacle exists within range in front of the robot:

```text
frontDistance = 500
```

Do not use Infinity in learner-facing values.

---

## Sensor Reading Event

Whenever the Blockly program evaluates the front-distance sensor, emit a structured event:

```js
{
  type: "SENSOR_READ",
  sensor: "FRONT_DISTANCE",
  value: 30,
  unit: "world-units",
  robotPosition: {
    x: 250,
    y: 200
  },
  heading: 0
}
```

Sensor events should belong to the sensor/program execution layer.

Do not modify M1 movement semantics just to create sensor events.

---

## Sensor State

Expose current sensor readings to the UI.

Example:

```js
{
  frontDistance: 30
}
```

The telemetry panel should display:

```text
Front Distance: 30
```

The value should update whenever the sensor is evaluated.

---

## Blockly Blocks

Add only the minimum blocks required for M5.

### Front Distance

A value block:

```text
front distance
```

Returns the current deterministic front sensor reading.

This block must call the sensor layer.

It must not calculate obstacle distance itself.

---

### Comparison

Support numeric comparison required for the acceptance flow.

At minimum:

```text
<
```

Prefer using Blockly's standard comparison block if appropriate.

Example:

```text
front distance < 50
```

---

### IF / ELSE

Add a conditional block:

```text
if [condition]
    [commands]
else
    [commands]
```

Use Blockly's standard IF block if practical.

Do not add repeat or loop behavior in M5.

---

## Conditional Execution

The existing M3 runner currently compiles sequential robot commands.

Extend the program execution layer so it can evaluate conditional program structure.

Do NOT move control-flow logic into the M1 simulation kernel.

Recommended conceptual model:

```text
Blockly Program
    ↓
Program Interpreter / Compiler
    ↓
evaluate sensor expression
    ↓
evaluate condition
    ↓
execute selected branch
    ↓
RobotAction(s)
    ↓
M1 Kernel
```

The kernel should continue receiving ordinary RobotAction objects.

---

## Program Representation

Keep the representation simple.

For example, Blockly may compile into an intermediate representation such as:

```js
[
  {
    type: "IF",
    condition: {
      type: "LESS_THAN",
      left: {
        type: "SENSOR",
        sensor: "FRONT_DISTANCE"
      },
      right: {
        type: "NUMBER",
        value: 50
      }
    },
    then: [
      {
        type: "ACTION",
        action: {
          type: "TURN",
          angle: 90
        }
      }
    ],
    else: [
      {
        type: "ACTION",
        action: {
          type: "MOVE_FORWARD",
          distance: 25
        }
      }
    ]
  }
]
```

Exact implementation is flexible.

Important architectural requirement:

- control flow belongs to the program runner/interpreter
- movement belongs to the M1 kernel
- sensor geometry belongs to the sensor layer

---

## Acceptance Program

Blockly:

```text
when start

if front distance < 50
    turn left 90
else
    move forward 25
```

---

## Acceptance Scenario A — Obstacle Near

Initial state:

```text
robot:
x = 250
y = 200
heading = 0
```

Place obstacle so the front sensor reads approximately:

```text
30
```

Expected:

```text
front distance = 30
condition 30 < 50 = true
```

Program executes:

```text
TURN +90
```

Expected final heading:

```text
90°
```

Expected ordered events include:

```text
SENSOR_READ
ROBOT_TURNED
```

MOVE_FORWARD must not execute.

---

## Acceptance Scenario B — Obstacle Far

Initial state:

```text
robot:
x = 100
y = 200
heading = 0
```

Place obstacle so front distance is greater than 50.

Example:

```text
front distance = 200
```

Expected:

```text
200 < 50 = false
```

Program executes:

```text
MOVE_FORWARD 25
```

Expected final position:

```text
x = 125
y = 200
heading = 0
```

Expected ordered events include:

```text
SENSOR_READ
ROBOT_MOVED
```

TURN must not execute.

---

## Evaluation Order

For an IF condition:

1. evaluate sensor expression
2. emit SENSOR_READ
3. evaluate comparison
4. select exactly one branch
5. execute selected RobotAction(s)
6. update WorldState
7. evaluate existing mission layer
8. update telemetry/event log

Do not execute both branches.

---

## Existing Mission Integration

M4 mission evaluation must continue working.

After every actual RobotAction:

```text
M1 Kernel
    ↓
WorldState
    ↓
M4 Mission Evaluator
```

Sensor reads do not themselves count as movement actions.

Mission attempt behavior should remain unchanged.

---

## Program Highlighting

Preserve M3 execution highlighting.

During execution:

- highlight the IF block while evaluating the condition
- highlight the selected robot command when it executes
- do not highlight the unselected branch as executed

Keep the existing visual execution delay behavior.

Timing remains presentation-only.

---

## Manual Debug Controls

Existing manual controls must continue to work.

They do not need to use Blockly IF logic.

Sensor telemetry should update when appropriate without breaking manual controls.

---

## Determinism

Given the same:

- WorldState
- world definition
- Blockly program

the same sensor values, branch decision, RobotActions, final WorldState, mission state, and event order must be produced every time.

No randomness or sensor noise in M5.

---

## Tests

Add tests for at minimum:

1. front sensor returns correct distance when obstacle is directly ahead
2. front sensor respects robot heading
3. no obstacle within range returns MAX_SENSOR_RANGE
4. sensor function does not mutate inputs
5. SENSOR_READ event contains structured data
6. front-distance Blockly block uses sensor layer
7. `<` comparison evaluates correctly
8. true IF branch executes
9. false ELSE branch executes
10. only one branch executes
11. obstacle-near scenario turns robot +90
12. obstacle-far scenario moves robot 25
13. event order is SENSOR_READ then selected action event
14. M1 kernel remains unchanged
15. M4 mission evaluation still runs after RobotActions
16. M3 block highlighting still works
17. existing M1 tests pass
18. existing M2 tests pass
19. existing M3 tests pass
20. existing M4 tests pass

---

## UI

Extend the existing playground minimally.

Display:

```text
Sensor
Front Distance: 30
```

Render the obstacle visibly in the simulation world.

Keep:

- mission panel
- Blockly workspace
- visual playground
- telemetry
- event log
- manual debug controls

Do not redesign the entire layout in M5.

---

## Error Handling

If the sensor cannot produce a valid finite value:

- stop program execution cleanly
- show a learner-friendly error
- do not corrupt WorldState

Invalid condition blocks must not execute either branch.

---

## Constraints

- Do not modify M1 movement calculations.
- Do not duplicate geometry calculations inside Blockly.
- Keep sensor logic separate from simulation movement logic.
- Keep control-flow execution separate from the M1 kernel.
- Preserve M1–M4 behavior.
- No loops.
- No AI.
- No camera.
- No advanced physics.
- No backend/database.
- No hardware integration.
- Do not proceed to M6.
