import {
  readFrontDistance,
  SENSOR_TYPES,
  sensorReadingEvent,
} from './front-distance-sensor.js';
import { OBSTACLES } from './world-obstacles.js';

export function createSensorRuntime(
  playground,
  { obstacles = OBSTACLES, readSensor = readFrontDistance } = {},
) {
  let eventLog = [...playground.getState().events];

  function currentFrontReading() {
    return readSensor(playground.getState().robot, obstacles);
  }

  function decoratedState() {
    return {
      ...playground.getState(),
      obstacles: obstacles.map((obstacle) => ({ ...obstacle })),
      sensors: {
        frontDistance: { ...currentFrontReading() },
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
      if (sensorType !== SENSOR_TYPES.FRONT_DISTANCE) {
        throw new TypeError(`Unsupported sensor: ${sensorType}`);
      }

      const reading = currentFrontReading();
      eventLog.push(sensorReadingEvent(reading));
      return { reading, state: decoratedState() };
    },

    execute(control) {
      if (control === 'RESET') {
        playground.execute('RESET');
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
