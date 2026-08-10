import { simulate } from './simulation-kernel.js';

export const WORLD = Object.freeze({ width: 600, height: 400 });
export const TARGET = Object.freeze({ x: 500, y: 200 });

const CONTROL_ACTIONS = Object.freeze({
  MOVE_FORWARD: Object.freeze({ type: 'MOVE_FORWARD', distance: 25 }),
  TURN_LEFT: Object.freeze({ type: 'TURN', angle: 15 }),
  TURN_RIGHT: Object.freeze({ type: 'TURN', angle: -15 }),
});

export function createInitialState() {
  return {
    world: { ...WORLD },
    robot: { x: 100, y: 200, heading: 0, speed: 0 },
    target: { ...TARGET },
    step: 0,
    time: 0,
    events: [],
  };
}

export function actionForControl(control) {
  const action = CONTROL_ACTIONS[control];

  if (!action) {
    throw new TypeError(`Unknown robot control: ${control}`);
  }

  return { ...action };
}

export function createPlayground(simulationKernel = simulate) {
  let state = createInitialState();

  function executeAction(action) {
    const result = simulationKernel(
      {
        x: state.robot.x,
        y: state.robot.y,
        heading: state.robot.heading,
      },
      action,
    );

    state = {
      ...state,
      robot: { ...result.worldState, speed: 0 },
      step: state.step + 1,
      time: state.time + 1,
      events: [...state.events, ...result.events],
    };
  }

  return {
    getState() {
      return state;
    },

    execute(control) {
      if (control === 'RESET') {
        state = createInitialState();
        return state;
      }

      const action = actionForControl(control);
      executeAction(action);

      return state;
    },

    executeActions(actions) {
      for (const action of actions) {
        executeAction(action);
      }

      return state;
    },
  };
}

export function robotRenderModel(state) {
  return {
    left: `${state.robot.x}px`,
    top: `${state.world.height - state.robot.y}px`,
    transform: `translate(-50%, -50%) rotate(${-state.robot.heading}deg)`,
  };
}

export function targetRenderModel(state) {
  return {
    left: `${state.target.x}px`,
    top: `${state.world.height - state.target.y}px`,
  };
}
