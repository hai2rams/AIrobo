import assert from 'node:assert/strict';
import test from 'node:test';

import { createAccelerationRuntime } from '../src/acceleration-runtime.js';
import {
  BLOCK_TYPES,
  compileWorkspaceProgram,
  createBlocklyProgramController,
  DEFAULT_ACTION_DELAY_MS,
  MAX_EXECUTION_STEPS,
  MAX_REPEAT_COUNT,
  ProgramCompileError,
} from '../src/blockly-program.js';
import {
  accelerationArrowRenderModel,
  calculateForce,
  createForceState,
  DEFAULT_MASS,
  DEFAULT_NET_FORCE,
  forceArrowRenderModel,
  MAX_FORCE_MAGNITUDE,
  MAX_MASS,
  MIN_MASS,
  setMass,
  setNetForce,
} from '../src/force-mass.js';
import { createForceRuntime } from '../src/force-runtime.js';
import { createMissionRuntime } from '../src/mission-runtime.js';
import { NEWTON_SECOND_LAW_MISSION } from '../src/newton-second-law-mission.js';
import { createPhysicsRuntime } from '../src/physics-runtime.js';
import { createPlayground } from '../src/playground.js';
import { createSensorRuntime } from '../src/sensor-runtime.js';
import { simulate } from '../src/simulation-kernel.js';
import { VECTOR_EPSILON } from '../src/vector-motion.js';
import { createVectorRuntime } from '../src/vector-runtime.js';

let nextBlockId = 1;

class FakeBlock {
  constructor(type, { fields = {}, inputs = {} } = {}) {
    this.id = `m10-block-${nextBlockId++}`;
    this.type = type;
    this.fields = fields;
    this.inputs = inputs;
    this.next = null;
  }
  getFieldValue(name) { return this.fields[name] ?? null; }
  getInputTargetBlock(name) { return this.inputs[name] ?? null; }
  getNextBlock() { return this.next; }
  toString() { return this.type; }
}

function connect(...blocks) {
  blocks.forEach((block, index) => { blocks[index].next = blocks[index + 1] ?? null; });
  return blocks[0];
}

function workspaceFor(firstBlock) {
  const start = new FakeBlock(BLOCK_TYPES.WHEN_START);
  start.next = firstBlock;
  return {
    cleared: false,
    highlights: [],
    getTopBlocks() { return this.cleared ? [] : [start]; },
    highlightBlock(id) { this.highlights.push(id); },
    clear() { this.cleared = true; },
  };
}

const speedBlock = (speed) => new FakeBlock(BLOCK_TYPES.SET_SPEED, { fields: { SPEED: speed } });
const massBlock = (mass) => new FakeBlock(BLOCK_TYPES.SET_MASS, { fields: { MASS: mass } });
const forceBlock = (force) => new FakeBlock(BLOCK_TYPES.SET_NET_FORCE, { fields: { FORCE: force } });
const applyBlock = (duration) => new FakeBlock(BLOCK_TYPES.APPLY_FORCE_FOR_TIME, { fields: { DURATION: duration } });
const headingBlock = (heading) => new FakeBlock(BLOCK_TYPES.SET_HEADING, { fields: { HEADING: heading } });

function forceRuntime(playground = createPlayground()) {
  return createForceRuntime(
    createAccelerationRuntime(
      createVectorRuntime(
        createPhysicsRuntime(createSensorRuntime(playground)),
      ),
    ),
  );
}

function missionForceRuntime(playground = createPlayground()) {
  return createForceRuntime(
    createAccelerationRuntime(
      createVectorRuntime(
        createPhysicsRuntime(
          createSensorRuntime(
            createMissionRuntime(NEWTON_SECOND_LAW_MISSION, playground),
          ),
        ),
      ),
    ),
  );
}

function runForceProgram({
  speed = 0,
  mass = 4,
  force = 20,
  duration = 2,
  heading = null,
  runtime = forceRuntime(),
} = {}) {
  const blocks = [speedBlock(speed)];
  if (heading !== null) blocks.push(headingBlock(heading));
  blocks.push(massBlock(mass), forceBlock(force), applyBlock(duration));
  return createBlocklyProgramController(
    workspaceFor(connect(...blocks)),
    runtime,
  ).run();
}

function near(actual, expected, epsilon = VECTOR_EPSILON) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≈ ${expected}`);
}

test('M10 constants, defaults, mission, and inherited safety limits match the spec', () => {
  assert.equal(DEFAULT_MASS, 1);
  assert.equal(DEFAULT_NET_FORCE, 0);
  assert.equal(MIN_MASS, 0.1);
  assert.equal(MAX_MASS, 100);
  assert.equal(MAX_FORCE_MAGNITUDE, 500);
  assert.equal(MAX_REPEAT_COUNT, 100);
  assert.equal(MAX_EXECUTION_STEPS, 500);
  assert.deepEqual(NEWTON_SECOND_LAW_MISSION, {
    id: 'newton-second-law-01',
    title: 'Force, Mass, Motion',
    description: 'Choose mass, force, and time to reach the target.',
    target: { x: 200, y: 200 },
    successRadius: 15,
    concepts: ['force', 'mass', 'acceleration', 'velocity', 'displacement', "Newton's Second Law"],
  });
});

test('valid mass and force persist without moving the robot', () => {
  const initial = createForceState();
  const withMass = setMass(initial, 4);
  const withForce = setNetForce(withMass, -20);
  const runtime = forceRuntime();
  runtime.setMass(4);
  const state = runtime.setNetForce(-20);
  assert.equal(withMass.mass, 4);
  assert.equal(withForce.netForce, -20);
  assert.equal(state.physics.mass, 4);
  assert.equal(state.physics.netForce, -20);
  assert.deepEqual(state.robot, { x: 100, y: 200, heading: 0, speed: 0 });
  assert.deepEqual(state.events, []);
});

test('zero, negative, non-finite, and excessive mass are rejected', () => {
  for (const mass of [0, -2, Number.POSITIVE_INFINITY, MAX_MASS + 1]) {
    assert.throws(() => setMass(createForceState(), mass), /Mass must be/);
  }
});

test('non-finite and excessive force are rejected', () => {
  for (const force of [Number.POSITIVE_INFINITY, MAX_FORCE_MAGNITUDE + 1, -MAX_FORCE_MAGNITUDE - 1]) {
    assert.throws(() => setNetForce(createForceState(), force), /Net force must be/);
  }
});

test('Newton calculation derives acceleration only from force divided by mass', () => {
  const state = setNetForce(setMass(createForceState(), 4), 20);
  const result = calculateForce(state, 3);
  assert.equal(result.acceleration, 5);
  assert.deepEqual(result.calculation, {
    type: 'FORCE_CALCULATION',
    concept: 'NEWTON_SECOND_LAW',
    mass: 4,
    netForce: 20,
    acceleration: 5,
    requestedTime: 3,
    equation: 'a = F_net / m',
  });
  assert.equal('finalVelocity' in result.calculation, false);
  assert.equal('displacement' in result.calculation, false);
});

test('mass and force comparisons preserve Newton proportionality', () => {
  const force20Mass2 = calculateForce(setNetForce(setMass(createForceState(), 2), 20), 1);
  const force20Mass4 = calculateForce(setNetForce(setMass(createForceState(), 4), 20), 1);
  const force8Mass4 = calculateForce(setNetForce(setMass(createForceState(), 4), 8), 1);
  assert.equal(force20Mass2.acceleration, 10);
  assert.equal(force20Mass4.acceleration, 5);
  assert.equal(force8Mass4.acceleration, 2);
  assert.ok(force20Mass2.acceleration > force20Mass4.acceleration);
  assert.ok(force20Mass4.acceleration > force8Mass4.acceleration);
});

test('basic F/m delegates displacement to M9 and movement to M1', () => {
  const kernelCalls = [];
  const playground = createPlayground((worldState, action) => {
    kernelCalls.push({ worldState: { ...worldState }, action: { ...action } });
    return simulate(worldState, action);
  });
  const result = runForceProgram({ runtime: forceRuntime(playground) });
  assert.equal(result.state.force.lastCalculation.acceleration, 5);
  assert.equal(result.state.acceleration.lastCalculation.finalVelocity, 10);
  assert.equal(result.state.acceleration.lastCalculation.displacement, 10);
  assert.deepEqual(kernelCalls, [{
    worldState: { x: 100, y: 200, heading: 0 },
    action: { type: 'MOVE_FORWARD', distance: 10 },
  }]);
  assert.equal(result.state.robot.x, 110);
});

test('M10 runtime calls the reusable M9 constant-acceleration entry point', () => {
  const calls = [];
  const state = {
    physics: { speed: 0 },
    robot: { x: 0, y: 0, heading: 0 },
    vector: { headingDegrees: 0 },
    events: [],
  };
  const fakeM9 = {
    getState: () => state,
    executeConstantAcceleration(acceleration, duration) {
      calls.push({ acceleration, duration });
      return {
        calculation: { finalVelocity: 10, displacement: 10 },
        vectorCalculation: {},
        action: { type: 'MOVE_FORWARD', distance: 10 },
        displacementMatchesKernel: true,
      };
    },
  };
  const runtime = createForceRuntime(fakeM9);
  runtime.setMass(4);
  runtime.setNetForce(20);
  runtime.applyForceForTime(2);
  assert.deepEqual(calls, [{ acceleration: 5, duration: 2 }]);
});

test('force event precedes the reused M9, M8, M1, and mission events', () => {
  const result = runForceProgram({
    mass: 2,
    force: 4,
    duration: 10,
    runtime: missionForceRuntime(),
  });
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'FORCE_CALCULATION',
    'ACCELERATION_CALCULATION',
    'VECTOR_CALCULATION',
    'ROBOT_MOVED',
    'TARGET_REACHED',
  ]);
  assert.equal(result.state.mission.status, 'SUCCESS');
  assert.equal(result.state.robot.x, 200);
});

test('zero force reduces to constant velocity through M9', () => {
  const result = runForceProgram({ speed: 10, mass: 4, force: 0, duration: 5 });
  assert.equal(result.state.force.lastCalculation.acceleration, 0);
  assert.equal(result.state.physics.speed, 10);
  assert.equal(result.state.acceleration.lastDistance, 50);
  assert.equal(result.state.robot.x, 150);
});

test('negative force reuses M9 early stopping with no reversal', () => {
  const result = runForceProgram({ speed: 10, mass: 2, force: -10, duration: 5 });
  const motion = result.state.acceleration.lastCalculation;
  assert.equal(result.state.force.lastCalculation.acceleration, -5);
  assert.equal(motion.stoppingTime, 2);
  assert.equal(motion.finalVelocity, 0);
  assert.equal(motion.displacement, 10);
  assert.equal(result.state.robot.x, 110);
  assert.ok(result.actions[0].distance >= 0);
});

test('force persists and sequential segments reuse the latest velocity', () => {
  const first = applyBlock(2);
  const second = applyBlock(2);
  const result = createBlocklyProgramController(
    workspaceFor(connect(speedBlock(0), massBlock(2), forceBlock(4), first, second)),
    forceRuntime(),
  ).run();
  const motions = result.state.events.filter(({ type }) => type === 'ACCELERATION_CALCULATION');
  assert.deepEqual(motions.map(({ initialVelocity, finalVelocity, displacement }) => ({
    initialVelocity, finalVelocity, displacement,
  })), [
    { initialVelocity: 0, finalVelocity: 4, displacement: 4 },
    { initialVelocity: 4, finalVelocity: 8, displacement: 12 },
  ]);
  assert.equal(result.state.force.netForce, 4);
  assert.equal(result.state.vector.runSummary.totalDistanceTraveled, 16);
});

test('changed mass affects the next segment while force persists', () => {
  const result = createBlocklyProgramController(
    workspaceFor(connect(
      speedBlock(0), forceBlock(20), massBlock(2), applyBlock(1), massBlock(4), applyBlock(1),
    )),
    forceRuntime(),
  ).run();
  assert.deepEqual(
    result.state.events.filter(({ type }) => type === 'FORCE_CALCULATION').map(({ acceleration }) => acceleration),
    [10, 5],
  );
  assert.deepEqual(
    result.state.events.filter(({ type }) => type === 'ACCELERATION_CALCULATION').map(({ initialVelocity }) => initialVelocity),
    [0, 10],
  );
  assert.equal(result.state.force.mass, 4);
});

test('heading 90 integrates M8 vector values with actual +Y M1 movement', () => {
  const result = runForceProgram({ heading: 90 });
  near(result.state.vector.lastCalculation.displacement.x, 0);
  near(result.state.vector.lastCalculation.displacement.y, 10);
  near(result.state.vector.lastCalculation.velocity.x, 0);
  near(result.state.vector.lastCalculation.velocity.y, 10);
  near(result.state.robot.x, 100);
  near(result.state.robot.y, 210);
});

test('repeat uses latest mass, force, and velocity each iteration', () => {
  const repeat = new FakeBlock(BLOCK_TYPES.REPEAT, {
    fields: { COUNT: 3 },
    inputs: { BODY: applyBlock(1) },
  });
  const result = createBlocklyProgramController(
    workspaceFor(connect(speedBlock(0), massBlock(2), forceBlock(4), repeat)),
    forceRuntime(),
  ).run();
  assert.equal(result.state.physics.speed, 6);
  assert.equal(result.state.events.filter(({ type }) => type === 'FORCE_CALCULATION').length, 3);
});

test('force works with sensor-selected IF/ELSE control flow', () => {
  const comparison = new FakeBlock(BLOCK_TYPES.LOGIC_COMPARE, {
    fields: { OP: 'LT' },
    inputs: {
      A: new FakeBlock(BLOCK_TYPES.FRONT_DISTANCE),
      B: new FakeBlock(BLOCK_TYPES.NUMBER, { fields: { NUM: 50 } }),
    },
  });
  const condition = new FakeBlock(BLOCK_TYPES.IF_ELSE, {
    inputs: {
      CONDITION: comparison,
      DO: forceBlock(-20),
      ELSE: forceBlock(20),
    },
  });
  const result = createBlocklyProgramController(
    workspaceFor(connect(speedBlock(0), massBlock(4), condition, applyBlock(1))),
    forceRuntime(),
  ).run();
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'SENSOR_READ',
    'FORCE_CALCULATION',
    'ACCELERATION_CALCULATION',
    'VECTOR_CALCULATION',
    'ROBOT_MOVED',
  ]);
  assert.equal(result.state.force.netForce, 20);
});

test('invalid Blockly mass, force, and duration reject without partial state', () => {
  const invalidPrograms = [
    connect(speedBlock(10), massBlock(0), forceBlock(20), applyBlock(2)),
    connect(speedBlock(10), massBlock(4), forceBlock(501), applyBlock(2)),
    connect(speedBlock(10), massBlock(4), forceBlock(20), applyBlock(-1)),
  ];
  for (const program of invalidPrograms) {
    const runtime = forceRuntime();
    const before = structuredClone(runtime.getState());
    const controller = createBlocklyProgramController(workspaceFor(program), runtime);
    assert.throws(() => controller.run(), ProgramCompileError);
    assert.deepEqual(runtime.getState(), before);
    assert.equal(controller.isRunning(), false);
  }
});

test('force and acceleration arrows use structured signed force and mass', () => {
  const positive = runForceProgram().state;
  const forceArrow = forceArrowRenderModel(positive);
  const accelerationArrow = accelerationArrowRenderModel(positive);
  assert.equal(forceArrow.transform, 'translateY(-50%) rotate(0deg)');
  assert.equal(accelerationArrow.transform, 'translateY(-50%) rotate(0deg)');
  assert.notEqual(forceArrow.width, '0px');
  assert.notEqual(accelerationArrow.width, '0px');
  const negativeRuntime = forceRuntime();
  negativeRuntime.setMass(2);
  const negative = negativeRuntime.setNetForce(-10);
  assert.equal(forceArrowRenderModel(negative).transform, 'translateY(-50%) rotate(-180deg)');
  const zero = forceRuntime().getState();
  assert.equal(forceArrowRenderModel(zero).opacity, '0');
  assert.equal(accelerationArrowRenderModel(zero).opacity, '0');
});

test('M10 blocks compile to IR and preserve highlighting and delays', async () => {
  const speed = speedBlock(0);
  const mass = massBlock(4);
  const force = forceBlock(20);
  const apply = applyBlock(2);
  const workspace = workspaceFor(connect(speed, mass, force, apply));
  assert.deepEqual(
    compileWorkspaceProgram(workspace).map(({ kind }) => kind),
    ['SET_SPEED', 'SET_MASS', 'SET_NET_FORCE', 'APPLY_FORCE_FOR_TIME'],
  );
  const waits = [];
  const observed = [];
  await createBlocklyProgramController(workspace, forceRuntime()).runSequentially({
    wait(milliseconds) { waits.push(milliseconds); return Promise.resolve(); },
    onForce(state, step) { observed.push({ operation: step.operation, x: state.robot.x }); },
  });
  assert.deepEqual(workspace.highlights, [speed.id, mass.id, force.id, apply.id, null]);
  assert.deepEqual(waits, Array(4).fill(DEFAULT_ACTION_DELAY_MS));
  assert.deepEqual(observed, [
    { operation: 'SET_MASS', x: 100 },
    { operation: 'SET_NET_FORCE', x: 100 },
    { operation: 'APPLY_FORCE_FOR_TIME', x: 110 },
  ]);
});

test('Reset restores force/mass state and Clear Workspace preserves live state', () => {
  const first = speedBlock(0);
  const workspace = workspaceFor(connect(first, massBlock(2), forceBlock(4), applyBlock(2)));
  const runtime = forceRuntime();
  const controller = createBlocklyProgramController(workspace, runtime);
  controller.run();
  const beforeClear = structuredClone(runtime.getState());
  assert.deepEqual(controller.clearWorkspace(), beforeClear);
  const reset = controller.resetRobot();
  assert.equal(reset.force.mass, DEFAULT_MASS);
  assert.equal(reset.force.netForce, DEFAULT_NET_FORCE);
  assert.equal(reset.force.lastCalculation, null);
  assert.equal(reset.physics.speed, 0);
  assert.equal(reset.acceleration.lastCalculation, null);
  assert.deepEqual(reset.events, []);
});

test('identical force programs produce identical complete results', () => {
  assert.deepEqual(runForceProgram(), runForceProgram());
});
