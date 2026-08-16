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
  ProgramExecutionError,
} from '../src/blockly-program.js';
import {
  appliedForceArrowRenderModel,
  assertSurfaceDefinition,
  calculateFriction,
  createFrictionState,
  DEFAULT_APPLIED_FORCE,
  DEFAULT_SURFACE,
  frictionArrowRenderModel,
  getSurface,
  LEARNING_GRAVITY,
  setAppliedForce,
  setSurface,
  SURFACES,
} from '../src/friction-motion.js';
import { FRICTION_REALISTIC_MOTION_MISSION } from '../src/friction-realistic-motion-mission.js';
import { createFrictionRuntime } from '../src/friction-runtime.js';
import { createForceRuntime } from '../src/force-runtime.js';
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
    this.id = `m11-block-${nextBlockId++}`;
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
  blocks.forEach((block, index) => { block.next = blocks[index + 1] ?? null; });
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
const surfaceBlock = (surface) => new FakeBlock(BLOCK_TYPES.SET_SURFACE, { fields: { SURFACE: surface } });
const massBlock = (mass) => new FakeBlock(BLOCK_TYPES.SET_MASS, { fields: { MASS: mass } });
const forceBlock = (force) => new FakeBlock(BLOCK_TYPES.SET_NET_FORCE, { fields: { FORCE: force } });
const applyBlock = (duration) => new FakeBlock(BLOCK_TYPES.APPLY_FORCE_FOR_TIME, { fields: { DURATION: duration } });
const headingBlock = (heading) => new FakeBlock(BLOCK_TYPES.SET_HEADING, { fields: { HEADING: heading } });

function frictionRuntime(playground = createPlayground()) {
  return createFrictionRuntime(
    createForceRuntime(
      createAccelerationRuntime(
        createVectorRuntime(
          createPhysicsRuntime(createSensorRuntime(playground)),
        ),
      ),
    ),
  );
}

function missionFrictionRuntime(playground = createPlayground()) {
  return createFrictionRuntime(
    createForceRuntime(
      createAccelerationRuntime(
        createVectorRuntime(
          createPhysicsRuntime(
            createSensorRuntime(
              createMissionRuntime(FRICTION_REALISTIC_MOTION_MISSION, playground),
            ),
          ),
        ),
      ),
    ),
  );
}

function runFrictionProgram({
  speed = 0,
  surface = 'normal',
  mass = 2,
  force = 10,
  duration = 2,
  heading = null,
  runtime = frictionRuntime(),
} = {}) {
  const blocks = [speedBlock(speed)];
  if (heading !== null) blocks.push(headingBlock(heading));
  blocks.push(surfaceBlock(surface), massBlock(mass), forceBlock(force), applyBlock(duration));
  return createBlocklyProgramController(
    workspaceFor(connect(...blocks)),
    runtime,
  ).run();
}

function near(actual, expected, epsilon = VECTOR_EPSILON) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≈ ${expected}`);
}

test('M11 constants, surfaces, mission, and inherited safety limits match the spec', () => {
  assert.equal(LEARNING_GRAVITY, 10);
  assert.equal(DEFAULT_APPLIED_FORCE, 0);
  assert.equal(DEFAULT_SURFACE.id, 'normal');
  assert.deepEqual(Object.values(SURFACES).map(({ id }) => id), ['ideal', 'smooth', 'normal', 'rough']);
  assert.equal(MAX_REPEAT_COUNT, 100);
  assert.equal(MAX_EXECUTION_STEPS, 500);
  assert.deepEqual(FRICTION_REALISTIC_MOTION_MISSION, {
    id: 'friction-realistic-motion-01',
    title: 'Move Across a Rough Surface',
    description: 'Choose enough force to overcome friction and reach the target.',
    target: { x: 200, y: 200 },
    successRadius: 15,
    concepts: ['applied force', 'friction', 'net force', 'mass', 'acceleration'],
  });
});

test('normal force equals mass times deterministic learning gravity', () => {
  const state = setAppliedForce(createFrictionState('normal'), 10);
  const result = calculateFriction(state, { mass: 2, speed: 0 });
  assert.equal(result.calculation.normalForce, 20);
  assert.equal(result.calculation.gravity, 10);
});

test('valid surfaces load their coefficients without moving the robot', () => {
  const runtime = frictionRuntime();
  const state = runtime.setSurface('rough');
  assert.equal(state.friction.surfaceId, 'rough');
  assert.equal(state.friction.muStatic, 0.6);
  assert.equal(state.friction.muKinetic, 0.45);
  assert.deepEqual(state.robot, { x: 100, y: 200, heading: 0, speed: 0 });
  assert.deepEqual(state.events, []);
});

test('invalid surface IDs and coefficient definitions fail cleanly', () => {
  assert.throws(() => getSurface('ice'), /Unknown surface/);
  assert.throws(
    () => assertSurfaceDefinition({ id: 'bad', label: 'Bad', muStatic: 0.2, muKinetic: 0.3 }),
    /coefficients/,
  );
  assert.throws(
    () => assertSurfaceDefinition({ id: 'bad', label: 'Bad', muStatic: Number.NaN, muKinetic: 0 }),
    /coefficients/,
  );
});

test('static friction limit is correct and balances sub-threshold force', () => {
  const state = setAppliedForce(createFrictionState('normal'), 5);
  const result = calculateFriction(state, { mass: 2, speed: 0 });
  assert.equal(result.calculation.staticLimit, 6);
  assert.equal(result.calculation.frictionMode, 'STATIC');
  assert.equal(result.calculation.frictionForce, -5);
  assert.equal(result.netForce, 0);
  assert.equal(result.calculation.motionStarted, false);
});

test('static threshold boundary deterministically holds the robot', () => {
  const result = calculateFriction(
    setAppliedForce(createFrictionState('normal'), 6),
    { mass: 2, speed: 0 },
  );
  assert.equal(result.calculation.frictionMode, 'STATIC');
  assert.equal(result.calculation.frictionForce, -6);
  assert.equal(result.netForce, 0);
});

test('stationary robot stays still below the static threshold', () => {
  const result = runFrictionProgram({ force: 5, duration: 3 });
  assert.equal(result.state.robot.x, 100);
  assert.equal(result.state.physics.speed, 0);
  assert.equal(result.state.acceleration.lastCalculation.displacement, 0);
  assert.equal(result.actions[0].distance, 0);
});

test('force above the static limit switches to kinetic friction', () => {
  const result = runFrictionProgram({ force: 10, duration: 2 });
  assert.equal(result.state.friction.lastCalculation.frictionMode, 'KINETIC');
  assert.equal(result.state.friction.lastFrictionForce, -4);
  assert.equal(result.state.friction.lastNetForce, 6);
  assert.equal(result.state.force.lastCalculation.acceleration, 3);
  assert.equal(result.state.physics.speed, 6);
  assert.equal(result.state.robot.x, 106);
});

test('kinetic friction opposes existing forward scalar motion', () => {
  const positiveDrive = calculateFriction(
    setAppliedForce(createFrictionState('normal'), 10),
    { mass: 2, speed: 3 },
  );
  const braking = calculateFriction(
    setAppliedForce(createFrictionState('normal'), -10),
    { mass: 2, speed: 3 },
  );
  assert.equal(positiveDrive.calculation.frictionForce, -4);
  assert.equal(positiveDrive.netForce, 6);
  assert.equal(braking.calculation.frictionForce, -4);
  assert.equal(braking.netForce, -14);
});

test('stationary robot with zero applied force has no friction or movement', () => {
  const result = runFrictionProgram({ force: 0, duration: 3 });
  assert.equal(result.state.friction.lastFrictionMode, 'NONE');
  assert.equal(result.state.friction.lastFrictionForce, 0);
  assert.equal(result.state.friction.lastNetForce, 0);
  assert.equal(result.state.robot.x, 100);
});

test('M11 passes calculated net force to M10 without deriving acceleration itself', () => {
  const calls = [];
  const state = {
    robot: { x: 100, y: 200, heading: 0, speed: 0 },
    physics: { speed: 0 },
    force: { mass: 2 },
    vector: { headingDegrees: 0 },
    events: [],
  };
  const fakeM10 = {
    getState: () => state,
    setNetForce(netForce) { calls.push(['setNetForce', netForce]); },
    applyForceForTime(duration) {
      calls.push(['applyForceForTime', duration]);
      return {
        calculation: { acceleration: 3 },
        action: { type: 'MOVE_FORWARD', distance: 6 },
      };
    },
  };
  const runtime = createFrictionRuntime(fakeM10);
  runtime.setSurface('normal');
  runtime.setAppliedForce(10);
  const result = runtime.applyForceForTime(2);
  assert.deepEqual(calls, [['setNetForce', 6], ['applyForceForTime', 2]]);
  assert.equal(result.frictionCalculation.netForce, 6);
  assert.equal('acceleration' in result.frictionCalculation, false);
});

test('event order preserves M11, M10, M9, M8, M1, and mission ownership', () => {
  const result = runFrictionProgram({
    surface: 'rough',
    force: 20,
    duration: 6,
    runtime: missionFrictionRuntime(),
  });
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'FRICTION_CALCULATION',
    'FORCE_CALCULATION',
    'ACCELERATION_CALCULATION',
    'VECTOR_CALCULATION',
    'ROBOT_MOVED',
    'TARGET_REACHED',
  ]);
  assert.equal(result.state.mission.status, 'SUCCESS');
});

test('actual x/y mutation remains exclusively in the M1 action path', () => {
  const kernelCalls = [];
  const playground = createPlayground((worldState, action) => {
    kernelCalls.push({ worldState: { ...worldState }, action: { ...action } });
    return simulate(worldState, action);
  });
  const result = runFrictionProgram({ runtime: frictionRuntime(playground) });
  assert.deepEqual(kernelCalls, [{
    worldState: { x: 100, y: 200, heading: 0 },
    action: { type: 'MOVE_FORWARD', distance: 6 },
  }]);
  assert.equal(result.state.robot.x, 106);
});

test('coasting slows a moving robot through M10 and M9', () => {
  const result = runFrictionProgram({ speed: 10, force: 0, duration: 2 });
  assert.equal(result.state.friction.lastNetForce, -4);
  assert.equal(result.state.force.lastCalculation.acceleration, -2);
  assert.equal(result.state.physics.speed, 6);
  assert.equal(result.state.acceleration.lastCalculation.displacement, 16);
});

test('a long coast stops at zero without reversal using M9 policy', () => {
  const result = runFrictionProgram({ speed: 10, force: 0, duration: 10 });
  const motion = result.state.acceleration.lastCalculation;
  assert.equal(motion.stoppingTime, 5);
  assert.equal(motion.effectiveTime, 5);
  assert.equal(motion.finalVelocity, 0);
  assert.equal(motion.displacement, 25);
  assert.equal(result.state.robot.x, 125);
});

test('rough surface produces more friction and less motion than smooth', () => {
  const smooth = runFrictionProgram({ surface: 'smooth', force: 20, duration: 3 });
  const rough = runFrictionProgram({ surface: 'rough', force: 20, duration: 3 });
  assert.ok(Math.abs(rough.state.friction.lastFrictionForce) > Math.abs(smooth.state.friction.lastFrictionForce));
  assert.ok(rough.state.friction.lastNetForce < smooth.state.friction.lastNetForce);
  assert.ok(rough.state.force.lastCalculation.acceleration < smooth.state.force.lastCalculation.acceleration);
  assert.ok(rough.state.acceleration.lastCalculation.displacement < smooth.state.acceleration.lastCalculation.displacement);
});

test('ideal surface exactly reproduces M10 force behavior', () => {
  const ideal = runFrictionProgram({ surface: 'ideal', force: 20, duration: 3 });
  const m10 = createForceRuntime(
    createAccelerationRuntime(
      createVectorRuntime(
        createPhysicsRuntime(createSensorRuntime(createPlayground())),
      ),
    ),
  );
  m10.setPhysicsSpeed(0);
  m10.setMass(2);
  m10.setNetForce(20);
  const m10Result = m10.applyForceForTime(3).state;
  assert.equal(ideal.state.friction.lastFrictionMode, 'IDEAL');
  assert.equal(ideal.state.friction.lastFrictionForce, 0);
  assert.equal(ideal.state.friction.lastNetForce, 20);
  assert.equal(ideal.state.physics.speed, m10Result.physics.speed);
  assert.equal(ideal.state.robot.x, m10Result.robot.x);
  assert.equal(ideal.state.acceleration.lastDistance, m10Result.acceleration.lastDistance);
});

test('heading 90 keeps realistic motion on +Y through M8 and M1', () => {
  const result = runFrictionProgram({ surface: 'rough', force: 20, duration: 2, heading: 90 });
  near(result.state.robot.x, 100);
  near(result.state.robot.y, 211);
  near(result.state.vector.lastCalculation.displacement.x, 0);
  near(result.state.vector.lastCalculation.displacement.y, 11);
  near(result.state.vector.lastCalculation.velocity.x, 0);
  near(result.state.vector.lastCalculation.velocity.y, 11);
});

test('repeat recalculates friction every segment from current speed', () => {
  const repeat = new FakeBlock(BLOCK_TYPES.REPEAT, {
    fields: { COUNT: 3 },
    inputs: { BODY: applyBlock(1) },
  });
  const result = createBlocklyProgramController(
    workspaceFor(connect(speedBlock(0), surfaceBlock('rough'), massBlock(2), forceBlock(20), repeat)),
    frictionRuntime(),
  ).run();
  const calculations = result.state.events.filter(({ type }) => type === 'FRICTION_CALCULATION');
  assert.equal(calculations.length, 3);
  assert.deepEqual(calculations.map(({ frictionMode }) => frictionMode), ['KINETIC', 'KINETIC', 'KINETIC']);
  assert.equal(result.state.physics.speed, 16.5);
  assert.equal(result.state.vector.runSummary.totalDistanceTraveled, 24.75);
});

test('IF/ELSE and sensor select only one applied-force branch', () => {
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
      DO: forceBlock(0),
      ELSE: forceBlock(20),
    },
  });
  const result = createBlocklyProgramController(
    workspaceFor(connect(speedBlock(0), surfaceBlock('rough'), massBlock(2), condition, applyBlock(1))),
    frictionRuntime(),
  ).run();
  assert.equal(result.state.friction.appliedForce, 20);
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'SENSOR_READ',
    'FRICTION_CALCULATION',
    'FORCE_CALCULATION',
    'ACCELERATION_CALCULATION',
    'VECTOR_CALCULATION',
    'ROBOT_MOVED',
  ]);
});

test('invalid Blockly surface rejects without partial state or active run lock', () => {
  const runtime = frictionRuntime();
  const before = structuredClone(runtime.getState());
  const controller = createBlocklyProgramController(
    workspaceFor(connect(surfaceBlock('invalid'), massBlock(2), forceBlock(20), applyBlock(1))),
    runtime,
  );
  assert.throws(() => controller.run(), ProgramCompileError);
  assert.deepEqual(runtime.getState(), before);
  assert.equal(controller.isRunning(), false);
});

test('rough-surface mission accepts a mathematically valid solution', () => {
  const result = runFrictionProgram({
    surface: 'rough',
    mass: 2,
    force: 20,
    duration: 6,
    runtime: missionFrictionRuntime(),
  });
  assert.equal(result.state.robot.x, 199);
  assert.equal(result.state.mission.status, 'SUCCESS');
  assert.equal(result.state.events.at(-1).type, 'TARGET_REACHED');
});

test('Reset restores default friction state and Clear Workspace preserves it', () => {
  const workspace = workspaceFor(connect(
    speedBlock(0), surfaceBlock('rough'), massBlock(2), forceBlock(20), applyBlock(1),
  ));
  const runtime = frictionRuntime();
  const controller = createBlocklyProgramController(workspace, runtime);
  controller.run();
  const beforeClear = structuredClone(runtime.getState());
  assert.deepEqual(controller.clearWorkspace(), beforeClear);
  const reset = controller.resetRobot();
  assert.equal(reset.friction.surfaceId, DEFAULT_SURFACE.id);
  assert.equal(reset.friction.appliedForce, DEFAULT_APPLIED_FORCE);
  assert.equal(reset.friction.lastCalculation, null);
  assert.equal(reset.friction.lastFrictionMode, null);
  assert.equal(reset.force.lastCalculation, null);
  assert.equal(reset.physics.speed, 0);
  assert.deepEqual(reset.events, []);
});

test('friction and applied-force arrows use structured signed forces', () => {
  const positive = runFrictionProgram({ force: 10 }).state;
  const applied = appliedForceArrowRenderModel(positive);
  const friction = frictionArrowRenderModel(positive);
  assert.equal(applied.transform, 'translateY(-50%) rotate(0deg)');
  assert.equal(friction.transform, 'translateY(-50%) rotate(-180deg)');
  assert.notEqual(applied.width, '0px');
  assert.notEqual(friction.width, '0px');
  const ideal = runFrictionProgram({ surface: 'ideal', force: 10 }).state;
  assert.equal(frictionArrowRenderModel(ideal).opacity, '0');
});

test('M11 blocks compile to IR and preserve highlighting and one delay per block', async () => {
  const speed = speedBlock(0);
  const surface = surfaceBlock('rough');
  const mass = massBlock(2);
  const force = forceBlock(20);
  const apply = applyBlock(1);
  const workspace = workspaceFor(connect(speed, surface, mass, force, apply));
  assert.deepEqual(
    compileWorkspaceProgram(workspace).map(({ kind }) => kind),
    ['SET_SPEED', 'SET_SURFACE', 'SET_MASS', 'SET_NET_FORCE', 'APPLY_FORCE_FOR_TIME'],
  );
  const waits = [];
  const observed = [];
  await createBlocklyProgramController(workspace, frictionRuntime()).runSequentially({
    wait(milliseconds) { waits.push(milliseconds); return Promise.resolve(); },
    onFriction(state, step) { observed.push({ operation: step.operation, x: state.robot.x }); },
  });
  assert.deepEqual(workspace.highlights, [speed.id, surface.id, mass.id, force.id, apply.id, null]);
  assert.deepEqual(waits, Array(5).fill(DEFAULT_ACTION_DELAY_MS));
  assert.deepEqual(observed, [
    { operation: 'SET_SURFACE', x: 100 },
    { operation: 'APPLY_FORCE_FOR_TIME', x: 102.75 },
  ]);
});

test('existing execution budget stops nested realistic-motion loops cleanly', () => {
  const inner = new FakeBlock(BLOCK_TYPES.REPEAT, {
    fields: { COUNT: 100 },
    inputs: { BODY: applyBlock(0) },
  });
  const outer = new FakeBlock(BLOCK_TYPES.REPEAT, {
    fields: { COUNT: 100 },
    inputs: { BODY: inner },
  });
  const controller = createBlocklyProgramController(
    workspaceFor(connect(surfaceBlock('rough'), massBlock(2), forceBlock(20), outer)),
    frictionRuntime(),
  );
  assert.throws(() => controller.run(), ProgramExecutionError);
  assert.equal(controller.isRunning(), false);
});

test('identical realistic programs are fully deterministic and finite', () => {
  const first = runFrictionProgram({ surface: 'rough', force: 20, duration: 3 });
  const second = runFrictionProgram({ surface: 'rough', force: 20, duration: 3 });
  assert.deepEqual(first, second);
  for (const value of [
    first.state.friction.lastNormalForce,
    first.state.friction.lastFrictionForce,
    first.state.friction.lastNetForce,
    first.state.force.lastCalculation.acceleration,
    first.state.acceleration.lastCalculation.displacement,
    first.state.robot.x,
  ]) {
    assert.equal(Number.isFinite(value), true);
  }
});
