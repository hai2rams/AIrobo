import {
  calculateWorkEnergy,
  createEnergyState,
  createRunEnergySummary,
  kineticEnergy,
  refreshPreSegmentEnergy,
  updateEnergyState,
} from './work-energy.js';

export function createWorkEnergyRuntime(playground) {
  const initial = playground.getState();
  let energyState = createEnergyState(initial.force.mass, initial.physics.speed);
  let eventLog = [...initial.events];
  let attemptActive = false;

  function decoratedState() {
    const state = playground.getState();
    return {
      ...state,
      energy: cloneEnergyState({
        ...energyState,
        currentKineticEnergy: kineticEnergy(state.force.mass, state.physics.speed),
      }),
      events: [...eventLog],
    };
  }

  function collectNewEvents(previousCount) {
    const newEvents = playground.getState().events.slice(previousCount);
    eventLog.push(...newEvents);
    return newEvents;
  }

  function delegate(operation) {
    const previousCount = playground.getState().events.length;
    operation();
    collectNewEvents(previousCount);
    return decoratedState();
  }

  function refreshBeforeFirstSegment() {
    if (!attemptActive || energyState.runSummary.segmentCount > 0) return;
    const state = playground.getState();
    energyState = refreshPreSegmentEnergy(
      energyState,
      state.force.mass,
      state.physics.speed,
    );
  }

  return {
    getState() {
      return decoratedState();
    },

    beginAttempt() {
      playground.beginAttempt?.();
      const state = playground.getState();
      energyState = createEnergyState(state.force.mass, state.physics.speed);
      attemptActive = true;
      return decoratedState();
    },

    completeAttempt() {
      playground.completeAttempt?.();
      if (attemptActive && energyState.runSummary.segmentCount === 0) {
        const state = playground.getState();
        const current = kineticEnergy(state.force.mass, state.physics.speed);
        energyState = {
          ...energyState,
          currentKineticEnergy: current,
          runSummary: {
            ...energyState.runSummary,
            runFinalKE: current,
            runDeltaKE: current - energyState.runSummary.runInitialKE,
          },
        };
      }
      attemptActive = false;
      return decoratedState();
    },

    readSensor(sensorType) {
      const previousCount = playground.getState().events.length;
      const result = playground.readSensor(sensorType);
      collectNewEvents(previousCount);
      return { reading: result.reading, state: decoratedState() };
    },

    setPhysicsSpeed(speed) {
      playground.setPhysicsSpeed(speed);
      refreshBeforeFirstSegment();
      return decoratedState();
    },

    setHeading(heading) {
      const previousCount = playground.getState().events.length;
      const result = playground.setHeading(heading);
      collectNewEvents(previousCount);
      return { ...result, state: decoratedState() };
    },

    moveForTime(duration) {
      const previousCount = playground.getState().events.length;
      const result = playground.moveForTime(duration);
      collectNewEvents(previousCount);
      return { ...result, state: decoratedState() };
    },

    setAcceleration(acceleration) {
      playground.setAcceleration(acceleration);
      return decoratedState();
    },

    accelerateForTime(duration) {
      const previousCount = playground.getState().events.length;
      const result = playground.accelerateForTime(duration);
      collectNewEvents(previousCount);
      return { ...result, state: decoratedState() };
    },

    setMass(mass) {
      playground.setMass(mass);
      refreshBeforeFirstSegment();
      return decoratedState();
    },

    setSurface(surfaceId) {
      playground.setSurface(surfaceId);
      return decoratedState();
    },

    setAppliedForce(appliedForce) {
      playground.setAppliedForce(appliedForce);
      return decoratedState();
    },

    setNetForce(appliedForce) {
      playground.setNetForce(appliedForce);
      return decoratedState();
    },

    applyForceForTime(duration) {
      refreshBeforeFirstSegment();
      const before = playground.getState();
      const previousCount = before.events.length;
      const motion = playground.applyForceForTime(duration);
      const after = playground.getState();
      const acceleration = motion.accelerationCalculation;
      const displacement = motion.vectorCalculation.displacement.magnitude;
      const calculation = calculateWorkEnergy({
        mass: before.force.mass,
        initialSpeed: acceleration.initialVelocity,
        finalSpeed: acceleration.finalVelocity,
        displacement,
        appliedForce: motion.frictionCalculation.appliedForce,
        frictionForce: motion.frictionCalculation.frictionForce,
      });
      const motionEvents = after.events.slice(previousCount);
      const missionIndex = motionEvents.findIndex(({ type }) => type === 'TARGET_REACHED');
      if (missionIndex >= 0) {
        eventLog.push(...motionEvents.slice(0, missionIndex), calculation, ...motionEvents.slice(missionIndex));
      } else {
        eventLog.push(...motionEvents, calculation);
      }
      energyState = updateEnergyState(energyState, calculation);

      return {
        ...motion,
        workEnergyCalculation: calculation,
        state: decoratedState(),
      };
    },

    execute(control) {
      if (control === 'RESET') {
        playground.execute('RESET');
        const state = playground.getState();
        energyState = createEnergyState(state.force.mass, state.physics.speed);
        eventLog = [];
        attemptActive = false;
        return decoratedState();
      }
      return delegate(() => playground.execute(control));
    },

    executeActions(actions) {
      return delegate(() => playground.executeActions(actions));
    },
  };
}

function cloneEnergyState(state) {
  return {
    ...state,
    lastCalculation: state.lastCalculation ? { ...state.lastCalculation } : null,
    runSummary: { ...state.runSummary },
  };
}
