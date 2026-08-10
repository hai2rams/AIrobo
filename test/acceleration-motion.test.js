import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateAccelerationMotion,
  createAccelerationGraphs,
  createAccelerationState,
  MAX_ACCELERATION_MAGNITUDE,
  setAcceleration,
} from '../src/acceleration-motion.js';
import { createAccelerationRuntime } from '../src/acceleration-runtime.js';
import { ACCELERATION_FUNDAMENTALS_MISSION } from '../src/acceleration-fundamentals-mission.js';
import {
  BLOCK_TYPES,
  compileWorkspaceProgram,
  createBlocklyProgramController,
  DEFAULT_ACTION_DELAY_MS,
  MAX_EXECUTION_STEPS,
  MAX_REPEAT_COUNT,
  ProgramCompileError,
} from '../src/blockly-program.js';
import { createMissionRuntime } from '../src/mission-runtime.js';
import { createPhysicsRuntime } from '../src/physics-runtime.js';
import { createPlayground } from '../src/playground.js';
import { createSensorRuntime } from '../src/sensor-runtime.js';
import { simulate } from '../src/simulation-kernel.js';
import { VECTOR_EPSILON } from '../src/vector-motion.js';
import { createVectorRuntime } from '../src/vector-runtime.js';

let nextBlockId = 1;

class FakeBlock {
  constructor(type, { fields = {}, inputs = {} } = {}) {
    this.id = `m9-block-${nextBlockId++}`;
    this.type = type;
    this.fields = fields;
    this.inputs = inputs;
    this.next = null;
  }

  getFieldValue(name) {
    return this.fields[name] ?? null;
  }

  getInputTargetBlock(name) {
    return this.inputs[name] ?? null;
  }

  getNextBlock() {
    return this.next;
  }

  toString() {
    return this.type;
  }
}

function connect(...blocks) {
  blocks.forEach((block, index) => {
    block.next = blocks[index + 1] ?? null;
  });
  return blocks[0];
}

function workspaceFor(firstBlock) {
  const start = new FakeBlock(BLOCK_TYPES.WHEN_START);
  start.next = firstBlock;
  return {
    cleared: false,
    highlights: [],
    getTopBlocks() {
      return this.cleared ? [] : [start];
    },
    highlightBlock(id) {
      this.highlights.push(id);
    },
    clear() {
      this.cleared = true;
    },
  };
}

function speedBlock(speed) {
  return new FakeBlock(BLOCK_TYPES.SET_SPEED, { fields: { SPEED: speed } });
}

function accelerationBlock(acceleration) {
  return new FakeBlock(BLOCK_TYPES.SET_ACCELERATION, {
    fields: { ACCELERATION: acceleration },
  });
}

function accelerateBlock(duration) {
  return new FakeBlock(BLOCK_TYPES.ACCELERATE_FOR_TIME, {
    fields: { DURATION: duration },
  });
}

function headingBlock(heading) {
  return new FakeBlock(BLOCK_TYPES.SET_HEADING, { fields: { HEADING: heading } });
}

function accelerationRuntime(playground = createPlayground()) {
  return createAccelerationRuntime(
    createVectorRuntime(
      createPhysicsRuntime(
        createSensorRuntime(playground),
      ),
    ),
  );
}

function missionRuntime(playground = createPlayground()) {
  return createAccelerationRuntime(
    createVectorRuntime(
      createPhysicsRuntime(
        createSensorRuntime(
          createMissionRuntime(ACCELERATION_FUNDAMENTALS_MISSION, playground),
        ),
      ),
    ),
  );
}

function runAccelerationProgram({
  speed = 10,
  acceleration = 2,
  duration = 5,
  heading = null,
  runtime = accelerationRuntime(),
} = {}) {
  const blocks = [speedBlock(speed)];
  if (heading !== null) blocks.push(headingBlock(heading));
  blocks.push(accelerationBlock(acceleration), accelerateBlock(duration));
  return createBlocklyProgramController(
    workspaceFor(connect(...blocks)),
    runtime,
  ).run();
}

function near(actual, expected, epsilon = VECTOR_EPSILON) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≈ ${expected}`);
}

test('M9 mission and safety constants match their contracts', () => {
  assert.equal(MAX_ACCELERATION_MAGNITUDE, 50);
  assert.equal(MAX_REPEAT_COUNT, 100);
  assert.equal(MAX_EXECUTION_STEPS, 500);
  assert.deepEqual(ACCELERATION_FUNDAMENTALS_MISSION, {
    id: 'acceleration-fundamentals-01',
    title: 'Speed Up to the Target',
    description: 'Use initial speed, acceleration, and time to reach the target.',
    target: { x: 175, y: 200 },
    successRadius: 15,
    concepts: ['initial velocity', 'acceleration', 'final velocity', 'displacement'],
  });
});

test('SET_ACCELERATION stores valid signed acceleration without moving', () => {
  const initial = createAccelerationState();
  const updated = setAcceleration(initial, -5);
  const runtime = accelerationRuntime();
  const state = runtime.setAcceleration(-5);
  assert.equal(initial.acceleration, 0);
  assert.equal(updated.acceleration, -5);
  assert.equal(state.physics.acceleration, -5);
  assert.deepEqual(state.robot, { x: 100, y: 200, heading: 0, speed: 0 });
  assert.deepEqual(state.events, []);
});

test('positive acceleration computes final velocity and displacement', () => {
  const state = setAcceleration(createAccelerationState(), 2);
  const result = calculateAccelerationMotion(state, 10, 5, 0);
  assert.equal(result.calculation.finalVelocity, 20);
  assert.equal(result.calculation.displacement, 75);
  assert.deepEqual(result.action, { type: 'MOVE_FORWARD', distance: 75 });
  assert.equal(result.accelerationState.lastInitialVelocity, 10);
  assert.equal(result.accelerationState.lastFinalVelocity, 20);
});

test('zero acceleration exactly matches M7 constant-speed displacement', () => {
  const result = runAccelerationProgram({ acceleration: 0 });
  assert.equal(result.state.acceleration.lastCalculation.finalVelocity, 10);
  assert.equal(result.state.acceleration.lastCalculation.displacement, 50);
  assert.deepEqual(result.actions, [{ type: 'MOVE_FORWARD', distance: 50 }]);
  assert.equal(result.state.robot.x, 150);
});

test('deceleration without stopping retains positive final speed', () => {
  const result = runAccelerationProgram({ speed: 20, acceleration: -2 });
  assert.equal(result.state.physics.speed, 10);
  assert.equal(result.state.acceleration.lastDistance, 75);
  assert.equal(result.state.acceleration.lastCalculation.stoppedEarly, false);
  assert.equal(result.state.robot.x, 175);
});

test('zero crossing shortens time, stops at zero, and never reverses', () => {
  const result = runAccelerationProgram({ speed: 10, acceleration: -5, duration: 5 });
  const calculation = result.state.acceleration.lastCalculation;
  assert.equal(calculation.stoppingTime, 2);
  assert.equal(calculation.effectiveTime, 2);
  assert.equal(calculation.finalVelocity, 0);
  assert.equal(calculation.displacement, 10);
  assert.equal(calculation.stoppedEarly, true);
  assert.equal(result.state.physics.speed, 0);
  assert.equal(result.state.robot.x, 110);
  assert.ok(result.actions[0].distance >= 0);
});

test('duration zero changes neither movement coordinates nor speed', () => {
  const result = runAccelerationProgram({ speed: 10, acceleration: 2, duration: 0 });
  assert.equal(result.state.physics.speed, 10);
  assert.equal(result.actions[0].distance, 0);
  assert.equal(result.state.robot.x, 100);
  assert.equal(result.state.robot.y, 200);
});

test('sequential segments persist and reuse the prior final velocity', () => {
  const first = accelerateBlock(5);
  const second = accelerateBlock(5);
  const program = connect(speedBlock(0), accelerationBlock(2), first, second);
  const result = createBlocklyProgramController(
    workspaceFor(program),
    accelerationRuntime(),
  ).run();
  const calculations = result.state.events.filter(
    ({ type }) => type === 'ACCELERATION_CALCULATION',
  );
  assert.deepEqual(
    calculations.map(({ initialVelocity, finalVelocity, displacement }) => ({
      initialVelocity,
      finalVelocity,
      displacement,
    })),
    [
      { initialVelocity: 0, finalVelocity: 10, displacement: 25 },
      { initialVelocity: 10, finalVelocity: 20, displacement: 75 },
    ],
  );
  assert.equal(result.state.physics.speed, 20);
  assert.equal(result.state.vector.runSummary.totalDistanceTraveled, 100);
  assert.equal(result.state.robot.x, 200);
});

test('M9 sends one displacement action to M1 and never writes x or y', () => {
  const calls = [];
  const playground = createPlayground((worldState, action) => {
    calls.push({ worldState: { ...worldState }, action: { ...action } });
    return simulate(worldState, action);
  });
  const result = runAccelerationProgram({ runtime: accelerationRuntime(playground) });
  assert.deepEqual(calls, [{
    worldState: { x: 100, y: 200, heading: 0 },
    action: { type: 'MOVE_FORWARD', distance: 75 },
  }]);
  assert.equal(result.state.robot.x, 175);
  assert.equal(result.state.robot.y, 200);
  assert.equal(result.state.acceleration.lastCalculation.displacement, 75);
});

test('structured event orders acceleration, vector, movement, and mission output', () => {
  const result = runAccelerationProgram({ runtime: missionRuntime() });
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'ACCELERATION_CALCULATION',
    'VECTOR_CALCULATION',
    'ROBOT_MOVED',
    'TARGET_REACHED',
  ]);
  assert.deepEqual(result.state.events[0], {
    type: 'ACCELERATION_CALCULATION',
    concept: 'CONSTANT_ACCELERATION',
    initialVelocity: 10,
    acceleration: 2,
    requestedTime: 5,
    effectiveTime: 5,
    finalVelocity: 20,
    displacement: 75,
    headingDegrees: 0,
    stoppedEarly: false,
    equations: {
      velocity: 'vf = vi + at',
      displacement: 'd = vi t + 1/2 a t^2',
    },
  });
  assert.equal(result.state.mission.status, 'SUCCESS');
});

test('heading 90 produces +Y vector metadata matching actual M1 motion', () => {
  const result = runAccelerationProgram({ heading: 90 });
  const vector = result.state.vector.lastCalculation;
  near(vector.displacement.x, 0);
  near(vector.displacement.y, 75);
  near(vector.velocity.x, 0);
  near(vector.velocity.y, 20);
  near(result.state.robot.x, 100);
  near(result.state.robot.y, 275);
  assert.equal(result.state.acceleration.lastCalculation.headingDegrees, 90);
});

test('repeat uses the updated final speed on every acceleration segment', () => {
  const repeat = new FakeBlock(BLOCK_TYPES.REPEAT, {
    fields: { COUNT: 3 },
    inputs: { BODY: accelerateBlock(1) },
  });
  const result = createBlocklyProgramController(
    workspaceFor(connect(speedBlock(0), accelerationBlock(2), repeat)),
    accelerationRuntime(),
  ).run();
  assert.equal(result.state.physics.speed, 6);
  assert.deepEqual(
    result.state.events
      .filter(({ type }) => type === 'ACCELERATION_CALCULATION')
      .map(({ initialVelocity, finalVelocity }) => [initialVelocity, finalVelocity]),
    [[0, 2], [2, 4], [4, 6]],
  );
});

test('acceleration executes only the selected IF/ELSE branch after sensing', () => {
  const comparison = new FakeBlock(BLOCK_TYPES.LOGIC_COMPARE, {
    fields: { OP: 'LT' },
    inputs: {
      A: new FakeBlock(BLOCK_TYPES.FRONT_DISTANCE),
      B: new FakeBlock(BLOCK_TYPES.NUMBER, { fields: { NUM: 50 } }),
    },
  });
  const decelerate = accelerationBlock(-5);
  decelerate.next = accelerateBlock(2);
  const accelerate = accelerationBlock(2);
  accelerate.next = accelerateBlock(2);
  const condition = new FakeBlock(BLOCK_TYPES.IF_ELSE, {
    inputs: { CONDITION: comparison, DO: decelerate, ELSE: accelerate },
  });
  const result = createBlocklyProgramController(
    workspaceFor(connect(speedBlock(10), condition)),
    accelerationRuntime(),
  ).run();
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'SENSOR_READ',
    'ACCELERATION_CALCULATION',
    'VECTOR_CALCULATION',
    'ROBOT_MOVED',
  ]);
  assert.equal(result.state.acceleration.lastAcceleration, 2);
  assert.equal(result.state.physics.speed, 14);
});

test('invalid acceleration and duration reject before partial execution', () => {
  const invalidPrograms = [
    connect(speedBlock(10), accelerationBlock(100), accelerateBlock(5)),
    connect(speedBlock(10), accelerationBlock(Number.POSITIVE_INFINITY), accelerateBlock(5)),
    connect(speedBlock(10), accelerationBlock(2), accelerateBlock(-1)),
    connect(speedBlock(10), accelerationBlock(2), accelerateBlock(61)),
  ];
  for (const program of invalidPrograms) {
    const runtime = accelerationRuntime();
    const initial = structuredClone(runtime.getState());
    const controller = createBlocklyProgramController(workspaceFor(program), runtime);
    assert.throws(() => controller.run(), ProgramCompileError);
    assert.deepEqual(runtime.getState(), initial);
    assert.equal(controller.isRunning(), false);
  }
});

test('final speed exceeding the preserved M7 bound fails before movement', () => {
  const runtime = accelerationRuntime();
  runtime.setPhysicsSpeed(200);
  runtime.setAcceleration(50);
  const before = structuredClone(runtime.getState());
  assert.throws(() => runtime.accelerateForTime(1), /Speed must be/);
  assert.deepEqual(runtime.getState(), before);
});

test('acceleration blocks compile to IR and preserve highlighting and delays', async () => {
  const set = accelerationBlock(2);
  const accelerate = accelerateBlock(5);
  const workspace = workspaceFor(connect(speedBlock(10), set, accelerate));
  const program = compileWorkspaceProgram(workspace);
  assert.deepEqual(program.map(({ kind }) => kind), [
    'SET_SPEED',
    'SET_ACCELERATION',
    'ACCELERATE_FOR_TIME',
  ]);
  const waits = [];
  const observed = [];
  const result = await createBlocklyProgramController(
    workspace,
    accelerationRuntime(),
  ).runSequentially({
    wait(milliseconds) {
      waits.push(milliseconds);
      return Promise.resolve();
    },
    onAcceleration(state, step) {
      observed.push({ operation: step.operation, x: state.robot.x });
    },
  });
  assert.deepEqual(workspace.highlights, [
    workspace.getTopBlocks()[0].getNextBlock().id,
    set.id,
    accelerate.id,
    null,
  ]);
  assert.deepEqual(waits, Array(3).fill(DEFAULT_ACTION_DELAY_MS));
  assert.deepEqual(observed, [
    { operation: 'SET_ACCELERATION', x: 100 },
    { operation: 'ACCELERATE_FOR_TIME', x: 175 },
  ]);
  assert.equal(result.state.physics.speed, 20);
});

test('velocity-time and position-time graphs are derived from structured data', () => {
  const calculation = calculateAccelerationMotion(
    setAcceleration(createAccelerationState(), 2),
    10,
    5,
    0,
  ).calculation;
  const graphs = createAccelerationGraphs(calculation);
  assert.deepEqual(graphs.velocityTime.points, [
    { time: 0, value: 10 },
    { time: 5, value: 20 },
  ]);
  assert.equal(graphs.velocityTime.relationship, 'slope = acceleration');
  assert.equal(graphs.positionTime.points.length, 9);
  assert.equal(graphs.positionTime.points[0].value, 0);
  assert.equal(graphs.positionTime.points.at(-1).value, 75);
  const deltas = graphs.positionTime.points.slice(1).map((point, index) => (
    point.value - graphs.positionTime.points[index].value
  ));
  assert.ok(deltas.every((delta, index) => index === 0 || delta > deltas[index - 1]));
});

test('Reset clears M9 state and graphs while preserving Blockly workspace', () => {
  const first = speedBlock(10);
  const workspace = workspaceFor(connect(first, accelerationBlock(2), accelerateBlock(5)));
  const controller = createBlocklyProgramController(workspace, accelerationRuntime());
  controller.run();
  const reset = controller.resetRobot();
  assert.equal(reset.physics.speed, 0);
  assert.equal(reset.physics.acceleration, 0);
  assert.equal(reset.acceleration.lastCalculation, null);
  assert.equal(reset.acceleration.graphs, null);
  assert.deepEqual(reset.events, []);
  assert.strictEqual(workspace.getTopBlocks()[0].getNextBlock(), first);
});

test('Clear Workspace preserves acceleration, vector, physics, and robot state', () => {
  const workspace = workspaceFor(
    connect(speedBlock(10), accelerationBlock(2), accelerateBlock(5)),
  );
  const runtime = accelerationRuntime();
  const controller = createBlocklyProgramController(workspace, runtime);
  controller.run();
  const before = structuredClone(runtime.getState());
  assert.deepEqual(controller.clearWorkspace(), before);
  assert.deepEqual(runtime.getState(), before);
});

test('identical acceleration programs produce identical complete results', () => {
  assert.deepEqual(runAccelerationProgram(), runAccelerationProgram());
});
