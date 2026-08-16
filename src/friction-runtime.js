import {
  calculateFriction,
  createFrictionState,
  createSurfaceComparison,
  setAppliedForce,
  setSurface,
} from './friction-motion.js';
import { assertDuration } from './physics-motion.js';

export function createFrictionRuntime(playground) {
  let frictionState = createFrictionState();
  let eventLog = [...playground.getState().events];

  function decoratedState() {
    const state = playground.getState();
    return {
      ...state,
      physics: {
        ...state.physics,
        surfaceId: frictionState.surfaceId,
        appliedForce: frictionState.appliedForce,
        frictionForce: frictionState.lastFrictionForce,
      },
      friction: cloneFrictionState(frictionState, state.force.mass),
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
      playground.setMass(mass);
      return decoratedState();
    },

    setSurface(surfaceId) {
      frictionState = setSurface(frictionState, surfaceId);
      return decoratedState();
    },

    setAppliedForce(appliedForce) {
      frictionState = setAppliedForce(frictionState, appliedForce);
      return decoratedState();
    },

    setNetForce(appliedForce) {
      frictionState = setAppliedForce(frictionState, appliedForce);
      return decoratedState();
    },

    applyForceForTime(duration) {
      assertDuration(duration);
      const before = playground.getState();
      const result = calculateFriction(frictionState, {
        mass: before.force.mass,
        speed: before.physics.speed,
      });
      const previousCount = before.events.length;

      playground.setNetForce(result.netForce);
      const motion = playground.applyForceForTime(duration);
      const motionEvents = playground.getState().events.slice(previousCount);
      eventLog.push(result.calculation, ...motionEvents);
      frictionState = result.frictionState;

      return {
        ...motion,
        frictionCalculation: result.calculation,
        state: decoratedState(),
      };
    },

    execute(control) {
      if (control === 'RESET') {
        playground.execute('RESET');
        frictionState = createFrictionState();
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

function cloneFrictionState(state, mass) {
  return {
    ...state,
    lastCalculation: state.lastCalculation ? { ...state.lastCalculation } : null,
    comparison: createSurfaceComparison({ mass, appliedForce: state.appliedForce }),
  };
}
