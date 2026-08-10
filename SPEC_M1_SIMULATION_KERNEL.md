Goal:
Build a deterministic headless robot simulation kernel.

Inputs:
WorldState + RobotAction

Output:
New WorldState + SimulationEvent[]

Actions:
- MOVE_FORWARD
- TURN
- STOP

Rules:
- No UI
- No Blockly
- No AI
- No network/database
- Core must be framework-independent
- Same input must always produce same output

Acceptance:
Start: x=0,y=0,heading=0
MOVE 100
TURN 90
MOVE 50

Result:
x≈100
y≈50
heading=90

Events:
ROBOT_MOVED
ROBOT_TURNED
ROBOT_MOVED
