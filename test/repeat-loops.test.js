import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BLOCK_TYPES,
  compileWorkspaceProgram,
  createBlocklyProgramController,
  DEFAULT_ACTION_DELAY_MS,
  MAX_EXECUTION_STEPS,
  MAX_REPEAT_COUNT,
  ProgramAlreadyRunningError,
  ProgramCompileError,
  ProgramExecutionError,
} from '../src/blockly-program.js';
import { createMissionRuntime } from '../src/mission-runtime.js';
import { createPlayground } from '../src/playground.js';
import { createSensorRuntime } from '../src/sensor-runtime.js';
import { simulate } from '../src/simulation-kernel.js';
import { OBSTACLES } from '../src/world-obstacles.js';

let nextBlockId = 1;

class FakeBlock {
  constructor(type, { fields = {}, inputs = {} } = {}) {
    this.id = `m6-block-${nextBlockId++}`;
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
    if (this.type === BLOCK_TYPES.REPEAT) {
      return `repeat ${this.fields.COUNT} times`;
    }
    return this.type;
  }
}

function connect(...blocks) {
  blocks.forEach((block, index) => {
    block.next = blocks[index + 1] ?? null;
  });
  return blocks[0];
}

function workspaceFor(node) {
  const start = new FakeBlock(BLOCK_TYPES.WHEN_START);
  start.next = node;
  return {
    blocks: { start, node },
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

function repeatBlock(count, body) {
  return new FakeBlock(BLOCK_TYPES.REPEAT, {
    fields: { COUNT: count },
    inputs: { BODY: body },
  });
}

function moveBlock(distance = 25) {
  return new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, {
    fields: { DISTANCE: distance },
  });
}

function sensorIfBlock({ threshold = 50, turnAngle = 90, moveDistance = 25 } = {}) {
  const sensor = new FakeBlock(BLOCK_TYPES.FRONT_DISTANCE);
  const number = new FakeBlock(BLOCK_TYPES.NUMBER, { fields: { NUM: threshold } });
  const comparison = new FakeBlock(BLOCK_TYPES.LOGIC_COMPARE, {
    fields: { OP: 'LT' },
    inputs: { A: sensor, B: number },
  });
  const turn = new FakeBlock(BLOCK_TYPES.TURN_LEFT, {
    fields: { ANGLE: turnAngle },
  });
  const move = moveBlock(moveDistance);
  const condition = new FakeBlock(BLOCK_TYPES.IF_ELSE, {
    inputs: { CONDITION: comparison, DO: turn, ELSE: move },
  });
  return { condition, sensor, comparison, turn, move };
}

test('M6 limits match the finite repeat and execution safety contracts', () => {
  assert.equal(MAX_REPEAT_COUNT, 100);
  assert.equal(MAX_EXECUTION_STEPS, 500);
});

test('repeat compiles to interpreter IR with a nested action body', () => {
  const move = moveBlock();
  const repeat = repeatBlock(4, move);
  const workspace = workspaceFor(repeat);

  const program = compileWorkspaceProgram(workspace);

  assert.equal(program.length, 1);
  assert.equal(program[0].kind, 'REPEAT');
  assert.equal(program[0].count, 4);
  assert.deepEqual(program[0].body.map(({ kind, action }) => ({ kind, action })), [
    { kind: 'ACTION', action: { type: 'MOVE_FORWARD', distance: 25 } },
  ]);
});

test('acceptance A repeats movement exactly four times using sequential WorldState', () => {
  const observedStates = [];
  const observedActions = [];
  const playground = createPlayground((worldState, action) => {
    observedStates.push({ ...worldState });
    observedActions.push({ ...action });
    return simulate(worldState, action);
  });
  const controller = createBlocklyProgramController(
    workspaceFor(repeatBlock(4, moveBlock())),
    playground,
  );

  const result = controller.run();

  assert.deepEqual(observedStates, [
    { x: 100, y: 200, heading: 0 },
    { x: 125, y: 200, heading: 0 },
    { x: 150, y: 200, heading: 0 },
    { x: 175, y: 200, heading: 0 },
  ]);
  assert.deepEqual(observedActions, Array(4).fill({
    type: 'MOVE_FORWARD',
    distance: 25,
  }));
  assert.deepEqual(result.state.robot, { x: 200, y: 200, heading: 0, speed: 0 });
  assert.deepEqual(result.state.events.map(({ type }) => type), Array(4).fill('ROBOT_MOVED'));
});

test('acceptance C repeat zero executes no body and changes no state', () => {
  const playground = createPlayground();
  const initialState = structuredClone(playground.getState());
  const controller = createBlocklyProgramController(
    workspaceFor(repeatBlock(0, moveBlock())),
    playground,
  );

  const result = controller.run();

  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.state, initialState);
  assert.deepEqual(result.state.events, []);
});

test('acceptance D invalid repeat counts reject before any movement', () => {
  for (const count of [-1, 2.5, Number.POSITIVE_INFINITY, MAX_REPEAT_COUNT + 1]) {
    const playground = createPlayground();
    const initialState = structuredClone(playground.getState());
    const controller = createBlocklyProgramController(
      workspaceFor(repeatBlock(count, moveBlock())),
      playground,
    );

    assert.throws(
      () => controller.run(),
      (error) => error instanceof ProgramCompileError
        && /finite integer from 0 to 100/.test(error.message),
    );
    assert.deepEqual(playground.getState(), initialState);
  }
});

test('acceptance B re-reads sensor and selects exactly one IF branch per iteration', () => {
  const blocks = sensorIfBlock();
  const workspace = workspaceFor(repeatBlock(4, blocks.condition));
  const controller = createBlocklyProgramController(
    workspace,
    createSensorRuntime(createPlayground()),
  );

  const result = controller.run();

  assert.deepEqual(result.actions, Array(4).fill({
    type: 'MOVE_FORWARD',
    distance: 25,
  }));
  assert.deepEqual(result.state.robot, { x: 200, y: 200, heading: 0, speed: 0 });
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'SENSOR_READ', 'ROBOT_MOVED',
    'SENSOR_READ', 'ROBOT_MOVED',
    'SENSOR_READ', 'ROBOT_MOVED',
    'SENSOR_READ', 'ROBOT_MOVED',
  ]);
  assert.deepEqual(
    result.state.events.filter(({ type }) => type === 'SENSOR_READ').map(({ value }) => value),
    [190, 165, 140, 115],
  );
});

test('IF true and ELSE branches both work inside repeat as state changes', () => {
  const blocks = sensorIfBlock();
  const nearObstacle = [{ ...OBSTACLES[0], x: 150 }];
  const controller = createBlocklyProgramController(
    workspaceFor(repeatBlock(4, blocks.condition)),
    createSensorRuntime(createPlayground(), { obstacles: nearObstacle }),
  );

  const result = controller.run();

  assert.deepEqual(result.actions, [
    { type: 'TURN', angle: 90 },
    { type: 'MOVE_FORWARD', distance: 25 },
    { type: 'MOVE_FORWARD', distance: 25 },
    { type: 'MOVE_FORWARD', distance: 25 },
  ]);
  assert.deepEqual(result.state.robot, { x: 100, y: 275, heading: 90, speed: 0 });
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'SENSOR_READ', 'ROBOT_TURNED',
    'SENSOR_READ', 'ROBOT_MOVED',
    'SENSOR_READ', 'ROBOT_MOVED',
    'SENSOR_READ', 'ROBOT_MOVED',
  ]);
});

test('repeat highlighting and visible delays recur for every iteration', async () => {
  const move = moveBlock();
  const repeat = repeatBlock(2, move);
  const workspace = workspaceFor(repeat);
  const waits = [];
  const loopStatus = [];
  const controller = createBlocklyProgramController(workspace, createPlayground());

  const result = await controller.runSequentially({
    wait(milliseconds) {
      waits.push(milliseconds);
      return Promise.resolve();
    },
    onLoop(state, step) {
      loopStatus.push({
        iteration: step.iteration,
        total: step.total,
        x: state.robot.x,
      });
    },
  });

  assert.deepEqual(result.state.robot, { x: 150, y: 200, heading: 0, speed: 0 });
  assert.deepEqual(workspace.highlights, [repeat.id, move.id, repeat.id, move.id, null]);
  assert.deepEqual(waits, Array(4).fill(DEFAULT_ACTION_DELAY_MS));
  assert.deepEqual(loopStatus, [
    { iteration: 1, total: 2, x: 100 },
    { iteration: 2, total: 2, x: 125 },
  ]);
});

test('Run Program stays locked while a repeat program is active', async () => {
  const workspace = workspaceFor(repeatBlock(2, moveBlock()));
  const controller = createBlocklyProgramController(workspace, createPlayground());
  let releaseWait;
  const waitGate = new Promise((resolve) => {
    releaseWait = resolve;
  });

  const firstRun = controller.runSequentially({ wait: () => waitGate });

  assert.equal(controller.isRunning(), true);
  await assert.rejects(controller.runSequentially(), ProgramAlreadyRunningError);
  assert.throws(() => controller.run(), ProgramAlreadyRunningError);

  releaseWait();
  await firstRun;
  assert.equal(controller.isRunning(), false);
});

test('nested finite repeats execute the correct action count', () => {
  const inner = repeatBlock(3, moveBlock());
  const outer = repeatBlock(2, inner);
  const result = createBlocklyProgramController(
    workspaceFor(outer),
    createPlayground(),
  ).run();

  assert.equal(result.actions.length, 6);
  assert.deepEqual(result.state.robot, { x: 250, y: 200, heading: 0, speed: 0 });
});

test('global execution budget stops nested loops and preserves last valid state', async () => {
  const inner = repeatBlock(MAX_REPEAT_COUNT, moveBlock(1));
  const outer = repeatBlock(MAX_REPEAT_COUNT, inner);
  const workspace = workspaceFor(outer);
  const playground = createPlayground();
  const controller = createBlocklyProgramController(workspace, playground);

  await assert.rejects(
    controller.runSequentially({ wait: () => Promise.resolve() }),
    (error) => error instanceof ProgramExecutionError
      && /500-step safety limit/.test(error.message),
  );

  const state = playground.getState();
  assert.ok(state.step > 0);
  assert.ok(state.step < MAX_REPEAT_COUNT * MAX_REPEAT_COUNT);
  assert.equal(state.events.length, state.step);
  assert.equal(state.robot.x, 100 + state.step);
  assert.equal(workspace.highlights.at(-1), null);
  assert.equal(controller.isRunning(), false);
});

test('M4 evaluates each repeated action and preserves mission success', () => {
  const mission = Object.freeze({
    id: 'm6-repeat-target',
    title: 'Repeat target',
    description: 'Reach x 150.',
    target: Object.freeze({ x: 150, y: 200 }),
    successRadius: 1,
  });
  const controller = createBlocklyProgramController(
    workspaceFor(repeatBlock(4, moveBlock())),
    createMissionRuntime(mission, createPlayground()),
  );

  const result = controller.run();

  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'ROBOT_MOVED',
    'ROBOT_MOVED',
    'TARGET_REACHED',
    'ROBOT_MOVED',
    'ROBOT_MOVED',
  ]);
  assert.equal(result.state.mission.status, 'SUCCESS');
  assert.equal(result.state.mission.targetReachedEmitted, true);
  assert.equal(result.state.robot.x, 200);
});

test('Reset cancels an active repeat safely and preserves the workspace', async () => {
  const repeat = repeatBlock(4, moveBlock());
  const workspace = workspaceFor(repeat);
  const playground = createPlayground();
  const controller = createBlocklyProgramController(workspace, playground);
  let releaseWait;
  const waitGate = new Promise((resolve) => {
    releaseWait = resolve;
  });
  const runningProgram = controller.runSequentially({ wait: () => waitGate });

  const resetState = controller.resetRobot();
  releaseWait();

  await assert.rejects(
    runningProgram,
    (error) => error instanceof ProgramExecutionError && /cancelled by Reset/.test(error.message),
  );
  assert.deepEqual(resetState.robot, { x: 100, y: 200, heading: 0, speed: 0 });
  assert.deepEqual(playground.getState().events, []);
  assert.equal(workspace.cleared, false);
  assert.strictEqual(workspace.getTopBlocks()[0].getNextBlock(), repeat);
  assert.equal(workspace.highlights.at(-1), null);
  assert.equal(controller.isRunning(), false);
});

test('same repeat program produces identical actions, state, and events', () => {
  function execute() {
    const blocks = sensorIfBlock();
    return createBlocklyProgramController(
      workspaceFor(repeatBlock(4, blocks.condition)),
      createSensorRuntime(createPlayground()),
    ).run();
  }

  assert.deepEqual(execute(), execute());
});
