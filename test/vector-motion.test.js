import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BLOCK_TYPES,
  compileWorkspaceProgram,
  createBlocklyProgramController,
  DEFAULT_ACTION_DELAY_MS,
  ProgramCompileError,
} from '../src/blockly-program.js';
import { createMissionRuntime } from '../src/mission-runtime.js';
import { createPhysicsRuntime } from '../src/physics-runtime.js';
import { createPlayground } from '../src/playground.js';
import { createSensorRuntime } from '../src/sensor-runtime.js';
import { simulate } from '../src/simulation-kernel.js';
import {
  deriveVectorCalculation,
  displacementAgreesWithKernel,
  normalizeHeading,
  VECTOR_EPSILON,
  velocityArrowRenderModel,
} from '../src/vector-motion.js';
import { createVectorRuntime } from '../src/vector-runtime.js';
import { VELOCITY_DIRECTION_MISSION } from '../src/velocity-direction-mission.js';

let nextBlockId = 1;

class FakeBlock {
  constructor(type, { fields = {}, inputs = {} } = {}) {
    this.id = `m8-block-${nextBlockId++}`;
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
    highlights: [],
    cleared: false,
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

function setSpeed(speed) {
  return new FakeBlock(BLOCK_TYPES.SET_SPEED, { fields: { SPEED: speed } });
}

function setHeading(heading) {
  return new FakeBlock(BLOCK_TYPES.SET_HEADING, { fields: { HEADING: heading } });
}

function moveFor(duration) {
  return new FakeBlock(BLOCK_TYPES.MOVE_FOR_TIME, { fields: { DURATION: duration } });
}

function vectorRuntime(playground = createPlayground()) {
  return createVectorRuntime(createPhysicsRuntime(createSensorRuntime(playground)));
}

function missionVectorRuntime(playground = createPlayground()) {
  return createVectorRuntime(
    createPhysicsRuntime(
      createSensorRuntime(
        createMissionRuntime(VELOCITY_DIRECTION_MISSION, playground),
      ),
    ),
  );
}

function runVectorProgram({ speed = 20, heading = 0, duration = 5, runtime } = {}) {
  const program = connect(setSpeed(speed), setHeading(heading), moveFor(duration));
  return createBlocklyProgramController(
    workspaceFor(program),
    runtime ?? vectorRuntime(),
  ).run();
}

function near(actual, expected, epsilon = VECTOR_EPSILON) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

test('M8 mission matches the velocity-direction learning contract', () => {
  assert.deepEqual(VELOCITY_DIRECTION_MISSION, {
    id: 'velocity-direction-01',
    title: 'Move in Two Dimensions',
    description: 'Choose a speed, direction, and time to reach the target.',
    target: { x: 300, y: 300 },
    successRadius: 15,
    concepts: ['speed', 'velocity', 'direction', 'displacement', 'components'],
  });
});

test('cardinal headings produce the expected velocity components', () => {
  const expected = new Map([
    [0, [20, 0]],
    [90, [0, 20]],
    [180, [-20, 0]],
    [270, [0, -20]],
  ]);

  for (const [heading, [vx, vy]] of expected) {
    const result = deriveVectorCalculation({
      speed: 20,
      headingDegrees: heading,
      duration: 5,
      distance: 100,
    });
    near(result.velocity.x, vx);
    near(result.velocity.y, vy);
  }
});

test('heading 30 derives velocity and displacement from the specified equations', () => {
  const calculation = deriveVectorCalculation({
    speed: 20,
    headingDegrees: 30,
    duration: 5,
    distance: 100,
  });

  near(calculation.velocity.x, 20 * Math.cos(Math.PI / 6));
  near(calculation.velocity.y, 20 * Math.sin(Math.PI / 6));
  near(calculation.displacement.x, 100 * Math.cos(Math.PI / 6));
  near(calculation.displacement.y, 100 * Math.sin(Math.PI / 6));
  assert.deepEqual(calculation.equations, {
    vx: 'vx = v cos(theta)',
    vy: 'vy = v sin(theta)',
    dx: 'dx = d cos(theta)',
    dy: 'dy = d sin(theta)',
  });
});

test('heading normalization is confined to the vector learning view', () => {
  assert.equal(normalizeHeading(450), 90);
  assert.equal(normalizeHeading(-90), 270);
  const worldState = { x: 100, y: 200, heading: 450 };
  const result = simulate(worldState, { type: 'TURN', angle: 15 });
  assert.equal(result.worldState.heading, 465);
  assert.equal(worldState.heading, 450);
});

test('zero speed produces a finite zero vector and no displacement', () => {
  const result = runVectorProgram({ speed: 0, heading: 45, duration: 5 });
  assert.deepEqual(result.state.vector.velocity, { magnitude: 0, x: 0, y: 0 });
  assert.deepEqual(result.state.vector.lastMovement, {
    duration: 5,
    distance: 0,
    dx: 0,
    dy: 0,
  });
  assert.equal(result.state.robot.x, 100);
  assert.equal(result.state.robot.y, 200);
});

test('set heading compiles to interpreter IR and executes through M1 TURN', () => {
  const kernelCalls = [];
  const playground = createPlayground((worldState, action) => {
    kernelCalls.push({ worldState: { ...worldState }, action: { ...action } });
    return simulate(worldState, action);
  });
  const headingBlock = setHeading(450);
  const workspace = workspaceFor(headingBlock);
  const program = compileWorkspaceProgram(workspace);
  const result = createBlocklyProgramController(workspace, vectorRuntime(playground)).run();

  assert.equal(program[0].kind, 'SET_HEADING');
  assert.equal(program[0].heading, 450);
  assert.deepEqual(kernelCalls, [{
    worldState: { x: 100, y: 200, heading: 0 },
    action: { type: 'TURN', angle: 90 },
  }]);
  assert.equal(result.state.robot.heading, 90);
  assert.equal(result.state.vector.headingDegrees, 90);
});

test('M8 derives metadata but only M1 changes x and y', () => {
  const kernelCalls = [];
  const playground = createPlayground((worldState, action) => {
    kernelCalls.push({ before: { ...worldState }, action: { ...action } });
    return simulate(worldState, action);
  });
  const result = runVectorProgram({
    speed: 20,
    heading: 30,
    duration: 5,
    runtime: vectorRuntime(playground),
  });

  assert.deepEqual(kernelCalls.map(({ action }) => action), [
    { type: 'TURN', angle: 30 },
    { type: 'MOVE_FORWARD', distance: 100 },
  ]);
  const movementCall = kernelCalls[1];
  assert.ok(displacementAgreesWithKernel(
    result.state.vector.lastCalculation,
    movementCall.before,
    result.state.robot,
  ));
  near(result.state.robot.x - movementCall.before.x, 86.60254037844386);
  near(result.state.robot.y - movementCall.before.y, 50);
});

test('structured event order preserves M7 calculation, M8 vector, then M1 movement', () => {
  const result = runVectorProgram({ heading: 30 });
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'ROBOT_TURNED',
    'PHYSICS_CALCULATION',
    'VECTOR_CALCULATION',
    'ROBOT_MOVED',
  ]);
  const vectorEvent = result.state.events[2];
  assert.equal(vectorEvent.concept, 'VELOCITY_DIRECTION');
  assert.equal(vectorEvent.speed, 20);
  assert.equal(vectorEvent.headingDegrees, 30);
  assert.equal(vectorEvent.duration, 5);
  assert.equal(vectorEvent.distance, 100);
});

test('M7 speed remains scalar state while headings change vector direction', () => {
  const east = runVectorProgram({ heading: 0 });
  const north = runVectorProgram({ heading: 90 });
  assert.equal(east.state.physics.speed, 20);
  assert.equal(north.state.physics.speed, 20);
  assert.equal(typeof east.state.physics.speed, 'number');
  assert.equal(east.state.physics.lastDistance, north.state.physics.lastDistance);
  assert.notDeepEqual(east.state.vector.velocity, north.state.vector.velocity);
  assert.notDeepEqual(east.state.robot, north.state.robot);
});

test('round trip accumulates path distance and derives zero net displacement', () => {
  const program = connect(
    setSpeed(20),
    setHeading(0),
    moveFor(5),
    setHeading(180),
    moveFor(5),
  );
  const result = createBlocklyProgramController(
    workspaceFor(program),
    vectorRuntime(),
  ).run();

  near(result.state.vector.runSummary.totalDistanceTraveled, 200);
  near(result.state.vector.runSummary.netDx, 0);
  near(result.state.vector.runSummary.netDy, 0);
  near(result.state.vector.runSummary.netDisplacement, 0);
  near(result.state.robot.x, 100);
  near(result.state.robot.y, 200);
});

test('MOVE_FOR_TIME re-reads heading on every repeat iteration', () => {
  const move = moveFor(1);
  const turn = new FakeBlock(BLOCK_TYPES.TURN_LEFT, { fields: { ANGLE: 90 } });
  move.next = turn;
  const repeat = new FakeBlock(BLOCK_TYPES.REPEAT, {
    fields: { COUNT: 2 },
    inputs: { BODY: move },
  });
  const result = createBlocklyProgramController(
    workspaceFor(connect(setSpeed(10), repeat)),
    vectorRuntime(),
  ).run();

  assert.equal(
    result.state.events.filter(({ type }) => type === 'VECTOR_CALCULATION').length,
    2,
  );
  assert.deepEqual(
    result.state.events
      .filter(({ type }) => type === 'VECTOR_CALCULATION')
      .map(({ headingDegrees }) => headingDegrees),
    [0, 90],
  );
  near(result.state.robot.x, 110);
  near(result.state.robot.y, 210);
});

test('vector motion executes only the selected IF branch', () => {
  const sensor = new FakeBlock(BLOCK_TYPES.FRONT_DISTANCE);
  const threshold = new FakeBlock(BLOCK_TYPES.NUMBER, { fields: { NUM: 50 } });
  const comparison = new FakeBlock(BLOCK_TYPES.LOGIC_COMPARE, {
    fields: { OP: 'LT' },
    inputs: { A: sensor, B: threshold },
  });
  const turn = new FakeBlock(BLOCK_TYPES.TURN_LEFT, { fields: { ANGLE: 90 } });
  const condition = new FakeBlock(BLOCK_TYPES.IF_ELSE, {
    inputs: { CONDITION: comparison, DO: turn, ELSE: moveFor(1) },
  });
  const result = createBlocklyProgramController(
    workspaceFor(connect(setSpeed(20), condition)),
    vectorRuntime(),
  ).run();

  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'SENSOR_READ',
    'PHYSICS_CALCULATION',
    'VECTOR_CALCULATION',
    'ROBOT_MOVED',
  ]);
  assert.equal(result.state.robot.heading, 0);
  assert.equal(result.state.robot.x, 120);
});

test('M4 remains authoritative for the M8 two-dimensional mission', () => {
  const distance = Math.hypot(200, 100);
  const heading = Math.atan2(100, 200) * (180 / Math.PI);
  const result = runVectorProgram({
    speed: 20,
    heading,
    duration: distance / 20,
    runtime: missionVectorRuntime(),
  });

  assert.equal(result.state.mission.status, 'SUCCESS');
  assert.equal(result.state.events.filter(({ type }) => type === 'TARGET_REACHED').length, 1);
  assert.deepEqual(result.state.events.slice(-3).map(({ type }) => type), [
    'VECTOR_CALCULATION',
    'ROBOT_MOVED',
    'TARGET_REACHED',
  ]);
});

test('velocity arrow uses structured speed and normalized heading state', () => {
  const state = runVectorProgram({ speed: 20, heading: 90, duration: 0 }).state;
  const arrow = velocityArrowRenderModel(state);
  assert.equal(arrow.left, `${state.robot.x}px`);
  assert.equal(arrow.top, `${state.world.height - state.robot.y}px`);
  assert.equal(arrow.transform, 'translateY(-50%) rotate(-90deg)');
  assert.equal(arrow.opacity, '1');
  const zeroArrow = velocityArrowRenderModel(
    runVectorProgram({ speed: 0, heading: 90, duration: 0 }).state,
  );
  assert.equal(zeroArrow.width, '0px');
  assert.equal(zeroArrow.opacity, '0');
});

test('Reset clears vector calculation and run summary but preserves workspace', () => {
  const speed = setSpeed(20);
  const heading = setHeading(30);
  const move = moveFor(5);
  const workspace = workspaceFor(connect(speed, heading, move));
  const controller = createBlocklyProgramController(workspace, vectorRuntime());
  controller.run();

  const reset = controller.resetRobot();
  assert.equal(reset.vector.lastCalculation, null);
  assert.equal(reset.vector.lastMovement, null);
  assert.equal(reset.vector.runSummary.totalDistanceTraveled, 0);
  assert.equal(reset.vector.runSummary.netDisplacement, 0);
  assert.strictEqual(workspace.getTopBlocks()[0].getNextBlock(), speed);
});

test('Clear Workspace does not change vector or robot state', () => {
  const workspace = workspaceFor(connect(setSpeed(20), setHeading(30), moveFor(5)));
  const runtime = vectorRuntime();
  const controller = createBlocklyProgramController(workspace, runtime);
  controller.run();
  const before = structuredClone(runtime.getState());

  assert.deepEqual(controller.clearWorkspace(), before);
  assert.deepEqual(runtime.getState(), before);
});

test('M8 blocks preserve sequential highlighting and the visible delay contract', async () => {
  const speed = setSpeed(20);
  const heading = setHeading(30);
  const move = moveFor(5);
  const workspace = workspaceFor(connect(speed, heading, move));
  const waits = [];
  const vectorSteps = [];
  const result = await createBlocklyProgramController(
    workspace,
    vectorRuntime(),
  ).runSequentially({
    wait(milliseconds) {
      waits.push(milliseconds);
      return Promise.resolve();
    },
    onVector(state, step) {
      vectorSteps.push({ operation: step.operation, x: state.robot.x });
    },
  });

  assert.deepEqual(workspace.highlights, [speed.id, heading.id, move.id, null]);
  assert.deepEqual(waits, Array(3).fill(DEFAULT_ACTION_DELAY_MS));
  assert.deepEqual(vectorSteps.map(({ operation }) => operation), [
    'SET_HEADING',
    'MOVE_FOR_TIME',
  ]);
  near(result.state.robot.x, 186.60254037844385);
});

test('invalid heading rejects before any partial program execution', () => {
  for (const heading of [Number.POSITIVE_INFINITY, Number.NaN]) {
    const runtime = vectorRuntime();
    const initial = structuredClone(runtime.getState());
    const controller = createBlocklyProgramController(
      workspaceFor(connect(setSpeed(20), setHeading(heading), moveFor(5))),
      runtime,
    );
    assert.throws(
      () => controller.run(),
      (error) => error instanceof ProgramCompileError
        && /Heading must be a finite number/.test(error.message),
    );
    assert.deepEqual(runtime.getState(), initial);
    assert.equal(controller.isRunning(), false);
  }
});

test('identical M8 inputs produce identical actions, state, mission, and events', () => {
  const first = runVectorProgram({ heading: 30 });
  const second = runVectorProgram({ heading: 30 });
  assert.deepEqual(first, second);
});
