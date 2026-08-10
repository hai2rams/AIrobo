import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actionFromBlock,
  BLOCK_TYPES,
  compileWorkspace,
  createBlocklyProgramController,
  DEFAULT_ACTION_DELAY_MS,
  ProgramAlreadyRunningError,
  ProgramCompileError,
} from '../src/blockly-program.js';
import { createPlayground } from '../src/playground.js';
import { simulate } from '../src/simulation-kernel.js';

class FakeBlock {
  constructor(type, fields = {}) {
    this.id = `block-${FakeBlock.nextId}`;
    FakeBlock.nextId += 1;
    this.type = type;
    this.fields = fields;
    this.next = null;
  }

  getFieldValue(name) {
    return this.fields[name] ?? null;
  }

  getNextBlock() {
    return this.next;
  }
}

FakeBlock.nextId = 1;

function connect(...blocks) {
  blocks.forEach((block, index) => {
    block.next = blocks[index + 1] ?? null;
  });
  return blocks[0];
}

function fakeWorkspace(topBlocks) {
  return {
    cleared: false,
    highlights: [],
    getTopBlocks() {
      return this.cleared ? [] : topBlocks;
    },
    clear() {
      this.cleared = true;
    },
    highlightBlock(id) {
      this.highlights.push(id);
    },
  };
}

test('Move Forward block compiles with its editable distance', () => {
  const block = new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { DISTANCE: '40' });

  assert.deepEqual(actionFromBlock(block), {
    type: 'MOVE_FORWARD',
    distance: 40,
  });
});

test('Turn Left compiles to a positive TURN angle', () => {
  const block = new FakeBlock(BLOCK_TYPES.TURN_LEFT, { ANGLE: '30' });

  assert.deepEqual(actionFromBlock(block), { type: 'TURN', angle: 30 });
});

test('Turn Right keeps a positive field but compiles to a negative TURN angle', () => {
  const block = new FakeBlock(BLOCK_TYPES.TURN_RIGHT, { ANGLE: '45' });

  assert.deepEqual(actionFromBlock(block), { type: 'TURN', angle: -45 });
});

test('compiler preserves connected block execution order', () => {
  const start = connect(
    new FakeBlock(BLOCK_TYPES.WHEN_START),
    new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { DISTANCE: 25 }),
    new FakeBlock(BLOCK_TYPES.TURN_LEFT, { ANGLE: 15 }),
    new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { DISTANCE: 50 }),
  );

  assert.deepEqual(compileWorkspace(fakeWorkspace([start])), [
    { type: 'MOVE_FORWARD', distance: 25 },
    { type: 'TURN', angle: 15 },
    { type: 'MOVE_FORWARD', distance: 50 },
  ]);
});

test('only blocks connected below When Start compile', () => {
  const disconnected = connect(
    new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { DISTANCE: 999 }),
    new FakeBlock(BLOCK_TYPES.TURN_RIGHT, { ANGLE: 90 }),
  );
  const start = connect(
    new FakeBlock(BLOCK_TYPES.WHEN_START),
    new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { DISTANCE: 25 }),
  );

  assert.deepEqual(compileWorkspace(fakeWorkspace([disconnected, start])), [
    { type: 'MOVE_FORWARD', distance: 25 },
  ]);
});

test('Run Program executes every compiled action through the existing M1 kernel', () => {
  const calls = [];
  const observedKernel = (worldState, action) => {
    calls.push({ worldState, action });
    return simulate(worldState, action);
  };
  const start = connect(
    new FakeBlock(BLOCK_TYPES.WHEN_START),
    new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { DISTANCE: 25 }),
    new FakeBlock(BLOCK_TYPES.TURN_LEFT, { ANGLE: 15 }),
  );
  const controller = createBlocklyProgramController(
    fakeWorkspace([start]),
    createPlayground(observedKernel),
  );

  const result = controller.run();

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    worldState: { x: 100, y: 200, heading: 0 },
    action: { type: 'MOVE_FORWARD', distance: 25 },
  });
  assert.deepEqual(calls[1], {
    worldState: { x: 125, y: 200, heading: 0 },
    action: { type: 'TURN', angle: 15 },
  });
  assert.deepEqual(result.actions, calls.map(({ action }) => action));
});

test('M3 acceptance program exactly matches sequential kernel state and events', () => {
  const start = connect(
    new FakeBlock(BLOCK_TYPES.WHEN_START),
    new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { DISTANCE: 25 }),
    new FakeBlock(BLOCK_TYPES.TURN_LEFT, { ANGLE: 15 }),
    new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { DISTANCE: 25 }),
  );
  const controller = createBlocklyProgramController(
    fakeWorkspace([start]),
    createPlayground(),
  );

  const result = controller.run();
  let expectedWorldState = { x: 100, y: 200, heading: 0 };
  const expectedEvents = [];
  for (const action of result.actions) {
    const kernelResult = simulate(expectedWorldState, action);
    expectedWorldState = kernelResult.worldState;
    expectedEvents.push(...kernelResult.events);
  }

  assert.deepEqual(
    {
      x: result.state.robot.x,
      y: result.state.robot.y,
      heading: result.state.robot.heading,
    },
    expectedWorldState,
  );
  assert.deepEqual(result.state.events, expectedEvents);
  assert.deepEqual(
    result.state.events.map((event) => event.type),
    ['ROBOT_MOVED', 'ROBOT_TURNED', 'ROBOT_MOVED'],
  );
  assert.equal(result.state.step, 3);
});

test('animated runner executes the full stack in order with 500 ms visible steps', async () => {
  const move = new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { DISTANCE: 25 });
  const turn = new FakeBlock(BLOCK_TYPES.TURN_LEFT, { ANGLE: 15 });
  const finalMove = new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { DISTANCE: 25 });
  const start = connect(new FakeBlock(BLOCK_TYPES.WHEN_START), move, turn, finalMove);
  const workspace = fakeWorkspace([start]);
  const kernelActions = [];
  const stepEvents = [];
  const waits = [];
  const playground = createPlayground((worldState, action) => {
    kernelActions.push(action);
    return simulate(worldState, action);
  });
  const controller = createBlocklyProgramController(workspace, playground);

  const result = await controller.runSequentially({
    wait(milliseconds) {
      waits.push(milliseconds);
      return Promise.resolve();
    },
    onStep(state, step) {
      stepEvents.push({
        blockId: step.block.id,
        index: step.index,
        event: state.events.at(-1).type,
      });
    },
  });

  assert.deepEqual(kernelActions, [
    { type: 'MOVE_FORWARD', distance: 25 },
    { type: 'TURN', angle: 15 },
    { type: 'MOVE_FORWARD', distance: 25 },
  ]);
  assert.deepEqual(waits, [
    DEFAULT_ACTION_DELAY_MS,
    DEFAULT_ACTION_DELAY_MS,
    DEFAULT_ACTION_DELAY_MS,
  ]);
  assert.deepEqual(workspace.highlights, [move.id, turn.id, finalMove.id, null]);
  assert.deepEqual(stepEvents, [
    { blockId: move.id, index: 0, event: 'ROBOT_MOVED' },
    { blockId: turn.id, index: 1, event: 'ROBOT_TURNED' },
    { blockId: finalMove.id, index: 2, event: 'ROBOT_MOVED' },
  ]);
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'ROBOT_MOVED',
    'ROBOT_TURNED',
    'ROBOT_MOVED',
  ]);
  assert.equal(controller.isRunning(), false);
});

test('animated runner rejects a second run until the first completes', async () => {
  const start = connect(
    new FakeBlock(BLOCK_TYPES.WHEN_START),
    new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { DISTANCE: 25 }),
    new FakeBlock(BLOCK_TYPES.TURN_LEFT, { ANGLE: 15 }),
  );
  const workspace = fakeWorkspace([start]);
  const controller = createBlocklyProgramController(workspace, createPlayground());
  let releaseWait;
  const waitGate = new Promise((resolve) => {
    releaseWait = resolve;
  });

  const firstRun = controller.runSequentially({ wait: () => waitGate });

  assert.equal(controller.isRunning(), true);
  await assert.rejects(
    controller.runSequentially(),
    ProgramAlreadyRunningError,
  );
  assert.throws(() => controller.run(), ProgramAlreadyRunningError);

  releaseWait();
  const result = await firstRun;

  assert.equal(result.actions.length, 2);
  assert.equal(controller.isRunning(), false);
  assert.deepEqual(workspace.highlights.at(-1), null);
});

test('missing When Start and invalid numbers reject without changing robot state', () => {
  const playground = createPlayground();
  const initialState = structuredClone(playground.getState());
  const missingStart = createBlocklyProgramController(
    fakeWorkspace([new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { DISTANCE: 25 })]),
    playground,
  );

  assert.throws(
    () => missingStart.run(),
    (error) => error instanceof ProgramCompileError && /When Start/.test(error.message),
  );
  assert.deepEqual(playground.getState(), initialState);

  const invalidStart = connect(
    new FakeBlock(BLOCK_TYPES.WHEN_START),
    new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { DISTANCE: 'not-a-number' }),
  );
  const invalidProgram = createBlocklyProgramController(
    fakeWorkspace([invalidStart]),
    playground,
  );

  assert.throws(() => invalidProgram.run(), ProgramCompileError);
  assert.deepEqual(playground.getState(), initialState);
});

test('Reset restores robot state without deleting the Blockly workspace', () => {
  const start = connect(
    new FakeBlock(BLOCK_TYPES.WHEN_START),
    new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { DISTANCE: 25 }),
  );
  const workspace = fakeWorkspace([start]);
  const playground = createPlayground();
  const controller = createBlocklyProgramController(workspace, playground);
  controller.run();

  const resetState = controller.resetRobot();

  assert.deepEqual(resetState.robot, { x: 100, y: 200, heading: 0, speed: 0 });
  assert.deepEqual(resetState.events, []);
  assert.strictEqual(workspace.getTopBlocks()[0], start);
  assert.equal(workspace.cleared, false);
});

test('Clear Workspace removes blocks without modifying robot state', () => {
  const start = connect(
    new FakeBlock(BLOCK_TYPES.WHEN_START),
    new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { DISTANCE: 25 }),
  );
  const workspace = fakeWorkspace([start]);
  const playground = createPlayground();
  const controller = createBlocklyProgramController(workspace, playground);
  controller.run();
  const stateBeforeClear = structuredClone(playground.getState());

  const stateAfterClear = controller.clearWorkspace();

  assert.equal(workspace.cleared, true);
  assert.deepEqual(workspace.getTopBlocks(), []);
  assert.deepEqual(stateAfterClear, stateBeforeClear);
  assert.deepEqual(playground.getState(), stateBeforeClear);
});
