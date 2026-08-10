import { SENSOR_TYPES } from './front-distance-sensor.js';

export const BLOCK_TYPES = Object.freeze({
  WHEN_START: 'when_start',
  MOVE_FORWARD: 'move_forward',
  TURN_LEFT: 'turn_left',
  TURN_RIGHT: 'turn_right',
  FRONT_DISTANCE: 'front_distance',
  IF_ELSE: 'if_else',
  LOGIC_COMPARE: 'logic_compare',
  NUMBER: 'math_number',
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
  const program = compileWorkspaceProgram(workspace);

  if (program.some((node) => node.kind !== 'ACTION')) {
    throw new ProgramCompileError('Conditional programs must execute through the program runner.');
  }

  return program.map(({ block, action }) => ({ block, action }));
}

export function compileWorkspaceProgram(workspace) {
  const whenStart = workspace
    .getTopBlocks(true)
    .find((block) => block.type === BLOCK_TYPES.WHEN_START);

  if (!whenStart) {
    throw new ProgramCompileError('Add a When Start block before running the program.');
  }

  return compileSequence(whenStart.getNextBlock());
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
      const program = compileWorkspaceProgram(workspace);
      const actions = [];
      playground.beginAttempt?.();

      try {
        executeProgram(program, playground, actions);
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
      onSensor = () => {},
    } = {}) {
      assertNotRunning();
      const program = compileWorkspaceProgram(workspace);
      running = true;
      playground.beginAttempt?.();
      let state = playground.getState();
      const actions = [];
      const fixedTotal = containsCondition(program) ? null : countActions(program);

      try {
        state = await executeProgramSequentially(program, {
          playground,
          workspace,
          actions,
          delayMs,
          wait,
          onStep,
          onSensor,
          fixedTotal,
        });
      } finally {
        playground.completeAttempt?.();
        workspace.highlightBlock?.(null);
        running = false;
      }

      return {
        actions,
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

function compileSequence(firstBlock) {
  const nodes = [];
  let block = firstBlock;

  while (block) {
    if (block.type === BLOCK_TYPES.IF_ELSE) {
      nodes.push({
        kind: 'IF_ELSE',
        block,
        condition: compileCondition(block.getInputTargetBlock?.('CONDITION')),
        thenBranch: compileSequence(block.getInputTargetBlock?.('DO')),
        elseBranch: compileSequence(block.getInputTargetBlock?.('ELSE')),
      });
    } else {
      nodes.push({ kind: 'ACTION', block, action: actionFromBlock(block) });
    }

    block = block.getNextBlock();
  }

  return nodes;
}

function compileCondition(block) {
  if (!block || block.type !== BLOCK_TYPES.LOGIC_COMPARE) {
    throw new ProgramCompileError('IF requires a numeric comparison condition.');
  }

  const operator = block.getFieldValue('OP');
  if (!['LT', 'LTE', 'GT', 'GTE', 'EQ', 'NEQ'].includes(operator)) {
    throw new ProgramCompileError(`Unsupported comparison: ${operator}`);
  }

  return {
    block,
    operator,
    left: compileNumberExpression(block.getInputTargetBlock?.('A')),
    right: compileNumberExpression(block.getInputTargetBlock?.('B')),
  };
}

function compileNumberExpression(block) {
  if (!block) {
    throw new ProgramCompileError('Numeric comparisons require values on both sides.');
  }

  if (block.type === BLOCK_TYPES.FRONT_DISTANCE) {
    return { kind: 'SENSOR', block, sensorType: SENSOR_TYPES.FRONT_DISTANCE };
  }

  if (block.type === BLOCK_TYPES.NUMBER) {
    const rawValue = block.getFieldValue('NUM');
    const value = Number(rawValue);

    if (rawValue === null || rawValue === '' || !Number.isFinite(value)) {
      throw new ProgramCompileError('Comparison values must be valid numbers.');
    }

    return { kind: 'NUMBER', block, value };
  }

  throw new ProgramCompileError(`Unsupported comparison value: ${block.type}`);
}

function executeProgram(nodes, playground, actions) {
  for (const node of nodes) {
    if (node.kind === 'ACTION') {
      playground.executeActions([node.action]);
      actions.push(node.action);
      continue;
    }

    const branch = evaluateCondition(node.condition, playground)
      ? node.thenBranch
      : node.elseBranch;
    executeProgram(branch, playground, actions);
  }
}

async function executeProgramSequentially(nodes, context) {
  let state = context.playground.getState();

  for (const node of nodes) {
    if (node.kind === 'ACTION') {
      context.workspace.highlightBlock?.(node.block.id);
      state = context.playground.executeActions([node.action]);
      const index = context.actions.length;
      context.actions.push(node.action);
      context.onStep(state, {
        action: node.action,
        block: node.block,
        index,
        total: context.fixedTotal,
      });
      await context.wait(context.delayMs);
      continue;
    }

    const conditionResult = await evaluateConditionSequentially(node.condition, context);
    const branch = conditionResult ? node.thenBranch : node.elseBranch;
    state = await executeProgramSequentially(branch, context);
  }

  return state;
}

function evaluateCondition(condition, playground) {
  const left = readNumberExpression(condition.left, playground);
  const right = readNumberExpression(condition.right, playground);
  return compareNumbers(left, condition.operator, right);
}

async function evaluateConditionSequentially(condition, context) {
  const left = await readNumberExpressionSequentially(condition.left, context);
  const right = await readNumberExpressionSequentially(condition.right, context);
  return compareNumbers(left, condition.operator, right);
}

function readNumberExpression(expression, playground) {
  if (expression.kind === 'NUMBER') {
    return expression.value;
  }

  const result = playground.readSensor?.(expression.sensorType);
  if (!result) {
    throw new ProgramCompileError('This program requires the front-distance sensor runtime.');
  }
  return result.reading.distance;
}

async function readNumberExpressionSequentially(expression, context) {
  if (expression.kind === 'NUMBER') {
    return expression.value;
  }

  context.workspace.highlightBlock?.(expression.block.id);
  const result = context.playground.readSensor?.(expression.sensorType);
  if (!result) {
    throw new ProgramCompileError('This program requires the front-distance sensor runtime.');
  }
  context.onSensor(result.state, {
    block: expression.block,
    reading: result.reading,
  });
  await context.wait(context.delayMs);
  return result.reading.distance;
}

function compareNumbers(left, operator, right) {
  switch (operator) {
    case 'LT': return left < right;
    case 'LTE': return left <= right;
    case 'GT': return left > right;
    case 'GTE': return left >= right;
    case 'EQ': return left === right;
    case 'NEQ': return left !== right;
    default: throw new ProgramCompileError(`Unsupported comparison: ${operator}`);
  }
}

function containsCondition(nodes) {
  return nodes.some((node) => node.kind === 'IF_ELSE');
}

function countActions(nodes) {
  return nodes.filter((node) => node.kind === 'ACTION').length;
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
