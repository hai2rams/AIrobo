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
