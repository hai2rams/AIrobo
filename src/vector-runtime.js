import {
  createRunSummary,
  createVectorState,
  deriveVectorCalculation,
  deriveVelocity,
  displacementAgreesWithKernel,
  normalizeHeading,
  updateRunSummary,
} from './vector-motion.js';

export function createVectorRuntime(playground) {
  const initialState = playground.getState();
  let vectorState = createVectorState(initialState.robot, initialState.physics.speed);
  let eventLog = [...initialState.events];
  let attemptActive = false;

  function decoratedState() {
    const state = playground.getState();
    return {
      ...state,
      vector: cloneVectorState(vectorState),
      events: [...eventLog],
    };
  }

  function collectNewEvents(previousCount) {
    const newEvents = playground.getState().events.slice(previousCount);
    eventLog.push(...newEvents);
    return newEvents;
  }

  function refreshDirection() {
    const state = playground.getState();
    vectorState = {
      ...vectorState,
      headingDegrees: normalizeHeading(state.robot.heading),
      velocity: deriveVelocity(state.physics.speed, state.robot.heading),
    };
  }

  function includeDistance(distance) {
    if (attemptActive) {
      vectorState = {
        ...vectorState,
        runSummary: updateRunSummary(
          vectorState.runSummary,
          playground.getState().robot,
          distance,
        ),
      };
    }
  }

  return {
    getState() {
      refreshDirection();
      return decoratedState();
    },

    beginAttempt() {
      playground.beginAttempt?.();
      const state = playground.getState();
      vectorState = {
        ...vectorState,
        runSummary: createRunSummary(state.robot),
      };
      attemptActive = true;
      return decoratedState();
    },

    completeAttempt() {
      playground.completeAttempt?.();
      if (attemptActive) {
        vectorState = {
          ...vectorState,
          runSummary: updateRunSummary(
            vectorState.runSummary,
            playground.getState().robot,
          ),
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
      refreshDirection();
      return decoratedState();
    },

    setHeading(requestedHeading) {
      const requestedNormalized = normalizeHeading(requestedHeading);
      const currentHeading = playground.getState().robot.heading;
      const turnDelta = requestedNormalized - normalizeHeading(currentHeading);
      const action = { type: 'TURN', angle: turnDelta };
      const previousCount = playground.getState().events.length;
      playground.executeActions([action]);
      collectNewEvents(previousCount);
      refreshDirection();

      return {
        action,
        requestedHeading,
        headingDegrees: vectorState.headingDegrees,
        state: decoratedState(),
      };
    },

    moveForTime(duration) {
      const before = playground.getState();
      const previousCount = before.events.length;
      const result = playground.moveForTime(duration);
      const after = playground.getState();
      const newEvents = after.events.slice(previousCount);
      const predicted = deriveVectorCalculation({
        speed: result.calculation.speed,
        headingDegrees: before.robot.heading,
        duration: result.calculation.time,
        distance: result.calculation.distance,
      });

      const physicsEventIndex = newEvents.findIndex(
        ({ type }) => type === 'PHYSICS_CALCULATION',
      );
      if (physicsEventIndex >= 0) {
        eventLog.push(...newEvents.slice(0, physicsEventIndex + 1));
        eventLog.push(predicted);
        eventLog.push(...newEvents.slice(physicsEventIndex + 1));
      } else {
        eventLog.push(predicted, ...newEvents);
      }

      vectorState = {
        ...vectorState,
        headingDegrees: predicted.headingDegrees,
        velocity: { ...predicted.velocity },
        lastMovement: {
          duration,
          distance: predicted.distance,
          dx: predicted.displacement.x,
          dy: predicted.displacement.y,
        },
        lastCalculation: predicted,
      };
      includeDistance(result.action.distance);

      return {
        ...result,
        vectorCalculation: predicted,
        displacementMatchesKernel: displacementAgreesWithKernel(
          predicted,
          before.robot,
          after.robot,
        ),
        state: decoratedState(),
      };
    },

    moveWithVector({ distance, duration, speed }) {
      const before = playground.getState();
      const previousCount = before.events.length;
      const action = { type: 'MOVE_FORWARD', distance };
      const predicted = deriveVectorCalculation({
        speed,
        headingDegrees: before.robot.heading,
        duration,
        distance,
      });
      playground.executeActions([action]);
      const after = playground.getState();
      const newEvents = after.events.slice(previousCount);
      eventLog.push(predicted, ...newEvents);
      vectorState = {
        ...vectorState,
        headingDegrees: predicted.headingDegrees,
        velocity: { ...predicted.velocity },
        lastMovement: {
          duration,
          distance,
          dx: predicted.displacement.x,
          dy: predicted.displacement.y,
        },
        lastCalculation: predicted,
      };
      includeDistance(distance);

      return {
        action,
        vectorCalculation: predicted,
        displacementMatchesKernel: displacementAgreesWithKernel(
          predicted,
          before.robot,
          after.robot,
        ),
        state: decoratedState(),
      };
    },

    execute(control) {
      if (control === 'RESET') {
        playground.execute('RESET');
        const state = playground.getState();
        vectorState = createVectorState(state.robot, state.physics.speed);
        eventLog = [];
        attemptActive = false;
        return decoratedState();
      }

      const before = playground.getState();
      playground.execute(control);
      collectNewEvents(before.events.length);
      refreshDirection();
      if (control === 'MOVE_FORWARD') {
        includeDistance(25);
      }
      return decoratedState();
    },

    executeActions(actions) {
      for (const action of actions) {
        const previousCount = playground.getState().events.length;
        playground.executeActions([action]);
        collectNewEvents(previousCount);
        refreshDirection();
        if (action.type === 'MOVE_FORWARD') {
          includeDistance(action.distance);
        }
      }
      return decoratedState();
    },
  };
}

function cloneVectorState(vectorState) {
  return {
    ...vectorState,
    velocity: { ...vectorState.velocity },
    lastMovement: vectorState.lastMovement
      ? { ...vectorState.lastMovement }
      : null,
    lastCalculation: vectorState.lastCalculation
      ? {
          ...vectorState.lastCalculation,
          velocity: { ...vectorState.lastCalculation.velocity },
          displacement: { ...vectorState.lastCalculation.displacement },
          equations: { ...vectorState.lastCalculation.equations },
        }
      : null,
    runSummary: { ...vectorState.runSummary },
  };
}
