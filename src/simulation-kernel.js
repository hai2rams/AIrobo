/**
 * @typedef {{ x: number, y: number, heading: number }} WorldState
 *
 * @typedef {{ type: 'MOVE_FORWARD', distance: number }
 *   | { type: 'TURN', angle: number }
 *   | { type: 'STOP' }} RobotAction
 *
 * @typedef {{ type: 'ROBOT_MOVED' }
 *   | { type: 'ROBOT_TURNED' }
 *   | { type: 'ROBOT_STOPPED' }} SimulationEvent
 *
 * @typedef {{ worldState: WorldState, events: SimulationEvent[] }} SimulationResult
 */

/**
 * Applies one robot action without mutating the supplied state or action.
 * Heading is measured in degrees, with 0 pointing along positive x and positive
 * turns rotating toward positive y.
 *
 * @param {WorldState} worldState
 * @param {RobotAction} action
 * @returns {SimulationResult}
 */
export function simulate(worldState, action) {
  assertWorldState(worldState);
  assertAction(action);

  switch (action.type) {
    case 'MOVE_FORWARD': {
      const radians = degreesToRadians(worldState.heading);

      return {
        worldState: {
          x: worldState.x + action.distance * Math.cos(radians),
          y: worldState.y + action.distance * Math.sin(radians),
          heading: worldState.heading,
        },
        events: [{ type: 'ROBOT_MOVED' }],
      };
    }

    case 'TURN':
      return {
        worldState: {
          x: worldState.x,
          y: worldState.y,
          heading: worldState.heading + action.angle,
        },
        events: [{ type: 'ROBOT_TURNED' }],
      };

    case 'STOP':
      return {
        worldState: { ...worldState },
        events: [{ type: 'ROBOT_STOPPED' }],
      };
  }
}

function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function assertWorldState(worldState) {
  if (
    worldState === null ||
    typeof worldState !== 'object' ||
    !Number.isFinite(worldState.x) ||
    !Number.isFinite(worldState.y) ||
    !Number.isFinite(worldState.heading)
  ) {
    throw new TypeError('WorldState must contain finite x, y, and heading numbers');
  }
}

function assertAction(action) {
  if (action === null || typeof action !== 'object') {
    throw new TypeError('RobotAction must be an object');
  }

  if (action.type === 'STOP') {
    return;
  }

  if (action.type === 'MOVE_FORWARD' && Number.isFinite(action.distance)) {
    return;
  }

  if (action.type === 'TURN' && Number.isFinite(action.angle)) {
    return;
  }

  throw new TypeError('RobotAction must be MOVE_FORWARD, TURN, or STOP');
}
