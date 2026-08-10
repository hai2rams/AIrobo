# SPEC_M3_BLOCKLY_INTEGRATION.md

## Goal

Integrate Blockly into the existing AIrobo visual playground.

Blockly must generate RobotAction objects and execute them through the existing M1 simulation kernel.

Do not duplicate movement logic.

## Architecture

Blockly Workspace
    ↓
Compile blocks into RobotAction[]
    ↓
Existing M1 Simulation Kernel
    ↓
WorldState + SimulationEvent[]
    ↓
Existing M2 Visual Playground

The M1 kernel remains the source of truth.

Blockly must never directly modify robot x, y, or heading.

## Scope

Implement:

- Blockly workspace
- Blockly toolbox
- Run Program button
- Clear Workspace button
- Program execution through the existing kernel
- Existing state inspector continues to work
- Existing event log continues to work
- Existing manual buttons remain available for debugging

## Blockly Blocks

Support only these blocks in M3:

### When Start

A top-level starting block.

It does not generate a RobotAction itself.

### Move Forward

Default distance:

25

Produces:

{
  "type": "MOVE_FORWARD",
  "distance": 25
}

Allow the distance value to be editable.

### Turn Left

Default angle:

15

Produces:

{
  "type": "TURN",
  "angle": 15
}

Allow the angle value to be editable.

### Turn Right

Default angle:

15

Produces:

{
  "type": "TURN",
  "angle": -15
}

Allow the displayed value to remain positive for the learner.

Internally compile it into a negative TURN angle.

## Program Rules

Only blocks connected below `When Start` are executed.

Example:

When Start
    ↓
Move Forward 25
    ↓
Turn Left 15
    ↓
Move Forward 25

Compiles to:

[
  {
    "type": "MOVE_FORWARD",
    "distance": 25
  },
  {
    "type": "TURN",
    "angle": 15
  },
  {
    "type": "MOVE_FORWARD",
    "distance": 25
  }
]

## Execution

When the learner presses Run Program:

1. Read the Blockly workspace.
2. Find the When Start block.
3. Convert connected blocks into RobotAction[].
4. Execute actions sequentially through the existing M1 kernel.
5. Use each returned WorldState as input to the next action.
6. Append returned SimulationEvents to the existing event log.
7. Render the final WorldState using the existing M2 renderer.

Do not implement a second execution engine.

## Reset Behavior

Reset should:

- restore the existing M2 initial state
- clear the event log
- not delete the Blockly workspace

Clear Workspace should:

- remove learner blocks
- not alter robot state

## UI

Keep the existing visual playground.

Add a Blockly workspace beside or below the playground.

The UI should remain usable on a laptop screen.

Recommended high-level layout:

Blockly Workspace | Visual Playground | Telemetry/Event Log

Exact styling is flexible.

## Blockly Dependency

Use the official Blockly package.

Do not copy Blockly source code into the repository.

Keep dependency integration minimal.

## No M4 Features

Do NOT implement:

- repeat/loop blocks
- if/else
- variables
- sensors
- collision logic
- mission completion
- AI coach
- AI models
- hardware integration
- database/backend
- authentication

## Error Handling

If no When Start block exists:

- do not execute anything
- display a small user-friendly message

If invalid numeric input is encountered:

- reject the program cleanly
- do not corrupt WorldState

## Determinism

Given:

- the same initial WorldState
- the same Blockly program

the final WorldState and ordered event sequence must be identical.

## Tests

Add tests for:

1. Move Forward block compiles correctly.
2. Turn Left block compiles to positive TURN.
3. Turn Right block compiles to negative TURN.
4. Block execution order is preserved.
5. Only blocks connected to When Start execute.
6. Run Program uses the existing M1 kernel.
7. Final state matches sequential kernel execution.
8. Event ordering matches kernel execution.
9. Reset preserves Blockly workspace.
10. Clear Workspace does not modify robot state.
11. Existing M1 tests still pass.
12. Existing M2 tests still pass.

## Acceptance Test

Initial robot state:

x = 100
y = 200
heading = 0

Blockly program:

When Start
Move Forward 25
Turn Left 15
Move Forward 25

Expected actions:

MOVE_FORWARD 25
TURN +15
MOVE_FORWARD 25

Expected event order:

ROBOT_MOVED
ROBOT_TURNED
ROBOT_MOVED

Expected final state must exactly match running those same actions directly through the existing M1 kernel.

## Constraints

- Do not rewrite the M1 kernel.
- Do not duplicate movement calculations in Blockly code.
- Do not bypass RobotAction contracts.
- Keep Blockly-specific logic outside the simulation kernel.
- Preserve all existing M1 and M2 tests.
- Prefer the simplest implementation.
- Do not proceed to M4.
