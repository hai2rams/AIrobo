# SPEC_M4_REACH_TARGET_MISSION.md

## Goal

Add the first deterministic learning mission to AIrobo:

**Reach the Target**

The learner programs the robot using the existing Blockly workspace. The existing simulation kernel executes the actions. A new mission evaluator determines whether the robot reaches the target.

Do not modify the core simulation behavior.

## Architecture

Mission Definition
    ↓
Blockly Program
    ↓
Existing M1 Simulation Kernel
    ↓
WorldState + SimulationEvent[]
    ↓
Mission Evaluator
    ↓
Mission State
    ↓
SUCCESS / TRY AGAIN

The mission evaluator must read simulation state/events.

It must not inspect visual coordinates from the DOM or duplicate movement calculations.

## Scope

Implement only:

- one mission: Reach the Target
- target coordinates
- configurable success radius
- deterministic mission evaluator
- mission status
- attempt count
- success feedback
- distance-to-target display
- target reached event/result
- integration with existing Blockly program execution
- integration with Reset

Do NOT implement:

- obstacles
- collision physics
- sensors
- IF blocks
- loops
- variables
- AI coach
- AI models
- scoring system
- levels
- database
- backend/API
- authentication
- hardware integration

## Mission Definition

Create a mission definition separate from UI code.

Example:

```js
{
  id: "reach-target-01",
  title: "Reach the Target",
  description: "Program the robot to reach the target.",
  target: {
    x: 500,
    y: 200
  },
  successRadius: 15
}
