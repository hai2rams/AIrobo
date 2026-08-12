import {
  calculateForce,
  createForceState,
  setMass,
  setNetForce,
} from './force-mass.js';

export function createForceRuntime(playground) {
  let forceState = createForceState();
  let eventLog = [...playground.getState().events];

  function decoratedState() {
    const state = playground.getState();
    return {
      ...state,
      physics: {
        ...state.physics,
        mass: forceState.mass,
        netForce: forceState.netForce,
      },
      force: cloneForceState(forceState),
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
      forceState = setMass(forceState, mass);
      return decoratedState();
    },

    setNetForce(netForce) {
      forceState = setNetForce(forceState, netForce);
      return decoratedState();
    },

    applyForceForTime(duration) {
      const result = calculateForce(forceState, duration);
      const previousCount = playground.getState().events.length;
      const motion = playground.executeConstantAcceleration(
        result.acceleration,
        duration,
      );
      const motionEvents = playground.getState().events.slice(previousCount);
      eventLog.push(result.calculation, ...motionEvents);
      forceState = result.forceState;

      return {
        calculation: result.calculation,
        accelerationCalculation: motion.calculation,
        vectorCalculation: motion.vectorCalculation,
        action: motion.action,
        displacementMatchesKernel: motion.displacementMatchesKernel,
        state: decoratedState(),
      };
    },

    execute(control) {
      if (control === 'RESET') {
        playground.execute('RESET');
        forceState = createForceState();
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

function cloneForceState(state) {
  return {
    ...state,
    lastCalculation: state.lastCalculation ? { ...state.lastCalculation } : null,
    comparisons: { ...state.comparisons },
  };
}
