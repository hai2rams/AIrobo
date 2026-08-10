import assert from 'node:assert/strict';
import test from 'node:test';

import { simulate } from '../src/simulation-kernel.js';
import {
  actionForControl,
  createInitialState,
  createPlayground,
  robotRenderModel,
  targetRenderModel,
} from '../src/playground.js';

test('initial world, robot, and visual target match the M2 specification', () => {
  const state = createInitialState();

  assert.deepEqual(state.world, { width: 600, height: 400 });
  assert.deepEqual(state.robot, { x: 100, y: 200, heading: 0, speed: 0 });
  assert.deepEqual(state.target, { x: 500, y: 200 });
  assert.deepEqual(targetRenderModel(state), { left: '500px', top: '200px' });
});

test('UI controls translate to the specified RobotAction objects', () => {
  assert.deepEqual(actionForControl('MOVE_FORWARD'), {
    type: 'MOVE_FORWARD',
    distance: 25,
  });
  assert.deepEqual(actionForControl('TURN_LEFT'), { type: 'TURN', angle: 15 });
  assert.deepEqual(actionForControl('TURN_RIGHT'), { type: 'TURN', angle: -15 });
});

test('Move Forward invokes the existing M1 simulation kernel', () => {
  const calls = [];
  const kernel = (worldState, action) => {
    calls.push({ worldState, action });
    return simulate(worldState, action);
  };
  const playground = createPlayground(kernel);

  const state = playground.execute('MOVE_FORWARD');

  assert.deepEqual(calls, [
    {
      worldState: { x: 100, y: 200, heading: 0 },
      action: { type: 'MOVE_FORWARD', distance: 25 },
    },
  ]);
  assert.deepEqual(state.robot, { x: 125, y: 200, heading: 0, speed: 0 });
  assert.deepEqual(state.events, [{ type: 'ROBOT_MOVED' }]);
});

test('Turn Left invokes TURN with positive 15 degrees', () => {
  let receivedAction;
  const playground = createPlayground((worldState, action) => {
    receivedAction = action;
    return simulate(worldState, action);
  });

  playground.execute('TURN_LEFT');

  assert.deepEqual(receivedAction, { type: 'TURN', angle: 15 });
  assert.equal(playground.getState().robot.heading, 15);
});

test('Turn Right invokes TURN with negative 15 degrees', () => {
  let receivedAction;
  const playground = createPlayground((worldState, action) => {
    receivedAction = action;
    return simulate(worldState, action);
  });

  playground.execute('TURN_RIGHT');

  assert.deepEqual(receivedAction, { type: 'TURN', angle: -15 });
  assert.equal(playground.getState().robot.heading, -15);
});

test('Reset restores the complete initial state', () => {
  const playground = createPlayground();
  playground.execute('MOVE_FORWARD');
  playground.execute('TURN_LEFT');

  const resetState = playground.execute('RESET');

  assert.deepEqual(resetState, createInitialState());
  assert.deepEqual(resetState.events, []);
  assert.equal(resetState.step, 0);
  assert.equal(resetState.time, 0);
});

test('robot rendering is derived from the WorldState returned by the kernel', () => {
  const returnedWorldState = { x: 321, y: 123, heading: 47 };
  const playground = createPlayground(() => ({
    worldState: returnedWorldState,
    events: [{ type: 'ROBOT_MOVED' }],
  }));

  const state = playground.execute('MOVE_FORWARD');
  const renderModel = robotRenderModel(state);

  assert.deepEqual(
    { x: state.robot.x, y: state.robot.y, heading: state.robot.heading },
    returnedWorldState,
  );
  assert.deepEqual(renderModel, {
    left: '321px',
    top: '277px',
    transform: 'translate(-50%, -50%) rotate(-47deg)',
  });
});

test('M2 acceptance sequence matches M1 state and ordered kernel events', () => {
  const playground = createPlayground();

  playground.execute('MOVE_FORWARD');
  playground.execute('TURN_LEFT');
  const state = playground.execute('MOVE_FORWARD');

  let expectedWorldState = { x: 100, y: 200, heading: 0 };
  const expectedEvents = [];
  for (const action of [
    { type: 'MOVE_FORWARD', distance: 25 },
    { type: 'TURN', angle: 15 },
    { type: 'MOVE_FORWARD', distance: 25 },
  ]) {
    const result = simulate(expectedWorldState, action);
    expectedWorldState = result.worldState;
    expectedEvents.push(...result.events);
  }

  assert.deepEqual(
    { x: state.robot.x, y: state.robot.y, heading: state.robot.heading },
    expectedWorldState,
  );
  assert.deepEqual(state.events, expectedEvents);
  assert.deepEqual(
    state.events.map((event) => event.type),
    ['ROBOT_MOVED', 'ROBOT_TURNED', 'ROBOT_MOVED'],
  );
  assert.deepEqual(robotRenderModel(state), {
    left: `${expectedWorldState.x}px`,
    top: `${400 - expectedWorldState.y}px`,
    transform: `translate(-50%, -50%) rotate(${-expectedWorldState.heading}deg)`,
  });
  assert.equal(state.step, 3);
  assert.equal(state.time, 3);
});
