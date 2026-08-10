# SPEC_M2_VISUAL_PLAYGROUND.md

## Goal

Build a minimal 2D visual playground that renders the robot state produced by the existing M1 simulation kernel.

M2 must reuse the existing simulation kernel.
Do not duplicate movement logic in the UI.

## Scope

Implement:

- Browser-based 2D playground
- One robot
- One target
- Simple world boundary
- Controls:
  - Move Forward
  - Turn Left
  - Turn Right
  - Reset
- Live state inspector
- Live event log

Do NOT implement:

- Blockly
- AI coach
- sensors
- collision physics
- advanced physics
- database
- authentication
- backend/API
- hardware integration

## Architecture

The flow must remain:

User Control
→ RobotAction
→ M1 Simulation Kernel
→ New WorldState + SimulationEvent[]
→ UI Render

The renderer must never directly update robot x, y, or heading.

The simulation kernel remains the source of truth.

## Initial World

World size:
- width: 600
- height: 400

Robot initial state:
- x: 100
- y: 200
- heading: 0 degrees
- speed: 0

Target:
- x: 500
- y: 200

Coordinate convention:
- 0 degrees points toward positive X/right
- positive rotation is counter-clockwise
- preserve the M1 convention

## Controls

### Move Forward

Generate:

{
  "type": "MOVE_FORWARD",
  "distance": 25
}

### Turn Left

Generate:

{
  "type": "TURN",
  "angle": 15
}

### Turn Right

Generate:

{
  "type": "TURN",
  "angle": -15
}

### Reset

Restore the initial world state.

Reset may be handled by the application layer.
Do not unnecessarily modify the M1 kernel.

## Robot Rendering

Render the robot using a simple shape.

The robot must clearly show its heading/direction.

The visual position must be derived from:

state.robot.x
state.robot.y
state.robot.heading

No independent UI position state is allowed.

## Target Rendering

Display a clearly visible target at:

x = 500
y = 200

The target is visual only in M2.

Do not implement TARGET_REACHED yet.

## State Inspector

Show at minimum:

x
y
heading
step
time

Example:

Robot State

x: 125
y: 200
heading: 15°
step: 2
time: ...

## Event Log

Display simulation events in execution order.

Example:

1. ROBOT_MOVED
2. ROBOT_TURNED
3. ROBOT_MOVED

The event log must use events returned by the M1 kernel.

## Determinism

The UI must not introduce random movement or timing-dependent physics.

Given the same initial state and same actions, the resulting state must remain identical.

## Tests

Add tests that verify:

1. UI actions are correctly translated into RobotAction objects.
2. Move Forward invokes the existing simulation kernel.
3. Turn Left invokes TURN +15.
4. Turn Right invokes TURN -15.
5. Reset restores the initial state.
6. Rendering uses the returned WorldState rather than maintaining independent robot coordinates.
7. Existing M1 tests continue to pass.

## Acceptance Test

Starting state:

x = 100
y = 200
heading = 0

Perform:

Move Forward
Turn Left
Move Forward

Expected actions:

MOVE_FORWARD 25
TURN 15
MOVE_FORWARD 25

The final rendered robot position and heading must match the state returned by the M1 simulation kernel.

The event log must contain, in order:

ROBOT_MOVED
ROBOT_TURNED
ROBOT_MOVED

## Constraints

- Do not rewrite the M1 simulation kernel.
- Do not introduce a second physics or movement implementation.
- Keep UI code separate from core simulation logic.
- Prefer the simplest implementation.
- Do not proceed to M3.
