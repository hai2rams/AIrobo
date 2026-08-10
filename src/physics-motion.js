export const DEFAULT_PHYSICS_SPEED = 0;
export const MAX_PHYSICS_SPEED = 200;
export const MAX_MOVE_DURATION = 60;
export const PHYSICS_CONCEPT = 'SPEED_DISTANCE_TIME';
export const PHYSICS_EQUATION = 'distance = speed × time';
export const DISTANCE_UNIT = 'world-units';

export function createPhysicsState() {
  return {
    speed: DEFAULT_PHYSICS_SPEED,
    lastDuration: null,
    lastDistance: null,
    lastCalculation: null,
  };
}

export function setPhysicsSpeed(physicsState, speed) {
  assertPhysicsState(physicsState);
  assertSpeed(speed);

  return {
    ...physicsState,
    speed,
  };
}

export function calculatePhysicsMotion(physicsState, duration) {
  assertPhysicsState(physicsState);
  assertDuration(duration);

  const distance = physicsState.speed * duration;
  const calculation = {
    type: 'PHYSICS_CALCULATION',
    concept: PHYSICS_CONCEPT,
    speed: physicsState.speed,
    time: duration,
    distance,
    equation: PHYSICS_EQUATION,
    unit: DISTANCE_UNIT,
  };

  return {
    action: {
      type: 'MOVE_FORWARD',
      distance,
    },
    calculation,
    physicsState: {
      ...physicsState,
      lastDuration: duration,
      lastDistance: distance,
      lastCalculation: { ...calculation },
    },
  };
}

export function assertSpeed(speed) {
  if (!Number.isFinite(speed) || speed < 0 || speed > MAX_PHYSICS_SPEED) {
    throw new TypeError(
      `Speed must be a finite number from 0 to ${MAX_PHYSICS_SPEED}.`,
    );
  }
}

export function assertDuration(duration) {
  if (!Number.isFinite(duration) || duration < 0 || duration > MAX_MOVE_DURATION) {
    throw new TypeError(
      `Move duration must be a finite number from 0 to ${MAX_MOVE_DURATION}.`,
    );
  }
}

function assertPhysicsState(physicsState) {
  if (
    physicsState === null
    || typeof physicsState !== 'object'
    || !Number.isFinite(physicsState.speed)
  ) {
    throw new TypeError('Physics state must contain a finite speed.');
  }
}
