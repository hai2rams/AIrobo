export const BLOCK_TYPES = Object.freeze({
  WHEN_START: 'when_start',
  MOVE_FORWARD: 'move_forward',
  TURN_LEFT: 'turn_left',
  TURN_RIGHT: 'turn_right',
});

export class ProgramCompileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProgramCompileError';
  }
}

export class ProgramAlreadyRunningError extends Error {
  constructor() {
    super('A program is already running.');
    this.name = 'ProgramAlreadyRunningError';
  }
}

export const DEFAULT_ACTION_DELAY_MS = 500;

export function actionFromBlock(block) {
  switch (block.type) {
    case BLOCK_TYPES.MOVE_FORWARD:
      return {
        type: 'MOVE_FORWARD',
        distance: readMagnitude(block, 'DISTANCE', 'Move Forward distance'),
      };

    case BLOCK_TYPES.TURN_LEFT:
      return {
        type: 'TURN',
        angle: readMagnitude(block, 'ANGLE', 'Turn Left angle'),
      };

    case BLOCK_TYPES.TURN_RIGHT:
      return {
        type: 'TURN',
        angle: -readMagnitude(block, 'ANGLE', 'Turn Right angle'),
      };

    default:
      throw new ProgramCompileError(`Unsupported block: ${block.type}`);
  }
}

export function compileWorkspace(workspace) {
  return compileWorkspaceSteps(workspace).map(({ action }) => action);
}

export function compileWorkspaceSteps(workspace) {
  const whenStart = workspace
    .getTopBlocks(true)
    .find((block) => block.type === BLOCK_TYPES.WHEN_START);

  if (!whenStart) {
    throw new ProgramCompileError('Add a When Start block before running the program.');
  }

  const steps = [];
  let block = whenStart.getNextBlock();

  while (block) {
    steps.push({ block, action: actionFromBlock(block) });
    block = block.getNextBlock();
  }

  return steps;
}

export function createBlocklyProgramController(workspace, playground) {
  let running = false;

  function assertNotRunning() {
    if (running) {
      throw new ProgramAlreadyRunningError();
    }
  }

  return {
    isRunning() {
      return running;
    },

    run() {
      assertNotRunning();
      const actions = compileWorkspace(workspace);
      playground.beginAttempt?.();

      try {
        playground.executeActions(actions);
      } finally {
        playground.completeAttempt?.();
      }

      return {
        actions,
        state: playground.getState(),
      };
    },

    async runSequentially({
      delayMs = DEFAULT_ACTION_DELAY_MS,
      wait = delay,
      onStep = () => {},
    } = {}) {
      assertNotRunning();
      const steps = compileWorkspaceSteps(workspace);
      running = true;
      playground.beginAttempt?.();
      let state = playground.getState();

      try {
        for (let index = 0; index < steps.length; index += 1) {
          const step = steps[index];
          workspace.highlightBlock?.(step.block.id);
          state = playground.executeActions([step.action]);
          onStep(state, {
            action: step.action,
            block: step.block,
            index,
            total: steps.length,
          });

          await wait(delayMs);
        }

      } finally {
        playground.completeAttempt?.();
        workspace.highlightBlock?.(null);
        running = false;
      }

      return {
        actions: steps.map(({ action }) => action),
        state: playground.getState(),
      };
    },

    resetRobot() {
      return playground.execute('RESET');
    },

    clearWorkspace() {
      workspace.clear();
      return playground.getState();
    },
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readMagnitude(block, fieldName, label) {
  const rawValue = block.getFieldValue(fieldName);
  const value = Number(rawValue);

  if (rawValue === null || rawValue === '' || !Number.isFinite(value) || value < 0) {
    throw new ProgramCompileError(`${label} must be a valid non-negative number.`);
  }

  return value;
}
