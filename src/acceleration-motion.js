import {
  assertDuration,
  assertSpeed,
} from './physics-motion.js';

export const DEFAULT_ACCELERATION = 0;
export const MAX_ACCELERATION_MAGNITUDE = 50;
export const ACCELERATION_CONCEPT = 'CONSTANT_ACCELERATION';
export const ACCELERATION_EQUATIONS = Object.freeze({
  velocity: 'vf = vi + at',
  displacement: 'd = vi t + 1/2 a t^2',
});

export function createAccelerationState() {
  return {
    acceleration: DEFAULT_ACCELERATION,
    lastDuration: null,
    lastDistance: null,
    lastInitialVelocity: null,
    lastFinalVelocity: null,
    lastAcceleration: null,
    lastCalculation: null,
    graphs: null,
  };
}

export function setAcceleration(accelerationState, acceleration) {
  assertAccelerationState(accelerationState);
  assertAcceleration(acceleration);
  return { ...accelerationState, acceleration };
}

export function calculateAccelerationMotion(
  accelerationState,
  initialVelocity,
  requestedTime,
  headingDegrees,
) {
  assertAccelerationState(accelerationState);
  assertSpeed(initialVelocity);
  assertDuration(requestedTime);
  if (!Number.isFinite(headingDegrees)) {
    throw new TypeError('Heading must be a finite number.');
  }

  const acceleration = accelerationState.acceleration;
  const unconstrainedFinalVelocity = initialVelocity + acceleration * requestedTime;
  const stoppedEarly = acceleration < 0 && unconstrainedFinalVelocity < 0;
  const stoppingTime = stoppedEarly ? initialVelocity / Math.abs(acceleration) : null;
  const effectiveTime = stoppedEarly ? stoppingTime : requestedTime;
  const finalVelocity = stoppedEarly ? 0 : unconstrainedFinalVelocity;
  assertSpeed(finalVelocity);

  const displacement = initialVelocity * effectiveTime
    + 0.5 * acceleration * effectiveTime ** 2;
  const calculation = {
    type: 'ACCELERATION_CALCULATION',
    concept: ACCELERATION_CONCEPT,
    initialVelocity,
    acceleration,
    requestedTime,
    effectiveTime,
    finalVelocity,
    displacement,
    headingDegrees,
    stoppedEarly,
    ...(stoppedEarly ? { stoppingTime } : {}),
    equations: { ...ACCELERATION_EQUATIONS },
  };
  const graphs = createAccelerationGraphs(calculation);

  return {
    action: { type: 'MOVE_FORWARD', distance: displacement },
    calculation,
    accelerationState: {
      ...accelerationState,
      lastDuration: requestedTime,
      lastDistance: displacement,
      lastInitialVelocity: initialVelocity,
      lastFinalVelocity: finalVelocity,
      lastAcceleration: acceleration,
      lastCalculation: calculation,
      graphs,
    },
  };
}

export function createAccelerationGraphs(calculation) {
  const velocityPoints = [
    { time: 0, value: calculation.initialVelocity },
    { time: calculation.effectiveTime, value: calculation.finalVelocity },
  ];
  if (calculation.stoppedEarly && calculation.requestedTime > calculation.effectiveTime) {
    velocityPoints.push({ time: calculation.requestedTime, value: 0 });
  }

  const positionPoints = [];
  const sampleCount = 8;
  const graphDuration = calculation.requestedTime;
  for (let index = 0; index <= sampleCount; index += 1) {
    const time = graphDuration === 0 ? 0 : graphDuration * (index / sampleCount);
    const movingTime = Math.min(time, calculation.effectiveTime);
    const value = calculation.initialVelocity * movingTime
      + 0.5 * calculation.acceleration * movingTime ** 2;
    positionPoints.push({ time, value });
  }

  return {
    velocityTime: {
      kind: 'VELOCITY_TIME',
      relationship: 'slope = acceleration',
      points: velocityPoints,
    },
    positionTime: {
      kind: 'POSITION_TIME',
      relationship: 'area under velocity-time = displacement',
      points: positionPoints,
    },
  };
}

export function assertAcceleration(acceleration) {
  if (
    !Number.isFinite(acceleration)
    || Math.abs(acceleration) > MAX_ACCELERATION_MAGNITUDE
  ) {
    throw new TypeError(
      `Acceleration must be a finite number from -${MAX_ACCELERATION_MAGNITUDE} to ${MAX_ACCELERATION_MAGNITUDE}.`,
    );
  }
}

function assertAccelerationState(state) {
  if (
    state === null
    || typeof state !== 'object'
    || !Number.isFinite(state.acceleration)
  ) {
    throw new TypeError('Acceleration state must contain a finite acceleration.');
  }
}
