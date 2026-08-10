import {
  calculatePhysicsMotion,
  createPhysicsState,
  setPhysicsSpeed,
} from './physics-motion.js';

export function createPhysicsRuntime(playground) {
  let physicsState = createPhysicsState();
  let eventLog = [...playground.getState().events];

  function decoratedState() {
    return {
      ...playground.getState(),
      physics: {
        ...physicsState,
        lastCalculation: physicsState.lastCalculation
          ? { ...physicsState.lastCalculation }
          : null,
      },
      events: [...eventLog],
    };
  }

  function delegate(operation) {
    const previousEventCount = playground.getState().events.length;
    operation();
    const newEvents = playground.getState().events.slice(previousEventCount);
    eventLog.push(...newEvents);
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
      const previousEventCount = playground.getState().events.length;
      const result = playground.readSensor(sensorType);
      const newEvents = result.state.events.slice(previousEventCount);
      eventLog.push(...newEvents);
      return {
        reading: result.reading,
        state: decoratedState(),
      };
    },

    setPhysicsSpeed(speed) {
      physicsState = setPhysicsSpeed(physicsState, speed);
      return decoratedState();
    },

    moveForTime(duration) {
      const result = calculatePhysicsMotion(physicsState, duration);
      physicsState = result.physicsState;
      eventLog.push(result.calculation);

      const previousEventCount = playground.getState().events.length;
      playground.executeActions([result.action]);
      const newEvents = playground.getState().events.slice(previousEventCount);
      eventLog.push(...newEvents);

      return {
        action: result.action,
        calculation: result.calculation,
        state: decoratedState(),
      };
    },

    execute(control) {
      if (control === 'RESET') {
        playground.execute('RESET');
        physicsState = createPhysicsState();
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
