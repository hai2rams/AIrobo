import {
  calculateAccelerationMotion,
  createAccelerationState,
  setAcceleration,
} from './acceleration-motion.js';

export function createAccelerationRuntime(playground) {
  let accelerationState = createAccelerationState();
  let eventLog = [...playground.getState().events];

  function decoratedState() {
    const state = playground.getState();
    return {
      ...state,
      physics: {
        ...state.physics,
        acceleration: accelerationState.acceleration,
        lastDuration: accelerationState.lastDuration ?? state.physics.lastDuration,
        lastDistance: accelerationState.lastDistance ?? state.physics.lastDistance,
        lastInitialVelocity: accelerationState.lastInitialVelocity,
        lastFinalVelocity: accelerationState.lastFinalVelocity,
        lastAcceleration: accelerationState.lastAcceleration,
      },
      acceleration: cloneAccelerationState(accelerationState),
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

  function executeConstantAcceleration(acceleration, duration) {
    if (!Number.isFinite(acceleration)) {
      throw new TypeError('Derived acceleration must be a finite number.');
    }
    const before = playground.getState();
    const segmentState = { ...accelerationState, acceleration };
    const result = calculateAccelerationMotion(
      segmentState,
      before.physics.speed,
      duration,
      before.vector.headingDegrees,
    );
    const previousCount = before.events.length;

    const vectorResult = playground.moveWithVector({
      distance: result.action.distance,
      duration: result.calculation.effectiveTime,
      speed: result.calculation.finalVelocity,
    });
    const movementEvents = playground.getState().events.slice(previousCount);
    eventLog.push(result.calculation, ...movementEvents);

    playground.setPhysicsSpeed(result.calculation.finalVelocity);
    accelerationState = result.accelerationState;

    return {
      action: result.action,
      calculation: result.calculation,
      vectorCalculation: vectorResult.vectorCalculation,
      displacementMatchesKernel: vectorResult.displacementMatchesKernel,
      state: decoratedState(),
    };
  }

  return {
    getState() {
      return decoratedState();
    },

    beginAttempt() {
      playground.beginAttempt?.();
      return decoratedState();
    },

    completeAttempt() {
      playground.completeAttempt?.();
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
      accelerationState = setAcceleration(accelerationState, acceleration);
      return decoratedState();
    },

    accelerateForTime(duration) {
      return executeConstantAcceleration(accelerationState.acceleration, duration);
    },

    executeConstantAcceleration,

    execute(control) {
      if (control === 'RESET') {
        playground.execute('RESET');
        accelerationState = createAccelerationState();
        eventLog = [];
        return decoratedState();
      }
      return delegate(() => playground.execute(control));
    },

    executeActions(actions) {
      return delegate(() => playground.executeActions(actions));
    },
  };
}

function cloneAccelerationState(state) {
  return {
    ...state,
    lastCalculation: state.lastCalculation
      ? {
          ...state.lastCalculation,
          equations: { ...state.lastCalculation.equations },
        }
      : null,
    graphs: state.graphs
      ? {
          velocityTime: {
            ...state.graphs.velocityTime,
            points: state.graphs.velocityTime.points.map((point) => ({ ...point })),
          },
          positionTime: {
            ...state.graphs.positionTime,
            points: state.graphs.positionTime.points.map((point) => ({ ...point })),
          },
        }
      : null,
  };
}
