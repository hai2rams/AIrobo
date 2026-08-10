import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BLOCK_TYPES,
  compileWorkspaceProgram,
  createBlocklyProgramController,
  DEFAULT_ACTION_DELAY_MS,
  ProgramCompileError,
} from '../src/blockly-program.js';
import {
  MAX_SENSOR_RANGE,
  readFrontDistance,
  SENSOR_TYPES,
  SENSOR_UNIT,
  sensorReadingEvent,
} from '../src/front-distance-sensor.js';
import { createMissionRuntime } from '../src/mission-runtime.js';
import { createPlayground } from '../src/playground.js';
import { createSensorRuntime } from '../src/sensor-runtime.js';
import { OBSTACLES } from '../src/world-obstacles.js';

let nextBlockId = 1;

class FakeBlock {
  constructor(type, { fields = {}, inputs = {} } = {}) {
    this.id = `m5-block-${nextBlockId}`;
    nextBlockId += 1;
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

function conditionalWorkspace() {
  const sensor = new FakeBlock(BLOCK_TYPES.FRONT_DISTANCE);
  const threshold = new FakeBlock(BLOCK_TYPES.NUMBER, { fields: { NUM: 50 } });
  const comparison = new FakeBlock(BLOCK_TYPES.LOGIC_COMPARE, {
    fields: { OP: 'LT' },
    inputs: { A: sensor, B: threshold },
  });
  const turn = new FakeBlock(BLOCK_TYPES.TURN_LEFT, { fields: { ANGLE: 90 } });
  const move = new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { fields: { DISTANCE: 25 } });
  const condition = new FakeBlock(BLOCK_TYPES.IF_ELSE, {
    inputs: { CONDITION: comparison, DO: turn, ELSE: move },
  });
  const start = new FakeBlock(BLOCK_TYPES.WHEN_START);
  start.next = condition;

  return {
    blocks: { sensor, comparison, turn, move, condition, start },
    highlights: [],
    getTopBlocks() {
      return [start];
    },
    highlightBlock(id) {
      this.highlights.push(id);
    },
    clear() {},
  };
}

test('M5 world defines exactly one deterministic wall obstacle', () => {
  assert.equal(MAX_SENSOR_RANGE, 500);
  assert.deepEqual(OBSTACLES, [
    {
      id: 'obstacle-01',
      type: 'wall',
      x: 300,
      y: 200,
      width: 20,
      height: 120,
    },
  ]);
});

test('front-distance sensor returns structured deterministic ray readings', () => {
  const worldState = Object.freeze({ x: 100, y: 200, heading: 0 });
  const obstacle = Object.freeze({ ...OBSTACLES[0] });
  const obstacles = Object.freeze([obstacle]);

  const first = readFrontDistance(worldState, obstacles);
  const second = readFrontDistance(worldState, obstacles);

  assert.deepEqual(first, {
    sensor: SENSOR_TYPES.FRONT_DISTANCE,
    value: 190,
    unit: SENSOR_UNIT,
  });
  assert.deepEqual(second, first);
  assert.deepEqual(worldState, { x: 100, y: 200, heading: 0 });
  assert.deepEqual(obstacle, OBSTACLES[0]);
});

test('front-distance sensor reports near hits, inside hits, and finite max range', () => {
  assert.equal(
    readFrontDistance({ x: 250, y: 200, heading: 0 }, OBSTACLES).value,
    40,
  );
  assert.equal(
    readFrontDistance({ x: 300, y: 200, heading: 0 }, OBSTACLES).value,
    0,
  );
  assert.deepEqual(
    readFrontDistance({ x: 100, y: 200, heading: 90 }, OBSTACLES),
    {
      sensor: SENSOR_TYPES.FRONT_DISTANCE,
      value: MAX_SENSOR_RANGE,
      unit: SENSOR_UNIT,
    },
  );
});

test('front-distance sensor clamps obstacles beyond its maximum range', () => {
  const distantObstacle = [{ ...OBSTACLES[0], x: 700 }];

  assert.deepEqual(
    readFrontDistance({ x: 100, y: 200, heading: 0 }, distantObstacle),
    {
      sensor: SENSOR_TYPES.FRONT_DISTANCE,
      value: 500,
      unit: SENSOR_UNIT,
    },
  );
});

test('SENSOR_READ event carries the structured reading without mutation', () => {
  const reading = Object.freeze({
    sensor: SENSOR_TYPES.FRONT_DISTANCE,
    value: 40,
    unit: SENSOR_UNIT,
  });
  const worldState = Object.freeze({ x: 250, y: 200, heading: 0 });

  assert.deepEqual(sensorReadingEvent(reading, worldState), {
    type: 'SENSOR_READ',
    sensor: SENSOR_TYPES.FRONT_DISTANCE,
    value: 40,
    unit: 'world-units',
    robotPosition: { x: 250, y: 200 },
    heading: 0,
  });
  assert.equal(reading.value, 40);
  assert.deepEqual(worldState, { x: 250, y: 200, heading: 0 });
});

test('sensor runtime emits SENSOR_READ before the resulting kernel event', () => {
  const runtime = createSensorRuntime(createPlayground());

  runtime.readSensor(SENSOR_TYPES.FRONT_DISTANCE);
  const state = runtime.executeActions([{ type: 'MOVE_FORWARD', distance: 25 }]);

  assert.deepEqual(state.events.map(({ type }) => type), [
    'SENSOR_READ',
    'ROBOT_MOVED',
  ]);
  assert.equal(state.sensors.frontDistance, 165);
  assert.deepEqual(state.obstacles, OBSTACLES);
});

test('far obstacle selects only the ELSE movement branch', () => {
  const workspace = conditionalWorkspace();
  const runtime = createSensorRuntime(createPlayground());
  const controller = createBlocklyProgramController(workspace, runtime);

  const program = compileWorkspaceProgram(workspace);
  const result = controller.run();

  assert.equal(program[0].kind, 'IF_ELSE');
  assert.deepEqual(result.actions, [{ type: 'MOVE_FORWARD', distance: 25 }]);
  assert.deepEqual(result.state.robot, { x: 125, y: 200, heading: 0, speed: 0 });
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'SENSOR_READ',
    'ROBOT_MOVED',
  ]);
});

test('Blockly, sensor events, and state use 500 when no obstacle is detected', () => {
  const workspace = conditionalWorkspace();
  const runtime = createSensorRuntime(createPlayground(), { obstacles: [] });
  const controller = createBlocklyProgramController(workspace, runtime);

  const result = controller.run();

  assert.deepEqual(result.actions, [{ type: 'MOVE_FORWARD', distance: 25 }]);
  assert.equal(result.state.sensors.frontDistance, 500);
  assert.deepEqual(result.state.events, [
    {
      type: 'SENSOR_READ',
      sensor: 'FRONT_DISTANCE',
      value: 500,
      unit: 'world-units',
      robotPosition: { x: 100, y: 200 },
      heading: 0,
    },
    { type: 'ROBOT_MOVED' },
  ]);
});

test('near obstacle selects only the IF turn branch', () => {
  const nearObstacle = [{ ...OBSTACLES[0], x: 150 }];
  const workspace = conditionalWorkspace();
  const runtime = createSensorRuntime(createPlayground(), { obstacles: nearObstacle });
  const controller = createBlocklyProgramController(workspace, runtime);

  const result = controller.run();

  assert.deepEqual(result.actions, [{ type: 'TURN', angle: 90 }]);
  assert.deepEqual(result.state.robot, { x: 100, y: 200, heading: 90, speed: 0 });
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'SENSOR_READ',
    'ROBOT_TURNED',
  ]);
});

test('acceptance scenario A reads 30 at x 250 and turns exactly +90', () => {
  const simulation = createPlayground();
  for (let index = 0; index < 6; index += 1) {
    simulation.execute('MOVE_FORWARD');
  }
  const obstacleAtAcceptanceDistance = [{ ...OBSTACLES[0], x: 290 }];
  const workspace = conditionalWorkspace();
  const runtime = createSensorRuntime(simulation, {
    obstacles: obstacleAtAcceptanceDistance,
  });
  const controller = createBlocklyProgramController(workspace, runtime);

  const result = controller.run();

  assert.deepEqual(result.actions, [{ type: 'TURN', angle: 90 }]);
  assert.deepEqual(result.state.robot, { x: 250, y: 200, heading: 90, speed: 0 });
  assert.deepEqual(result.state.events.slice(-2), [
    {
      type: 'SENSOR_READ',
      sensor: 'FRONT_DISTANCE',
      value: 30,
      unit: 'world-units',
      robotPosition: { x: 250, y: 200 },
      heading: 0,
    },
    { type: 'ROBOT_TURNED' },
  ]);
});

test('sequential conditional execution highlights IF then chosen action with delays', async () => {
  const nearObstacle = [{ ...OBSTACLES[0], x: 150 }];
  const workspace = conditionalWorkspace();
  const runtime = createSensorRuntime(createPlayground(), { obstacles: nearObstacle });
  const controller = createBlocklyProgramController(workspace, runtime);
  const waits = [];
  const observed = [];

  const result = await controller.runSequentially({
    wait(milliseconds) {
      waits.push(milliseconds);
      return Promise.resolve();
    },
    onSensor(state, step) {
      observed.push({
        kind: 'sensor',
        blockId: step.block.id,
        events: state.events.map(({ type }) => type),
      });
    },
    onStep(state, step) {
      observed.push({
        kind: 'action',
        blockId: step.block.id,
        events: state.events.map(({ type }) => type),
      });
    },
  });

  assert.deepEqual(result.actions, [{ type: 'TURN', angle: 90 }]);
  assert.deepEqual(waits, [DEFAULT_ACTION_DELAY_MS, DEFAULT_ACTION_DELAY_MS]);
  assert.deepEqual(workspace.highlights, [
    workspace.blocks.condition.id,
    workspace.blocks.turn.id,
    null,
  ]);
  assert.equal(workspace.highlights.includes(workspace.blocks.move.id), false);
  assert.deepEqual(observed, [
    {
      kind: 'sensor',
      blockId: workspace.blocks.condition.id,
      events: ['SENSOR_READ'],
    },
    {
      kind: 'action',
      blockId: workspace.blocks.turn.id,
      events: ['SENSOR_READ', 'ROBOT_TURNED'],
    },
  ]);
});

test('M4 mission evaluation still occurs after the selected RobotAction', () => {
  const mission = Object.freeze({
    id: 'm5-integration-target',
    title: 'M5 integration target',
    description: 'Reach x 125.',
    target: Object.freeze({ x: 125, y: 200 }),
    successRadius: 1,
  });
  const workspace = conditionalWorkspace();
  const runtime = createSensorRuntime(
    createMissionRuntime(mission, createPlayground()),
  );
  const controller = createBlocklyProgramController(workspace, runtime);

  const result = controller.run();

  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'SENSOR_READ',
    'ROBOT_MOVED',
    'TARGET_REACHED',
  ]);
  assert.equal(result.state.mission.status, 'SUCCESS');
});

test('invalid finite sensor output stops cleanly before either branch', async () => {
  const workspace = conditionalWorkspace();
  const simulation = createPlayground();
  const initialState = structuredClone(simulation.getState());
  let actionCalls = 0;
  const invalidSensorPlayground = {
    getState: () => simulation.getState(),
    beginAttempt() {},
    completeAttempt() {},
    readSensor() {
      return {
        reading: {
          sensor: 'FRONT_DISTANCE',
          value: Number.NaN,
          unit: 'world-units',
        },
        state: simulation.getState(),
      };
    },
    executeActions() {
      actionCalls += 1;
      return simulation.getState();
    },
  };
  const controller = createBlocklyProgramController(
    workspace,
    invalidSensorPlayground,
  );

  await assert.rejects(
    controller.runSequentially({ wait: () => Promise.resolve() }),
    (error) => error instanceof ProgramCompileError
      && /valid finite value/.test(error.message),
  );

  assert.equal(actionCalls, 0);
  assert.deepEqual(simulation.getState(), initialState);
  assert.deepEqual(workspace.highlights, [workspace.blocks.condition.id, null]);
});

test('invalid IF condition compiles no branch and preserves WorldState', () => {
  const turn = new FakeBlock(BLOCK_TYPES.TURN_LEFT, { fields: { ANGLE: 90 } });
  const move = new FakeBlock(BLOCK_TYPES.MOVE_FORWARD, { fields: { DISTANCE: 25 } });
  const condition = new FakeBlock(BLOCK_TYPES.IF_ELSE, {
    inputs: { DO: turn, ELSE: move },
  });
  const start = new FakeBlock(BLOCK_TYPES.WHEN_START);
  start.next = condition;
  const workspace = {
    getTopBlocks: () => [start],
    highlightBlock() {},
    clear() {},
  };
  const simulation = createPlayground();
  const initialState = structuredClone(simulation.getState());
  const controller = createBlocklyProgramController(workspace, simulation);

  assert.throws(() => controller.run(), ProgramCompileError);
  assert.deepEqual(simulation.getState(), initialState);
});

test('same world and program produce identical readings, actions, and events', () => {
  const first = createBlocklyProgramController(
    conditionalWorkspace(),
    createSensorRuntime(createPlayground()),
  ).run();
  const second = createBlocklyProgramController(
    conditionalWorkspace(),
    createSensorRuntime(createPlayground()),
  ).run();

  assert.deepEqual(first, second);
});

test('Reset clears sensor and simulation events while preserving the obstacle', () => {
  const workspace = conditionalWorkspace();
  const runtime = createSensorRuntime(createPlayground());
  const controller = createBlocklyProgramController(workspace, runtime);
  controller.run();

  const state = controller.resetRobot();

  assert.deepEqual(state.events, []);
  assert.deepEqual(state.obstacles, OBSTACLES);
  assert.equal(state.sensors.frontDistance, 190);
  assert.deepEqual(state.robot, { x: 100, y: 200, heading: 0, speed: 0 });
});
