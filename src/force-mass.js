import { assertDuration } from './physics-motion.js';

export const DEFAULT_MASS = 1;
export const MIN_MASS = 0.1;
export const MAX_MASS = 100;
export const DEFAULT_NET_FORCE = 0;
export const MAX_FORCE_MAGNITUDE = 500;
export const FORCE_CONCEPT = 'NEWTON_SECOND_LAW';
export const FORCE_EQUATION = 'a = F_net / m';

export function createForceState() {
  const state = {
    mass: DEFAULT_MASS,
    netForce: DEFAULT_NET_FORCE,
    lastCalculation: null,
  };
  return { ...state, comparisons: createForceComparisons(state) };
}

export function setMass(forceState, mass) {
  assertForceState(forceState);
  assertMass(mass);
  const updated = { ...forceState, mass };
  return { ...updated, comparisons: createForceComparisons(updated) };
}

export function setNetForce(forceState, netForce) {
  assertForceState(forceState);
  assertNetForce(netForce);
  const updated = { ...forceState, netForce };
  return { ...updated, comparisons: createForceComparisons(updated) };
}

export function calculateForce(forceState, requestedTime) {
  assertForceState(forceState);
  assertDuration(requestedTime);
  const acceleration = forceState.netForce / forceState.mass;
  const calculation = {
    type: 'FORCE_CALCULATION',
    concept: FORCE_CONCEPT,
    mass: forceState.mass,
    netForce: forceState.netForce,
    acceleration,
    requestedTime,
    equation: FORCE_EQUATION,
  };
  const updated = {
    ...forceState,
    lastCalculation: calculation,
  };

  return {
    acceleration,
    calculation,
    forceState: {
      ...updated,
      comparisons: createForceComparisons(updated),
    },
  };
}

export function createForceComparisons(forceState) {
  const currentAcceleration = forceState.netForce / forceState.mass;
  const largerMass = Math.min(MAX_MASS, forceState.mass * 2);
  const largerForce = Math.sign(forceState.netForce || 1)
    * Math.min(MAX_FORCE_MAGNITUDE, Math.abs(forceState.netForce) * 2 || 10);
  return {
    currentAcceleration,
    largerMass,
    largerMassAcceleration: forceState.netForce / largerMass,
    largerForce,
    largerForceAcceleration: largerForce / forceState.mass,
  };
}

export function forceArrowRenderModel(state) {
  return arrowRenderModel(state, state.force.netForce, 0, 0.12);
}

export function accelerationArrowRenderModel(state) {
  const acceleration = state.force.netForce / state.force.mass;
  return arrowRenderModel(state, acceleration, 8, 1.2);
}

export function assertMass(mass) {
  if (!Number.isFinite(mass) || mass < MIN_MASS || mass > MAX_MASS) {
    throw new TypeError(`Mass must be a finite number from ${MIN_MASS} to ${MAX_MASS}.`);
  }
}

export function assertNetForce(netForce) {
  if (!Number.isFinite(netForce) || Math.abs(netForce) > MAX_FORCE_MAGNITUDE) {
    throw new TypeError(
      `Net force must be a finite number from -${MAX_FORCE_MAGNITUDE} to ${MAX_FORCE_MAGNITUDE}.`,
    );
  }
}

function arrowRenderModel(state, signedMagnitude, offset, scale) {
  const magnitude = Math.abs(signedMagnitude);
  const heading = state.vector.headingDegrees + (signedMagnitude < 0 ? 180 : 0);
  const length = magnitude === 0 ? 0 : Math.min(90, 18 + magnitude * scale);
  return {
    left: `${state.robot.x}px`,
    top: `${state.world.height - state.robot.y + offset}px`,
    width: `${length}px`,
    transform: `translateY(-50%) rotate(${-heading}deg)`,
    opacity: magnitude === 0 ? '0' : '1',
  };
}

function assertForceState(state) {
  if (state === null || typeof state !== 'object') {
    throw new TypeError('Force state must be an object.');
  }
  assertMass(state.mass);
  assertNetForce(state.netForce);
}
