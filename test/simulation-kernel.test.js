import assert from 'node:assert/strict';
import test from 'node:test';

import { simulate } from '../src/simulation-kernel.js';

test('M1 acceptance sequence reaches the expected state and emits ordered events', () => {
  let worldState = { x: 0, y: 0, heading: 0 };
  const events = [];

  for (const action of [
    { type: 'MOVE_FORWARD', distance: 100 },
    { type: 'TURN', angle: 90 },
    { type: 'MOVE_FORWARD', distance: 50 },
  ]) {
    const result = simulate(worldState, action);
    worldState = result.worldState;
    events.push(...result.events);
  }

  assert.ok(Math.abs(worldState.x - 100) < 1e-10);
  assert.ok(Math.abs(worldState.y - 50) < 1e-10);
  assert.equal(worldState.heading, 90);
  assert.deepEqual(
    events.map((event) => event.type),
    ['ROBOT_MOVED', 'ROBOT_TURNED', 'ROBOT_MOVED'],
  );
});

test('MOVE_FORWARD moves along the current heading', () => {
  const result = simulate(
    { x: 10, y: -5, heading: 180 },
    { type: 'MOVE_FORWARD', distance: 25 },
  );

  assert.ok(Math.abs(result.worldState.x - -15) < 1e-10);
  assert.ok(Math.abs(result.worldState.y - -5) < 1e-10);
  assert.equal(result.worldState.heading, 180);
  assert.deepEqual(result.events, [{ type: 'ROBOT_MOVED' }]);
});

test('TURN changes only the heading', () => {
  const result = simulate(
    { x: 4, y: 8, heading: 15 },
    { type: 'TURN', angle: -45 },
  );

  assert.deepEqual(result, {
    worldState: { x: 4, y: 8, heading: -30 },
    events: [{ type: 'ROBOT_TURNED' }],
  });
});

test('STOP preserves the state and reports that the robot stopped', () => {
  const result = simulate({ x: 4, y: 8, heading: 15 }, { type: 'STOP' });

  assert.deepEqual(result, {
    worldState: { x: 4, y: 8, heading: 15 },
    events: [{ type: 'ROBOT_STOPPED' }],
  });
});

test('simulation is deterministic and does not mutate its inputs', () => {
  const worldState = Object.freeze({ x: 3, y: 7, heading: 30 });
  const action = Object.freeze({ type: 'MOVE_FORWARD', distance: 12 });

  const first = simulate(worldState, action);
  const second = simulate(worldState, action);

  assert.deepEqual(first, second);
  assert.deepEqual(worldState, { x: 3, y: 7, heading: 30 });
  assert.deepEqual(action, { type: 'MOVE_FORWARD', distance: 12 });
  assert.notStrictEqual(first.worldState, worldState);
});

test('invalid state and actions are rejected', () => {
  assert.throws(
    () => simulate({ x: Number.NaN, y: 0, heading: 0 }, { type: 'STOP' }),
    TypeError,
  );
  assert.throws(
    () => simulate({ x: 0, y: 0, heading: 0 }, { type: 'MOVE_FORWARD' }),
    TypeError,
  );
  assert.throws(
    () => simulate({ x: 0, y: 0, heading: 0 }, { type: 'FLY' }),
    TypeError,
  );
});
