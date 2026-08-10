import assert from 'node:assert/strict';
import test from 'node:test';

import { createBlocklyProgramController } from '../src/blockly-program.js';
import {
  completeMissionAttempt,
  createMissionState,
  distanceToTarget,
  evaluateMission,
  MISSION_STATUS,
  startMissionAttempt,
} from '../src/mission-evaluator.js';
import { createMissionRuntime } from '../src/mission-runtime.js';
import { createPlayground } from '../src/playground.js';
import { REACH_TARGET_MISSION } from '../src/reach-target-mission.js';

const testMission = Object.freeze({
  id: 'test-target',
  title: 'Test Target',
  description: 'Reach the test target.',
  target: Object.freeze({ x: 125, y: 200 }),
  successRadius: 10,
});

let nextBlockId = 1;

function block(type, fields = {}, next = null) {
  return {
    id: `${type}-${nextBlockId++}`,
    type,
    getFieldValue(name) {
      return fields[name] ?? null;
    },
    getNextBlock() {
      return next;
    },
    toString() {
      return type;
    },
  };
}

function acceptanceWorkspace() {
  const finalMove = block('move_forward', { DISTANCE: 25 });
  const turn = block('turn_left', { ANGLE: 15 }, finalMove);
  const firstMove = block('move_forward', { DISTANCE: 25 }, turn);
  const start = block('when_start', {}, firstMove);

  return {
    getTopBlocks() {
      return [start];
    },
    highlightBlock() {},
    clear() {},
  };
}

test('Reach Target mission definition matches the M4 contract', () => {
  assert.deepEqual(REACH_TARGET_MISSION, {
    id: 'reach-target-01',
    title: 'Reach the Target',
    description: 'Program the robot to reach the target.',
    target: { x: 500, y: 200 },
    successRadius: 15,
  });
});

test('initial mission state is deterministic and reports target distance', () => {
  const state = createMissionState(
    REACH_TARGET_MISSION,
    { x: 100, y: 200, heading: 0 },
  );

  assert.deepEqual(state, {
    missionId: 'reach-target-01',
    status: MISSION_STATUS.READY,
    attemptCount: 0,
    distanceToTarget: 400,
    targetReached: false,
    targetReachedEmitted: false,
  });
  assert.equal(distanceToTarget({ x: 3, y: 4 }, { x: 0, y: 0 }), 5);
});

test('configurable success radius includes its boundary', () => {
  let state = createMissionState(testMission, { x: 100, y: 200 });
  state = startMissionAttempt(testMission, state, { x: 100, y: 200 });

  const result = evaluateMission(
    testMission,
    state,
    { x: 115, y: 200 },
    [{ type: 'ROBOT_MOVED' }],
  );

  assert.equal(result.missionState.distanceToTarget, 10);
  assert.equal(result.missionState.status, MISSION_STATUS.SUCCESS);
  assert.deepEqual(result.events, [
    { type: 'TARGET_REACHED', missionId: 'test-target', attempt: 1 },
  ]);
});

test('mission evaluation is deterministic and does not mutate its inputs', () => {
  const missionState = Object.freeze(
    startMissionAttempt(
      testMission,
      createMissionState(testMission, { x: 100, y: 200 }),
      { x: 100, y: 200 },
    ),
  );
  const worldState = Object.freeze({ x: 125, y: 200, heading: 0 });
  const simulationEvents = Object.freeze([Object.freeze({ type: 'ROBOT_MOVED' })]);

  const first = evaluateMission(testMission, missionState, worldState, simulationEvents);
  const second = evaluateMission(testMission, missionState, worldState, simulationEvents);

  assert.deepEqual(first, second);
  assert.equal(missionState.status, MISSION_STATUS.IN_PROGRESS);
  assert.deepEqual(worldState, { x: 125, y: 200, heading: 0 });
  assert.deepEqual(simulationEvents, [{ type: 'ROBOT_MOVED' }]);
});

test('mission remains in progress outside the success radius', () => {
  let state = createMissionState(testMission, { x: 100, y: 200 });
  state = startMissionAttempt(testMission, state, { x: 100, y: 200 });

  const result = evaluateMission(
    testMission,
    state,
    { x: 110, y: 200 },
    [{ type: 'ROBOT_MOVED' }],
  );

  assert.equal(result.missionState.status, MISSION_STATUS.IN_PROGRESS);
  assert.equal(result.missionState.distanceToTarget, 15);
  assert.deepEqual(result.events, []);
  assert.equal(completeMissionAttempt(result.missionState).status, MISSION_STATUS.TRY_AGAIN);
});

test('TARGET_REACHED emits only once and success stays latched within an attempt', () => {
  let state = createMissionState(testMission, { x: 100, y: 200 });
  state = startMissionAttempt(testMission, state, { x: 100, y: 200 });

  const reached = evaluateMission(
    testMission,
    state,
    { x: 125, y: 200 },
    [{ type: 'ROBOT_MOVED' }],
  );
  const stillAtTarget = evaluateMission(
    testMission,
    reached.missionState,
    { x: 125, y: 200 },
    [{ type: 'ROBOT_STOPPED' }],
  );
  const movedAway = evaluateMission(
    testMission,
    stillAtTarget.missionState,
    { x: 200, y: 200 },
    [{ type: 'ROBOT_MOVED' }],
  );

  assert.equal(reached.events.length, 1);
  assert.deepEqual(stillAtTarget.events, []);
  assert.deepEqual(movedAway.events, []);
  assert.equal(movedAway.missionState.status, MISSION_STATUS.SUCCESS);
  assert.equal(completeMissionAttempt(movedAway.missionState).status, MISSION_STATUS.SUCCESS);
});

test('a new attempt may emit TARGET_REACHED once again', () => {
  let state = createMissionState(testMission, { x: 100, y: 200 });
  state = startMissionAttempt(testMission, state, { x: 100, y: 200 });
  state = evaluateMission(
    testMission,
    state,
    { x: 125, y: 200 },
    [{ type: 'ROBOT_MOVED' }],
  ).missionState;
  state = completeMissionAttempt(state);
  state = startMissionAttempt(testMission, state, { x: 125, y: 200 });

  const secondAttempt = evaluateMission(
    testMission,
    state,
    { x: 125, y: 200 },
    [{ type: 'ROBOT_STOPPED' }],
  );

  assert.equal(secondAttempt.missionState.attemptCount, 2);
  assert.deepEqual(secondAttempt.events, [
    { type: 'TARGET_REACHED', missionId: 'test-target', attempt: 2 },
  ]);
});

test('mission runtime evaluates after every action and orders mission events', () => {
  const zeroRadiusMission = { ...testMission, successRadius: 0 };
  const runtime = createMissionRuntime(zeroRadiusMission, createPlayground());

  runtime.beginAttempt();
  runtime.executeActions([
    { type: 'MOVE_FORWARD', distance: 25 },
    { type: 'STOP' },
  ]);
  const state = runtime.completeAttempt();

  assert.deepEqual(state.events.map(({ type }) => type), [
    'ROBOT_MOVED',
    'TARGET_REACHED',
    'ROBOT_STOPPED',
  ]);
  assert.equal(state.events.filter(({ type }) => type === 'TARGET_REACHED').length, 1);
  assert.equal(state.mission.status, MISSION_STATUS.SUCCESS);
});

test('Blockly program integration records attempts and can succeed mid-program', async () => {
  const zeroRadiusMission = { ...testMission, successRadius: 0 };
  const runtime = createMissionRuntime(zeroRadiusMission, createPlayground());
  const controller = createBlocklyProgramController(acceptanceWorkspace(), runtime);

  const result = await controller.runSequentially({
    wait: () => Promise.resolve(),
  });

  assert.equal(result.state.mission.status, MISSION_STATUS.SUCCESS);
  assert.equal(result.state.mission.attemptCount, 1);
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'ROBOT_MOVED',
    'TARGET_REACHED',
    'ROBOT_TURNED',
    'ROBOT_MOVED',
  ]);
});

test('failed Blockly attempt completes as TRY_AGAIN', async () => {
  const runtime = createMissionRuntime(REACH_TARGET_MISSION, createPlayground());
  const controller = createBlocklyProgramController(acceptanceWorkspace(), runtime);

  const result = await controller.runSequentially({
    wait: () => Promise.resolve(),
  });

  assert.equal(result.state.mission.status, MISSION_STATUS.TRY_AGAIN);
  assert.equal(result.state.mission.attemptCount, 1);
  assert.equal(result.state.mission.targetReached, false);
  assert.equal(result.state.events.some(({ type }) => type === 'TARGET_REACHED'), false);
});

test('Reset clears mission events and status while preserving attempt count', () => {
  const zeroRadiusMission = { ...testMission, successRadius: 0 };
  const runtime = createMissionRuntime(zeroRadiusMission, createPlayground());
  runtime.executeActions([{ type: 'MOVE_FORWARD', distance: 25 }]);

  const reset = runtime.execute('RESET');

  assert.equal(reset.mission.status, MISSION_STATUS.READY);
  assert.equal(reset.mission.attemptCount, 1);
  assert.equal(reset.mission.distanceToTarget, 25);
  assert.equal(reset.mission.targetReached, false);
  assert.deepEqual(reset.events, []);
  assert.deepEqual(reset.robot, { x: 100, y: 200, heading: 0, speed: 0 });
});
