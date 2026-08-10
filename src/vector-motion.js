export const VECTOR_CONCEPT = 'VELOCITY_DIRECTION';
export const VECTOR_EPSILON = 1e-9;
export const VECTOR_EQUATIONS = Object.freeze({
  vx: 'vx = v cos(theta)',
  vy: 'vy = v sin(theta)',
  dx: 'dx = d cos(theta)',
  dy: 'dy = d sin(theta)',
});

export function normalizeHeading(headingDegrees) {
  assertFiniteNumber(headingDegrees, 'Heading');
  return ((headingDegrees % 360) + 360) % 360;
}

export function deriveVectorCalculation({
  speed,
  headingDegrees,
  duration,
  distance,
}) {
  assertFiniteNumber(speed, 'Speed');
  assertFiniteNumber(duration, 'Duration');
  assertFiniteNumber(distance, 'Distance');
  const heading = normalizeHeading(headingDegrees);
  const radians = heading * (Math.PI / 180);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return {
    type: 'VECTOR_CALCULATION',
    concept: VECTOR_CONCEPT,
    speed,
    headingDegrees: heading,
    duration,
    distance,
    velocity: {
      magnitude: speed,
      x: removeFloatingPointNoise(speed * cosine),
      y: removeFloatingPointNoise(speed * sine),
    },
    displacement: {
      magnitude: Math.abs(distance),
      x: removeFloatingPointNoise(distance * cosine),
      y: removeFloatingPointNoise(distance * sine),
    },
    equations: { ...VECTOR_EQUATIONS },
  };
}

export function createVectorState(worldState, speed = 0) {
  const headingDegrees = normalizeHeading(worldState.heading);
  const velocity = deriveVelocity(speed, headingDegrees);

  return {
    headingDegrees,
    velocity,
    lastMovement: null,
    lastCalculation: null,
    runSummary: createRunSummary(worldState),
  };
}

export function createRunSummary(worldState) {
  return {
    runStartX: worldState.x,
    runStartY: worldState.y,
    totalDistanceTraveled: 0,
    netDx: 0,
    netDy: 0,
    netDisplacement: 0,
  };
}

export function updateRunSummary(summary, worldState, distance = 0) {
  const netDx = worldState.x - summary.runStartX;
  const netDy = worldState.y - summary.runStartY;

  return {
    ...summary,
    totalDistanceTraveled: summary.totalDistanceTraveled + Math.abs(distance),
    netDx: removeFloatingPointNoise(netDx),
    netDy: removeFloatingPointNoise(netDy),
    netDisplacement: removeFloatingPointNoise(Math.hypot(netDx, netDy)),
  };
}

export function deriveVelocity(speed, headingDegrees) {
  const calculation = deriveVectorCalculation({
    speed,
    headingDegrees,
    duration: 0,
    distance: 0,
  });
  return calculation.velocity;
}

export function displacementAgreesWithKernel(
  calculation,
  beforeWorldState,
  afterWorldState,
  epsilon = VECTOR_EPSILON,
) {
  const actualDx = afterWorldState.x - beforeWorldState.x;
  const actualDy = afterWorldState.y - beforeWorldState.y;
  return Math.abs(calculation.displacement.x - actualDx) <= epsilon
    && Math.abs(calculation.displacement.y - actualDy) <= epsilon;
}

export function velocityArrowRenderModel(state) {
  const speed = state.vector.velocity.magnitude;
  const length = speed === 0 ? 0 : Math.min(90, 22 + speed * 1.5);

  return {
    left: `${state.robot.x}px`,
    top: `${state.world.height - state.robot.y}px`,
    width: `${length}px`,
    transform: `translateY(-50%) rotate(${-state.vector.headingDegrees}deg)`,
    opacity: speed === 0 ? '0' : '1',
  };
}

function removeFloatingPointNoise(value) {
  return Math.abs(value) <= VECTOR_EPSILON ? 0 : value;
}

function assertFiniteNumber(value, label) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
}
