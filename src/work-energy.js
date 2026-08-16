export const ENERGY_EPSILON = 1e-8;
export const WORK_ENERGY_CONCEPT = 'WORK_ENERGY';

export function kineticEnergy(mass, speed) {
  assertPositiveMass(mass);
  assertNonNegativeFinite(speed, 'Speed');
  return 0.5 * mass * speed ** 2;
}

export function calculateWorkEnergy({
  mass,
  initialSpeed,
  finalSpeed,
  displacement,
  appliedForce,
  frictionForce,
}) {
  assertPositiveMass(mass);
  assertNonNegativeFinite(initialSpeed, 'Initial speed');
  assertNonNegativeFinite(finalSpeed, 'Final speed');
  assertFinite(displacement, 'Displacement');
  assertFinite(appliedForce, 'Applied force');
  assertFinite(frictionForce, 'Friction force');

  const initialKineticEnergy = kineticEnergy(mass, initialSpeed);
  const finalKineticEnergy = kineticEnergy(mass, finalSpeed);
  const deltaKineticEnergy = finalKineticEnergy - initialKineticEnergy;
  const appliedWork = displacement === 0 ? 0 : appliedForce * displacement;
  const frictionWork = displacement === 0 ? 0 : frictionForce * displacement;
  const netWork = appliedWork + frictionWork;
  const workEnergyResidual = netWork - deltaKineticEnergy;

  return {
    type: 'WORK_ENERGY_CALCULATION',
    concept: WORK_ENERGY_CONCEPT,
    mass,
    initialSpeed,
    finalSpeed,
    displacement,
    appliedForce,
    frictionForce,
    appliedWork,
    frictionWork,
    netWork,
    initialKineticEnergy,
    finalKineticEnergy,
    deltaKineticEnergy,
    workEnergyResidual,
    withinTolerance: Math.abs(workEnergyResidual) <= ENERGY_EPSILON,
  };
}

export function createEnergyState(mass = 1, speed = 0) {
  return {
    currentKineticEnergy: kineticEnergy(mass, speed),
    lastCalculation: null,
    runSummary: createRunEnergySummary(mass, speed),
  };
}

export function createRunEnergySummary(mass, speed) {
  const initial = kineticEnergy(mass, speed);
  return {
    runInitialKE: initial,
    runFinalKE: initial,
    runDeltaKE: 0,
    totalAppliedWork: 0,
    totalFrictionWork: 0,
    totalNetWork: 0,
    workEnergyResidual: 0,
    withinTolerance: true,
    segmentCount: 0,
  };
}

export function updateEnergyState(energyState, calculation) {
  assertEnergyState(energyState);
  assertCalculation(calculation);
  const summary = energyState.runSummary;
  const totalAppliedWork = summary.totalAppliedWork + calculation.appliedWork;
  const totalFrictionWork = summary.totalFrictionWork + calculation.frictionWork;
  const totalNetWork = totalAppliedWork + totalFrictionWork;
  const runFinalKE = calculation.finalKineticEnergy;
  const runDeltaKE = runFinalKE - summary.runInitialKE;
  const workEnergyResidual = totalNetWork - runDeltaKE;

  return {
    currentKineticEnergy: calculation.finalKineticEnergy,
    lastCalculation: { ...calculation },
    runSummary: {
      ...summary,
      runFinalKE,
      runDeltaKE,
      totalAppliedWork,
      totalFrictionWork,
      totalNetWork,
      workEnergyResidual,
      withinTolerance: Math.abs(workEnergyResidual) <= ENERGY_EPSILON,
      segmentCount: summary.segmentCount + 1,
    },
  };
}

export function refreshPreSegmentEnergy(energyState, mass, speed) {
  assertEnergyState(energyState);
  if (energyState.runSummary.segmentCount > 0) {
    return {
      ...energyState,
      currentKineticEnergy: kineticEnergy(mass, speed),
    };
  }
  return createEnergyState(mass, speed);
}

export function energyVisualizationModel(energyState) {
  assertEnergyState(energyState);
  const calculation = energyState.lastCalculation;
  const values = calculation
    ? {
        initialKineticEnergy: calculation.initialKineticEnergy,
        finalKineticEnergy: calculation.finalKineticEnergy,
        appliedWork: calculation.appliedWork,
        frictionWork: calculation.frictionWork,
      }
    : {
        initialKineticEnergy: energyState.currentKineticEnergy,
        finalKineticEnergy: energyState.currentKineticEnergy,
        appliedWork: 0,
        frictionWork: 0,
      };
  const scale = Math.max(1, ...Object.values(values).map(Math.abs));

  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, {
      value,
      width: `${(Math.abs(value) / scale) * 100}%`,
      sign: value < 0 ? 'negative' : 'positive',
    }]),
  );
}

export function workEnergyExplanation(calculation) {
  if (!calculation || calculation.displacement === 0) {
    return 'No displacement occurred, so no mechanical work was done.';
  }
  if (calculation.netWork < 0) {
    return 'Friction and opposing force did negative work and reduced the robot\'s kinetic energy.';
  }
  if (calculation.frictionWork < 0) {
    return 'The applied force added kinetic energy while friction did negative work.';
  }
  return 'The applied force added kinetic energy to the robot.';
}

function assertEnergyState(state) {
  if (
    state === null
    || typeof state !== 'object'
    || !Number.isFinite(state.currentKineticEnergy)
    || state.currentKineticEnergy < 0
    || state.runSummary === null
    || typeof state.runSummary !== 'object'
  ) {
    throw new TypeError('Energy state must contain finite non-negative kinetic energy.');
  }
}

function assertCalculation(calculation) {
  if (
    calculation?.type !== 'WORK_ENERGY_CALCULATION'
    || !Number.isFinite(calculation.workEnergyResidual)
  ) {
    throw new TypeError('Work-energy calculation must be finite and structured.');
  }
}

function assertPositiveMass(mass) {
  if (!Number.isFinite(mass) || mass <= 0) {
    throw new TypeError('Mass must be a finite positive number.');
  }
}

function assertNonNegativeFinite(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a finite non-negative number.`);
  }
}

function assertFinite(value, label) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }
}
