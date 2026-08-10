export const MISSION_STATUS = Object.freeze({
  READY: 'READY',
  IN_PROGRESS: 'IN_PROGRESS',
  SUCCESS: 'SUCCESS',
  TRY_AGAIN: 'TRY_AGAIN',
});

export function distanceToTarget(worldState, target) {
  return Math.hypot(worldState.x - target.x, worldState.y - target.y);
}

export function createMissionState(definition, worldState, attemptCount = 0) {
  return {
    missionId: definition.id,
    status: MISSION_STATUS.READY,
    attemptCount,
    distanceToTarget: distanceToTarget(worldState, definition.target),
    targetReached: false,
    targetReachedEmitted: false,
  };
}

export function startMissionAttempt(definition, missionState, worldState) {
  return {
    missionId: definition.id,
    status: MISSION_STATUS.IN_PROGRESS,
    attemptCount: missionState.attemptCount + 1,
    distanceToTarget: distanceToTarget(worldState, definition.target),
    targetReached: false,
    targetReachedEmitted: false,
  };
}

export function evaluateMission(
  definition,
  missionState,
  worldState,
  simulationEvents,
) {
  const distance = distanceToTarget(worldState, definition.target);

  if (simulationEvents.length === 0) {
    return {
      missionState: { ...missionState, distanceToTarget: distance },
      events: [],
    };
  }

  const reachedNow = distance <= definition.successRadius;
  const targetReached = missionState.targetReached || reachedNow;
  const shouldEmit = reachedNow && !missionState.targetReachedEmitted;

  return {
    missionState: {
      ...missionState,
      status: targetReached ? MISSION_STATUS.SUCCESS : missionState.status,
      distanceToTarget: distance,
      targetReached,
      targetReachedEmitted: missionState.targetReachedEmitted || shouldEmit,
    },
    events: shouldEmit
      ? [
          {
            type: 'TARGET_REACHED',
            missionId: definition.id,
            attempt: missionState.attemptCount,
          },
        ]
      : [],
  };
}

export function completeMissionAttempt(missionState) {
  return {
    ...missionState,
    status: missionState.targetReached
      ? MISSION_STATUS.SUCCESS
      : MISSION_STATUS.TRY_AGAIN,
  };
}
