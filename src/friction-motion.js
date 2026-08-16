import {
  assertMass,
  assertNetForce,
} from './force-mass.js';

export const LEARNING_GRAVITY = 10;
export const DEFAULT_APPLIED_FORCE = 0;

export const SURFACES = Object.freeze({
  IDEAL: freezeSurface({
    id: 'ideal',
    label: 'Ideal / Frictionless',
    muStatic: 0,
    muKinetic: 0,
  }),
  SMOOTH: freezeSurface({
    id: 'smooth',
    label: 'Smooth',
    muStatic: 0.10,
    muKinetic: 0.05,
  }),
  NORMAL: freezeSurface({
    id: 'normal',
    label: 'Normal',
    muStatic: 0.30,
    muKinetic: 0.20,
  }),
  ROUGH: freezeSurface({
    id: 'rough',
    label: 'Rough',
    muStatic: 0.60,
    muKinetic: 0.45,
  }),
});

export const DEFAULT_SURFACE = SURFACES.NORMAL;

const SURFACE_BY_ID = new Map(
  Object.values(SURFACES).map((surface) => [surface.id, surface]),
);

export function createFrictionState(surfaceId = DEFAULT_SURFACE.id) {
  const surface = getSurface(surfaceId);
  return {
    surfaceId: surface.id,
    muStatic: surface.muStatic,
    muKinetic: surface.muKinetic,
    appliedForce: DEFAULT_APPLIED_FORCE,
    lastNormalForce: null,
    lastFrictionForce: null,
    lastAppliedForce: null,
    lastNetForce: null,
    lastFrictionMode: null,
    lastCalculation: null,
  };
}

export function getSurface(surfaceId) {
  const surface = SURFACE_BY_ID.get(surfaceId);
  if (!surface) {
    throw new TypeError(`Unknown surface: ${surfaceId}.`);
  }
  assertSurfaceDefinition(surface);
  return surface;
}

export function setSurface(frictionState, surfaceId) {
  assertFrictionState(frictionState);
  const surface = getSurface(surfaceId);
  return {
    ...frictionState,
    surfaceId: surface.id,
    muStatic: surface.muStatic,
    muKinetic: surface.muKinetic,
  };
}

export function setAppliedForce(frictionState, appliedForce) {
  assertFrictionState(frictionState);
  assertNetForce(appliedForce);
  return { ...frictionState, appliedForce };
}

export function calculateFriction(frictionState, { mass, speed }) {
  assertFrictionState(frictionState);
  assertMass(mass);
  if (!Number.isFinite(speed) || speed < 0) {
    throw new TypeError('Speed must be a finite non-negative number.');
  }

  const surface = getSurface(frictionState.surfaceId);
  const appliedForce = frictionState.appliedForce;
  const normalForce = mass * LEARNING_GRAVITY;
  const staticLimit = surface.muStatic * normalForce;
  const kineticMagnitude = surface.muKinetic * normalForce;
  let frictionMode;
  let frictionForce;
  let motionStarted;

  if (surface.id === SURFACES.IDEAL.id) {
    frictionMode = 'IDEAL';
    frictionForce = 0;
    motionStarted = speed > 0 || appliedForce !== 0;
  } else if (speed === 0 && appliedForce === 0) {
    frictionMode = 'NONE';
    frictionForce = 0;
    motionStarted = false;
  } else if (speed === 0 && Math.abs(appliedForce) <= staticLimit) {
    frictionMode = 'STATIC';
    frictionForce = -appliedForce;
    motionStarted = false;
  } else if (speed === 0) {
    frictionMode = 'KINETIC';
    frictionForce = -Math.sign(appliedForce) * kineticMagnitude;
    motionStarted = true;
  } else {
    frictionMode = 'KINETIC';
    frictionForce = -kineticMagnitude;
    motionStarted = true;
  }

  const netForce = appliedForce + frictionForce;
  assertNetForce(netForce);
  const calculation = {
    type: 'FRICTION_CALCULATION',
    concept: 'FRICTION',
    surface: surface.id,
    mass,
    gravity: LEARNING_GRAVITY,
    normalForce,
    muStatic: surface.muStatic,
    muKinetic: surface.muKinetic,
    appliedForce,
    staticLimit,
    kineticMagnitude,
    frictionMode,
    frictionForce,
    netForce,
    motionStarted,
  };

  return {
    calculation,
    netForce,
    frictionState: {
      ...frictionState,
      lastNormalForce: normalForce,
      lastFrictionForce: frictionForce,
      lastAppliedForce: appliedForce,
      lastNetForce: netForce,
      lastFrictionMode: frictionMode,
      lastCalculation: calculation,
    },
  };
}

export function createSurfaceComparison({ mass, appliedForce }) {
  assertMass(mass);
  assertNetForce(appliedForce);
  return Object.fromEntries(
    [SURFACES.SMOOTH, SURFACES.ROUGH].map((surface) => {
      const result = calculateFriction(
        setAppliedForce(createFrictionState(surface.id), appliedForce),
        { mass, speed: 0 },
      );
      return [surface.id, {
        frictionForce: result.calculation.frictionForce,
        netForce: result.netForce,
        acceleration: result.netForce / mass,
      }];
    }),
  );
}

export function frictionArrowRenderModel(state) {
  const calculation = state.friction.lastCalculation;
  const signedForce = calculation?.frictionForce ?? 0;
  return arrowRenderModel(state, signedForce, -8, 0.12);
}

export function appliedForceArrowRenderModel(state) {
  return arrowRenderModel(state, state.friction.appliedForce, 0, 0.12);
}

export function assertSurfaceDefinition(surface) {
  if (
    surface === null
    || typeof surface !== 'object'
    || typeof surface.id !== 'string'
    || surface.id.length === 0
    || typeof surface.label !== 'string'
    || !Number.isFinite(surface.muStatic)
    || !Number.isFinite(surface.muKinetic)
    || surface.muStatic < 0
    || surface.muKinetic < 0
    || surface.muKinetic > surface.muStatic
  ) {
    throw new TypeError('Surface coefficients must be finite, non-negative, and kinetic friction cannot exceed static friction.');
  }
}

function assertFrictionState(state) {
  if (state === null || typeof state !== 'object') {
    throw new TypeError('Friction state must be an object.');
  }
  const surface = getSurface(state.surfaceId);
  if (state.muStatic !== surface.muStatic || state.muKinetic !== surface.muKinetic) {
    throw new TypeError('Friction state coefficients must match the selected surface.');
  }
  assertNetForce(state.appliedForce);
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

function freezeSurface(surface) {
  assertSurfaceDefinition(surface);
  return Object.freeze(surface);
}
