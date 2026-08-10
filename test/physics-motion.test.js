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
import { MOTION_FUNDAMENTALS_MISSION } from '../src/motion-fundamentals-mission.js';
import {
  calculatePhysicsMotion,
  createPhysicsState,
  DEFAULT_PHYSICS_SPEED,
  MAX_MOVE_DURATION,
  MAX_PHYSICS_SPEED,
  setPhysicsSpeed,
} from '../src/physics-motion.js';
import { createPhysicsRuntime } from '../src/physics-runtime.js';
import { createPlayground } from '../src/playground.js';
import { createSensorRuntime } from '../src/sensor-runtime.js';
import { simulate } from '../src/simulation-kernel.js';

let nextBlockId = 1;

class FakeBlock {
  constructor(type, { fields = {}, inputs = {} } = {}) {
    this.id = `m7-block-${nextBlockId++}`;
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
    start,
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

function setSpeedBlock(speed) {
  return new FakeBlock(BLOCK_TYPES.SET_SPEED, { fields: { SPEED: speed } });
}

function moveForBlock(duration) {
  return new FakeBlock(BLOCK_TYPES.MOVE_FOR_TIME, {
    fields: { DURATION: duration },
  });
}

function runPhysicsProgram(speed, duration, runtime = createPhysicsRuntime(createPlayground())) {
  const speedBlock = setSpeedBlock(speed);
  const moveBlock = moveForBlock(duration);
  const workspace = workspaceFor(connect(speedBlock, moveBlock));
  return createBlocklyProgramController(workspace, runtime).run();
}

function motionMissionRuntime() {
  return createPhysicsRuntime(
    createSensorRuntime(
      createMissionRuntime(MOTION_FUNDAMENTALS_MISSION, createPlayground()),
    ),
  );
}

test('Motion Fundamentals mission matches the M7 learning contract', () => {
  assert.deepEqual(MOTION_FUNDAMENTALS_MISSION, {
    id: 'motion-fundamentals-01',
    title: 'Speed × Time',
    description: 'Use speed and time to move the robot to the target.',
    target: { x: 300, y: 200 },
    successRadius: 15,
    concepts: ['distance', 'speed', 'time'],
  });
});

test('physics state has deterministic defaults and SET_SPEED does not move', () => {
  assert.equal(DEFAULT_PHYSICS_SPEED, 0);
  assert.equal(MAX_PHYSICS_SPEED, 200);
  assert.equal(MAX_MOVE_DURATION, 60);

  const initial = Object.freeze(createPhysicsState());
  const updated = setPhysicsSpeed(initial, 20);
  const runtime = createPhysicsRuntime(createPlayground());
  const state = runtime.setPhysicsSpeed(20);

  assert.deepEqual(initial, {
    speed: 0,
    lastDuration: null,
    lastDistance: null,
    lastCalculation: null,
  });
  assert.deepEqual(updated, { ...initial, speed: 20 });
  assert.equal(state.physics.speed, 20);
  assert.deepEqual(state.robot, { x: 100, y: 200, heading: 0, speed: 0 });
  assert.deepEqual(state.events, []);
});

test('speed 20 × time 5 produces structured distance 100 and MOVE_FORWARD', () => {
  const physicsState = setPhysicsSpeed(createPhysicsState(), 20);
  const result = calculatePhysicsMotion(physicsState, 5);

  assert.deepEqual(result.action, { type: 'MOVE_FORWARD', distance: 100 });
  assert.deepEqual(result.calculation, {
    type: 'PHYSICS_CALCULATION',
    concept: 'SPEED_DISTANCE_TIME',
    speed: 20,
    time: 5,
    distance: 100,
    equation: 'distance = speed × time',
    unit: 'world-units',
  });
  assert.equal(result.physicsState.lastDuration, 5);
  assert.equal(result.physicsState.lastDistance, 100);
  assert.equal(physicsState.lastCalculation, null);
});

test('acceptance A delegates the calculated action to M1 and orders events', () => {
  const kernelCalls = [];
  const playground = createPlayground((worldState, action) => {
    kernelCalls.push({ worldState: { ...worldState }, action: { ...action } });
    return simulate(worldState, action);
  });
  const result = runPhysicsProgram(20, 5, createPhysicsRuntime(playground));

  assert.deepEqual(kernelCalls, [{
    worldState: { x: 100, y: 200, heading: 0 },
    action: { type: 'MOVE_FORWARD', distance: 100 },
  }]);
  assert.deepEqual(result.actions, [{ type: 'MOVE_FORWARD', distance: 100 }]);
  assert.deepEqual(result.state.robot, { x: 200, y: 200, heading: 0, speed: 0 });
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'PHYSICS_CALCULATION',
    'ROBOT_MOVED',
  ]);
});

test('physics supplies distance only while M1 applies heading movement math', () => {
  const playground = createPlayground();
  for (let index = 0; index < 6; index += 1) {
    playground.execute('TURN_LEFT');
  }
  const result = runPhysicsProgram(20, 5, createPhysicsRuntime(playground));

  assert.deepEqual(result.actions, [{ type: 'MOVE_FORWARD', distance: 100 }]);
  assert.equal(result.state.robot.x, 100);
  assert.equal(result.state.robot.y, 300);
  assert.equal(result.state.robot.heading, 90);
});

test('equivalent speed/time combinations produce the same distance and state', () => {
  const first = runPhysicsProgram(20, 10);
  const second = runPhysicsProgram(40, 5);

  assert.equal(first.state.physics.lastDistance, 200);
  assert.equal(second.state.physics.lastDistance, 200);
  assert.deepEqual(first.actions, [{ type: 'MOVE_FORWARD', distance: 200 }]);
  assert.deepEqual(second.actions, first.actions);
  assert.deepEqual(first.state.robot, second.state.robot);
  assert.equal(first.state.robot.x, 300);
});

test('speed persists across motions and a later SET_SPEED replaces it', () => {
  const firstSpeed = setSpeedBlock(20);
  const firstMove = moveForBlock(2);
  const secondMove = moveForBlock(3);
  const replacementSpeed = setSpeedBlock(10);
  const thirdMove = moveForBlock(2);
  const workspace = workspaceFor(connect(
    firstSpeed,
    firstMove,
    secondMove,
    replacementSpeed,
    thirdMove,
  ));
  const result = createBlocklyProgramController(
    workspace,
    createPhysicsRuntime(createPlayground()),
  ).run();

  assert.deepEqual(result.actions, [
    { type: 'MOVE_FORWARD', distance: 40 },
    { type: 'MOVE_FORWARD', distance: 60 },
    { type: 'MOVE_FORWARD', distance: 20 },
  ]);
  assert.deepEqual(
    result.state.events
      .filter(({ type }) => type === 'PHYSICS_CALCULATION')
      .map(({ distance }) => distance),
    [40, 60, 20],
  );
  assert.equal(result.state.physics.speed, 10);
  assert.equal(result.state.robot.x, 220);
});

test('zero default speed, explicit zero speed, and zero duration stay finite', () => {
  const defaultRuntime = createPhysicsRuntime(createPlayground());
  const defaultMove = createBlocklyProgramController(
    workspaceFor(moveForBlock(5)),
    defaultRuntime,
  ).run();
  const zeroSpeed = runPhysicsProgram(0, 5);
  const zeroDuration = runPhysicsProgram(20, 0);

  for (const result of [defaultMove, zeroSpeed, zeroDuration]) {
    assert.equal(result.state.physics.lastDistance, 0);
    assert.deepEqual(result.state.robot, { x: 100, y: 200, heading: 0, speed: 0 });
    assert.ok(Number.isFinite(result.actions[0].distance));
  }
});

test('invalid speeds and durations reject before partial execution', () => {
  const invalidPrograms = [
    connect(setSpeedBlock(-10), moveForBlock(5)),
    connect(setSpeedBlock(MAX_PHYSICS_SPEED + 1), moveForBlock(5)),
    connect(setSpeedBlock(Number.POSITIVE_INFINITY), moveForBlock(5)),
    connect(setSpeedBlock(20), moveForBlock(-1)),
    connect(setSpeedBlock(20), moveForBlock(MAX_MOVE_DURATION + 1)),
    connect(setSpeedBlock(20), moveForBlock(Number.POSITIVE_INFINITY)),
  ];

  for (const program of invalidPrograms) {
    const runtime = createPhysicsRuntime(createPlayground());
    const initialState = structuredClone(runtime.getState());
    const controller = createBlocklyProgramController(workspaceFor(program), runtime);

    assert.throws(
      () => controller.run(),
      (error) => error instanceof ProgramCompileError
        && /finite number from 0 to/.test(error.message),
    );
    assert.deepEqual(runtime.getState(), initialState);
  }
});

test('physics MOVE_FOR_TIME re-evaluates inside repeat with the latest speed', () => {
  const setSpeed = setSpeedBlock(10);
  const move = moveForBlock(1);
  const repeat = new FakeBlock(BLOCK_TYPES.REPEAT, {
    fields: { COUNT: 4 },
    inputs: { BODY: move },
  });
  setSpeed.next = repeat;
  const result = createBlocklyProgramController(
    workspaceFor(setSpeed),
    createPhysicsRuntime(createPlayground()),
  ).run();

  assert.deepEqual(result.actions, Array(4).fill({
    type: 'MOVE_FORWARD',
    distance: 10,
  }));
  assert.equal(result.state.robot.x, 140);
  assert.equal(
    result.state.events.filter(({ type }) => type === 'PHYSICS_CALCULATION').length,
    4,
  );
});

test('physics motion executes only the selected IF branch after sensing', () => {
  const sensor = new FakeBlock(BLOCK_TYPES.FRONT_DISTANCE);
  const threshold = new FakeBlock(BLOCK_TYPES.NUMBER, { fields: { NUM: 50 } });
  const comparison = new FakeBlock(BLOCK_TYPES.LOGIC_COMPARE, {
    fields: { OP: 'LT' },
    inputs: { A: sensor, B: threshold },
  });
  const turn = new FakeBlock(BLOCK_TYPES.TURN_LEFT, { fields: { ANGLE: 90 } });
  const physicsMove = moveForBlock(1);
  const condition = new FakeBlock(BLOCK_TYPES.IF_ELSE, {
    inputs: { CONDITION: comparison, DO: turn, ELSE: physicsMove },
  });
  const speed = setSpeedBlock(20);
  speed.next = condition;
  const runtime = createPhysicsRuntime(createSensorRuntime(createPlayground()));
  const result = createBlocklyProgramController(workspaceFor(speed), runtime).run();

  assert.deepEqual(result.actions, [{ type: 'MOVE_FORWARD', distance: 20 }]);
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'SENSOR_READ',
    'PHYSICS_CALCULATION',
    'ROBOT_MOVED',
  ]);
});

test('Motion Fundamentals mission accepts multiple valid solutions', () => {
  const first = runPhysicsProgram(20, 10, motionMissionRuntime());
  const second = runPhysicsProgram(40, 5, motionMissionRuntime());

  for (const result of [first, second]) {
    assert.equal(result.state.robot.x, 300);
    assert.equal(result.state.mission.status, 'SUCCESS');
    assert.deepEqual(result.state.events.map(({ type }) => type), [
      'PHYSICS_CALCULATION',
      'ROBOT_MOVED',
      'TARGET_REACHED',
    ]);
  }
});

test('Reset restores physics and mission state while preserving Blockly', () => {
  const speed = setSpeedBlock(40);
  const move = moveForBlock(5);
  const workspace = workspaceFor(connect(speed, move));
  const runtime = motionMissionRuntime();
  const controller = createBlocklyProgramController(workspace, runtime);
  controller.run();

  const resetState = controller.resetRobot();

  assert.deepEqual(resetState.physics, createPhysicsState());
  assert.deepEqual(resetState.robot, { x: 100, y: 200, heading: 0, speed: 0 });
  assert.equal(resetState.mission.status, 'READY');
  assert.deepEqual(resetState.events, []);
  assert.strictEqual(workspace.getTopBlocks()[0].getNextBlock(), speed);
});

test('physics blocks preserve sequential highlighting and visible delays', async () => {
  const speed = setSpeedBlock(20);
  const move = moveForBlock(5);
  const workspace = workspaceFor(connect(speed, move));
  const waits = [];
  const observed = [];
  const controller = createBlocklyProgramController(
    workspace,
    createPhysicsRuntime(createPlayground()),
  );

  const result = await controller.runSequentially({
    wait(milliseconds) {
      waits.push(milliseconds);
      return Promise.resolve();
    },
    onPhysics(state, step) {
      observed.push({
        operation: step.operation,
        blockId: step.block.id,
        x: state.robot.x,
        speed: state.physics.speed,
      });
    },
  });

  assert.deepEqual(result.actions, [{ type: 'MOVE_FORWARD', distance: 100 }]);
  assert.deepEqual(workspace.highlights, [speed.id, move.id, null]);
  assert.deepEqual(waits, [DEFAULT_ACTION_DELAY_MS, DEFAULT_ACTION_DELAY_MS]);
  assert.deepEqual(observed, [
    { operation: 'SET_SPEED', blockId: speed.id, x: 100, speed: 20 },
    { operation: 'MOVE_FOR_TIME', blockId: move.id, x: 200, speed: 20 },
  ]);
});

test('physics execution is deterministic for the same state and program', () => {
  const first = runPhysicsProgram(20, 5);
  const second = runPhysicsProgram(20, 5);

  assert.deepEqual(first, second);
});

test('Clear Workspace leaves physics, robot, and mission state unchanged', () => {
  const speed = setSpeedBlock(20);
  const move = moveForBlock(5);
  const workspace = workspaceFor(connect(speed, move));
  const runtime = motionMissionRuntime();
  const controller = createBlocklyProgramController(workspace, runtime);
  controller.run();
  const before = structuredClone(runtime.getState());

  const after = controller.clearWorkspace();

  assert.equal(workspace.cleared, true);
  assert.deepEqual(after, before);
  assert.deepEqual(runtime.getState(), before);
});

test('M7 compilation preserves validated physics IR nodes', () => {
  const speed = setSpeedBlock(20);
  const move = moveForBlock(5);
  const program = compileWorkspaceProgram(workspaceFor(connect(speed, move)));

  assert.deepEqual(program.map(({ kind }) => kind), ['SET_SPEED', 'MOVE_FOR_TIME']);
  assert.equal(program[0].speed, 20);
  assert.equal(program[1].duration, 5);
});
