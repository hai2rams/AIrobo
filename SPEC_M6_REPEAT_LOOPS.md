# SPEC_M6_REPEAT_LOOPS.md

## Goal

Add deterministic finite repeat-loop support to AIrobo.

The learner should be able to repeat a sequence of existing Blockly commands multiple times.

Example:

when start

repeat 4 times
    if front distance < 50
        turn left 90
    else
        move forward 25

M6 must preserve the existing M1–M5 architecture.

Do not add while loops, infinite loops, variables, AI, advanced physics, backend, database, or hardware integration.

---

## Architecture

Blockly Program
    ↓
Program Interpreter
    ↓
REPEAT node
    ↓
Execute child statements N times
    ↓
Existing sensor / IF logic
    ↓
RobotAction
    ↓
Existing M1 Kernel
    ↓
WorldState + Events
    ↓
Existing M4 Mission Evaluator
    ↓
UI / Telemetry / Event Log

Loop execution belongs to the program interpreter.

The M1 simulation kernel must remain unaware of Blockly loops.

---

## Scope

Implement only:

- Blockly `repeat N times` block
- deterministic finite-loop execution
- nested execution of existing action blocks
- existing IF / ELSE support inside repeat
- existing sensor reads inside repeat
- block highlighting for each loop iteration
- safe maximum iteration count
- loop status / execution feedback
- tests for repeat behavior

Do NOT implement:

- while loops
- repeat-until
- infinite loops
- variables
- counters exposed to learners
- break / continue
- functions
- multiple robots
- new sensors
- AI
- camera
- advanced physics
- backend/database
- hardware integration

---

## Blockly Block

Add a loop block:

```text
repeat [4] times
    [statements]
```

Default count:

```text
4
```

The count must be editable.

The repeat block may contain:

- MOVE_FORWARD
- TURN LEFT
- TURN RIGHT
- IF / ELSE
- FRONT_DISTANCE comparisons
- another finite repeat block if nested loops are supported safely

---

## Loop Count Validation

The loop count must be:

- finite
- integer
- greater than or equal to 0
- less than or equal to MAX_REPEAT_COUNT

Recommended:

```text
MAX_REPEAT_COUNT = 100
```

Invalid counts must fail cleanly.

Examples:

```text
repeat -1 times  -> invalid
repeat 2.5 times -> invalid
repeat Infinity  -> invalid
repeat 101 times -> invalid
```

A count of:

```text
0
```

is valid and executes the body zero times.

---

## Intermediate Representation

Extend the existing program representation.

Example:

```js
{
  type: "REPEAT",
  count: 4,
  body: [
    {
      type: "ACTION",
      action: {
        type: "MOVE_FORWARD",
        distance: 25
      }
    }
  ]
}
```

Existing IF representation should continue to work.

Example:

```js
{
  type: "REPEAT",
  count: 4,
  body: [
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
}
```

Exact internal structure is flexible.

Architectural rule:

- loop control belongs to program interpreter
- IF control belongs to program interpreter
- sensor geometry belongs to sensor layer
- movement belongs to M1 kernel

---

## Execution Semantics

For:

```text
repeat N times
    BODY
```

execute:

```text
BODY
BODY
BODY
...
```

exactly N times unless execution is stopped by a valid runtime safety condition.

Each iteration must use the latest WorldState produced by the previous iteration.

Example:

```text
Initial x = 100

repeat 4 times
    move forward 25
```

Expected:

```text
Iteration 1 -> x = 125
Iteration 2 -> x = 150
Iteration 3 -> x = 175
Iteration 4 -> x = 200
```

---

## Sensor Re-evaluation

Sensors inside a loop must be re-read every iteration.

Do not cache one sensor value for the whole loop.

Example:

```text
repeat 4 times
    if front distance < 50
        turn left 90
    else
        move forward 25
```

Each iteration:

1. read current FRONT_DISTANCE
2. emit SENSOR_READ
3. evaluate IF
4. execute selected branch
5. update WorldState
6. evaluate M4 mission
7. continue to next iteration using the new state

This is essential.

---

## Event Ordering

Preserve deterministic event ordering.

Example:

```text
repeat 2 times
    if front distance < 50
        turn left 90
    else
        move forward 25
```

A possible event stream:

```text
SENSOR_READ
ROBOT_MOVED
SENSOR_READ
ROBOT_TURNED
```

The exact action event depends on state and sensor value.

Do not emit fake movement events for loop control itself.

---

## Loop Events

Loop-specific events are optional in M6.

If added, keep them separate from M1 simulation events.

Possible structured events:

```js
{
  type: "LOOP_ITERATION_STARTED",
  iteration: 1,
  total: 4
}
```

and:

```js
{
  type: "LOOP_COMPLETED",
  iterations: 4
}
```

Do not require these if they add unnecessary complexity.

The important events remain the actual sensor and robot action events.

---

## Program Highlighting

Preserve existing M3/M5 highlighting behavior.

During a repeat loop:

- highlight the REPEAT block when the loop begins
- highlight each child block when it executes
- repeat highlighting for each iteration
- selected IF branch should highlight
- unselected branch must not highlight as executed
- remove highlight when program completes

Existing presentation delay remains in the program runner/UI layer.

Do not add delay to the M1 kernel.

---

## Execution Status

During execution, optionally display:

```text
Repeat 2 of 4
```

or equivalent.

This is learner-facing presentation only.

Do not make execution semantics depend on UI status.

---

## Run Lock

Preserve existing behavior:

- Run Program is disabled while execution is active
- a second run cannot start concurrently
- program state remains deterministic

---

## Safety Guard

Introduce a global execution-step safety budget.

Recommended:

```text
MAX_EXECUTION_STEPS = 500
```

Every executable operation counts toward the budget.

Examples:

- RobotAction execution
- sensor evaluation
- loop-body execution step

Exact accounting is flexible, but the purpose is to prevent accidental runaway nested programs.

If the limit is exceeded:

- stop execution cleanly
- show a learner-friendly message
- preserve the last valid WorldState
- do not corrupt mission state
- do not crash the page

This safety budget belongs to the program interpreter/runtime.

Do not put it in M1.

---

## Nested Repeat

Nested finite repeat loops may be supported.

Example:

```text
repeat 2 times
    repeat 3 times
        move forward 25
```

Expected total movement actions:

```text
6
```

If nested loops are implemented, the global MAX_EXECUTION_STEPS safety guard must still apply.

If nested loops materially complicate M6, they may be deferred.

If deferred, reject nested REPEAT blocks clearly.

Do not silently execute them incorrectly.

---

## Existing Mission Integration

M4 mission evaluation must continue after every actual RobotAction.

Example:

```text
repeat 10 times
    move forward 25
```

If the robot reaches the target during iteration 6:

```text
mission status = SUCCESS
TARGET_REACHED emitted once
```

Later iterations must not revert mission success.

Whether remaining loop iterations continue or stop after mission success should preserve the existing M4 semantics.

For M6, preferred behavior:

```text
mission success does NOT automatically terminate the program
```

unless current M4 behavior already does so.

Do not introduce a new rule accidentally.

---

## Reset Behavior

Reset must:

- restore robot initial state
- restore mission READY state
- clear events as currently defined
- preserve Blockly workspace
- cancel an active program safely if required

Existing M1–M5 Reset semantics should otherwise remain unchanged.

---

## Clear Workspace

Existing behavior remains unchanged.

Clear Workspace:

- removes Blockly blocks
- does not directly alter robot state
- does not directly alter mission state

---

## Determinism

Given the same:

- WorldState
- world definition
- Blockly program

the same:

- number of iterations
- sensor readings
- branch decisions
- RobotActions
- final WorldState
- mission state
- event order

must be produced every time.

No randomness.

---

## Acceptance Scenario A — Simple Repeat

Initial:

```text
x = 100
y = 200
heading = 0
```

Program:

```text
when start

repeat 4 times
    move forward 25
```

Expected:

```text
x = 200
y = 200
heading = 0
```

Expected movement events:

```text
ROBOT_MOVED
ROBOT_MOVED
ROBOT_MOVED
ROBOT_MOVED
```

---

## Acceptance Scenario B — Repeat with Sensor + IF

Program:

```text
when start

repeat 4 times
    if front distance < 50
        turn left 90
    else
        move forward 25
```

Expected:

- sensor is re-read every iteration
- exactly one IF branch executes each iteration
- selected action uses existing M1 kernel
- event order remains deterministic

---

## Acceptance Scenario C — Zero Iterations

Program:

```text
repeat 0 times
    move forward 25
```

Expected:

```text
robot state unchanged
no ROBOT_MOVED event
program completes cleanly
```

---

## Acceptance Scenario D — Invalid Count

Program:

```text
repeat 101 times
    move forward 25
```

with:

```text
MAX_REPEAT_COUNT = 100
```

Expected:

- program rejected cleanly
- no movement occurs
- WorldState remains unchanged
- learner-friendly error shown

---

## Tests

Add tests for at minimum:

1. repeat 4 executes body exactly 4 times
2. repeat 0 executes body zero times
3. repeat count must be integer
4. negative repeat count rejected
5. repeat count above MAX_REPEAT_COUNT rejected
6. sequential WorldState flows between iterations
7. movement events occur once per executed movement
8. sensor is re-read every iteration
9. IF true branch works inside repeat
10. ELSE branch works inside repeat
11. only one branch executes per iteration
12. event ordering remains deterministic
13. existing highlighting works across iterations
14. Run Program remains locked during execution
15. execution-step safety budget stops runaway execution
16. M4 mission evaluation still runs after each RobotAction
17. mission success remains preserved
18. existing M1 tests pass
19. existing M2 tests pass
20. existing M3 tests pass
21. existing M4 tests pass
22. existing M5 tests pass

If nested loops are implemented, also test:

23. nested finite repeats execute correct total count
24. nested loops respect MAX_EXECUTION_STEPS

---

## UI

Add the repeat block to the Blockly toolbox.

Minimal learner-facing form:

```text
repeat [4] times
    ...
```

Do not redesign the full interface.

Preserve:

- Blockly workspace
- playground
- mission panel
- telemetry
- sensor telemetry
- event log
- debug controls

---

## Error Handling

Invalid repeat programs must:

- stop cleanly
- not partially execute before validation if practical
- not corrupt WorldState
- show understandable feedback

Execution-budget exhaustion must:

- stop safely
- preserve last valid state
- clear active highlighting
- restore Run Program availability

---

## Constraints

- Do not modify M1 simulation semantics.
- Do not put loops inside the M1 kernel.
- Do not duplicate movement calculations.
- Preserve M1–M5 architecture.
- No while loops.
- No infinite loops.
- No AI.
- No new sensors.
- No advanced physics.
- No backend/database.
- No hardware integration.
- Do not proceed to M7.
