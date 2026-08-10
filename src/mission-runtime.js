import {
  completeMissionAttempt,
  createMissionState,
  evaluateMission,
  startMissionAttempt,
} from './mission-evaluator.js';

export function createMissionRuntime(definition, playground) {
  let eventLog = [...playground.getState().events];
  let missionState = createMissionState(definition, playground.getState().robot);
  let attemptActive = false;

  function decoratedState() {
    return {
      ...playground.getState(),
      target: { ...definition.target },
      events: [...eventLog],
      mission: { ...missionState },
    };
  }

  function executeAction(action) {
    const previousEventCount = playground.getState().events.length;
    const simulationState = playground.executeActions([action]);
    const simulationEvents = simulationState.events.slice(previousEventCount);
    const evaluation = evaluateMission(
      definition,
      missionState,
      simulationState.robot,
      simulationEvents,
    );

    missionState = evaluation.missionState;
    eventLog.push(...simulationEvents, ...evaluation.events);
  }

  function beginAttempt() {
    if (!attemptActive) {
      missionState = startMissionAttempt(
        definition,
        missionState,
        playground.getState().robot,
      );
      attemptActive = true;
    }

    return decoratedState();
  }

  function completeAttempt() {
    if (attemptActive) {
      missionState = completeMissionAttempt(missionState);
      attemptActive = false;
    }

    return decoratedState();
  }

  return {
    getState() {
      return decoratedState();
    },

    beginAttempt,

    completeAttempt,

    execute(control) {
      if (control === 'RESET') {
        const attemptCount = missionState.attemptCount;
        playground.execute('RESET');
        eventLog = [];
        missionState = createMissionState(
          definition,
          playground.getState().robot,
          attemptCount,
        );
        attemptActive = false;
        return decoratedState();
      }

      const ownsAttempt = !attemptActive;
      if (ownsAttempt) {
        beginAttempt();
      }

      executeActionForControl(control);

      if (ownsAttempt) {
        completeAttempt();
      }

      return decoratedState();
    },

    executeActions(actions) {
      const ownsAttempt = !attemptActive;
      if (ownsAttempt) {
        beginAttempt();
      }

      for (const action of actions) {
        executeAction(action);
      }

      if (ownsAttempt) {
        completeAttempt();
      }

      return decoratedState();
    },
  };

  function executeActionForControl(control) {
    const before = playground.getState().events.length;
    const simulationState = playground.execute(control);
    const simulationEvents = simulationState.events.slice(before);
    const evaluation = evaluateMission(
      definition,
      missionState,
      simulationState.robot,
      simulationEvents,
    );

    missionState = evaluation.missionState;
    eventLog.push(...simulationEvents, ...evaluation.events);
  }
}
