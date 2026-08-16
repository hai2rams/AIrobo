import { SENSOR_TYPES } from './front-distance-sensor.js';
import {
  MAX_MOVE_DURATION,
  MAX_PHYSICS_SPEED,
} from './physics-motion.js';
import { MAX_ACCELERATION_MAGNITUDE } from './acceleration-motion.js';
import {
  MAX_FORCE_MAGNITUDE,
  MAX_MASS,
  MIN_MASS,
} from './force-mass.js';
import { getSurface } from './friction-motion.js';

export const BLOCK_TYPES = Object.freeze({
  WHEN_START: 'when_start',
  MOVE_FORWARD: 'move_forward',
  TURN_LEFT: 'turn_left',
  TURN_RIGHT: 'turn_right',
  FRONT_DISTANCE: 'front_distance',
  IF_ELSE: 'if_else',
  REPEAT: 'repeat_times',
  SET_SPEED: 'set_speed',
  SET_HEADING: 'set_heading',
  MOVE_FOR_TIME: 'move_for_time',
  SET_ACCELERATION: 'set_acceleration',
  ACCELERATE_FOR_TIME: 'accelerate_for_time',
  SET_MASS: 'set_mass',
  SET_NET_FORCE: 'set_net_force',
  APPLY_FORCE_FOR_TIME: 'apply_force_for_time',
  SET_SURFACE: 'set_surface',
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
export const MAX_REPEAT_COUNT = 100;
export const MAX_EXECUTION_STEPS = 500;

export class ProgramExecutionError extends ProgramCompileError {
  constructor(message) {
    super(message);
    this.name = 'ProgramExecutionError';
  }
}

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
    throw new ProgramCompileError('Programs with control flow must execute through the program runner.');
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
  let executionGeneration = 0;

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
      const generation = ++executionGeneration;
      const context = createExecutionContext(
        playground,
        actions,
        () => generation === executionGeneration,
      );
      running = true;
      playground.beginAttempt?.();

      try {
        executeProgram(program, context);
      } finally {
        playground.completeAttempt?.();
        running = false;
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
      onLoop = () => {},
      onPhysics = () => {},
      onVector = () => {},
      onAcceleration = () => {},
      onForce = () => {},
      onFriction = () => {},
    } = {}) {
      assertNotRunning();
      const program = compileWorkspaceProgram(workspace);
      const generation = ++executionGeneration;
      running = true;
      playground.beginAttempt?.();
      let state = playground.getState();
      const actions = [];
      const fixedTotal = containsControlFlow(program) ? null : countActions(program);

      try {
        state = await executeProgramSequentially(program, {
          ...createExecutionContext(
            playground,
            actions,
            () => generation === executionGeneration,
          ),
          playground,
          workspace,
          delayMs,
          wait,
          onStep,
          onSensor,
          onLoop,
          onPhysics,
          onVector,
          onAcceleration,
          onForce,
          onFriction,
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
      executionGeneration += 1;
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
    } else if (block.type === BLOCK_TYPES.REPEAT) {
      nodes.push({
        kind: 'REPEAT',
        block,
        count: readRepeatCount(block),
        body: compileSequence(block.getInputTargetBlock?.('BODY')),
      });
    } else if (block.type === BLOCK_TYPES.SET_SPEED) {
      nodes.push({
        kind: 'SET_SPEED',
        block,
        speed: readPhysicsValue(
          block,
          'SPEED',
          'Speed',
          MAX_PHYSICS_SPEED,
        ),
      });
    } else if (block.type === BLOCK_TYPES.MOVE_FOR_TIME) {
      nodes.push({
        kind: 'MOVE_FOR_TIME',
        block,
        duration: readPhysicsValue(
          block,
          'DURATION',
          'Move duration',
          MAX_MOVE_DURATION,
        ),
      });
    } else if (block.type === BLOCK_TYPES.SET_HEADING) {
      nodes.push({
        kind: 'SET_HEADING',
        block,
        heading: readHeadingValue(block),
      });
    } else if (block.type === BLOCK_TYPES.SET_ACCELERATION) {
      nodes.push({
        kind: 'SET_ACCELERATION',
        block,
        acceleration: readAccelerationValue(block),
      });
    } else if (block.type === BLOCK_TYPES.ACCELERATE_FOR_TIME) {
      nodes.push({
        kind: 'ACCELERATE_FOR_TIME',
        block,
        duration: readPhysicsValue(
          block,
          'DURATION',
          'Acceleration duration',
          MAX_MOVE_DURATION,
        ),
      });
    } else if (block.type === BLOCK_TYPES.SET_MASS) {
      nodes.push({
        kind: 'SET_MASS',
        block,
        mass: readMassValue(block),
      });
    } else if (block.type === BLOCK_TYPES.SET_SURFACE) {
      nodes.push({
        kind: 'SET_SURFACE',
        block,
        surfaceId: readSurfaceId(block),
      });
    } else if (block.type === BLOCK_TYPES.SET_NET_FORCE) {
      nodes.push({
        kind: 'SET_NET_FORCE',
        block,
        netForce: readForceValue(block),
      });
    } else if (block.type === BLOCK_TYPES.APPLY_FORCE_FOR_TIME) {
      nodes.push({
        kind: 'APPLY_FORCE_FOR_TIME',
        block,
        duration: readPhysicsValue(
          block,
          'DURATION',
          'Force duration',
          MAX_MOVE_DURATION,
        ),
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

function executeProgram(nodes, context) {
  for (const node of nodes) {
    context.assertActive();

    if (node.kind === 'ACTION') {
      context.budget.consume('robot action');
      context.playground.executeActions([node.action]);
      context.actions.push(node.action);
      continue;
    }

    if (node.kind === 'SET_SPEED') {
      context.budget.consume('set speed');
      setPhysicsSpeedResult(context.playground, node.speed);
      continue;
    }

    if (node.kind === 'MOVE_FOR_TIME') {
      context.budget.consume('physics calculation');
      context.budget.consume('robot action');
      const result = moveForTimeResult(context.playground, node.duration);
      context.actions.push(result.action);
      continue;
    }

    if (node.kind === 'SET_HEADING') {
      context.budget.consume('set heading');
      context.budget.consume('robot action');
      const result = setHeadingResult(context.playground, node.heading);
      context.actions.push(result.action);
      continue;
    }

    if (node.kind === 'SET_ACCELERATION') {
      context.budget.consume('set acceleration');
      setAccelerationResult(context.playground, node.acceleration);
      continue;
    }

    if (node.kind === 'ACCELERATE_FOR_TIME') {
      context.budget.consume('acceleration calculation');
      context.budget.consume('robot action');
      const result = accelerateForTimeResult(context.playground, node.duration);
      context.actions.push(result.action);
      continue;
    }

    if (node.kind === 'SET_MASS') {
      context.budget.consume('set mass');
      setMassResult(context.playground, node.mass);
      continue;
    }

    if (node.kind === 'SET_SURFACE') {
      context.budget.consume('set surface');
      setSurfaceResult(context.playground, node.surfaceId);
      continue;
    }

    if (node.kind === 'SET_NET_FORCE') {
      context.budget.consume('set net force');
      setNetForceResult(context.playground, node.netForce);
      continue;
    }

    if (node.kind === 'APPLY_FORCE_FOR_TIME') {
      context.budget.consume('friction calculation');
      context.budget.consume('force calculation');
      context.budget.consume('acceleration calculation');
      context.budget.consume('robot action');
      const result = applyForceForTimeResult(context.playground, node.duration);
      context.actions.push(result.action);
      continue;
    }

    if (node.kind === 'IF_ELSE') {
      context.budget.consume('IF condition');
      const branch = evaluateCondition(node.condition, context)
        ? node.thenBranch
        : node.elseBranch;
      executeProgram(branch, context);
      continue;
    }

    for (let iteration = 1; iteration <= node.count; iteration += 1) {
      context.budget.consume('repeat iteration');
      executeProgram(node.body, context);
    }
  }
}

async function executeProgramSequentially(nodes, context) {
  let state = context.playground.getState();

  for (const node of nodes) {
    context.assertActive();

    if (node.kind === 'ACTION') {
      context.budget.consume('robot action');
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
      context.assertActive();
      continue;
    }

    if (node.kind === 'SET_SPEED') {
      context.budget.consume('set speed');
      context.workspace.highlightBlock?.(node.block.id);
      state = setPhysicsSpeedResult(context.playground, node.speed);
      context.onPhysics(state, {
        operation: 'SET_SPEED',
        block: node.block,
        speed: node.speed,
      });
      await context.wait(context.delayMs);
      context.assertActive();
      continue;
    }

    if (node.kind === 'MOVE_FOR_TIME') {
      context.budget.consume('physics calculation');
      context.budget.consume('robot action');
      context.workspace.highlightBlock?.(node.block.id);
      const result = moveForTimeResult(context.playground, node.duration);
      state = result.state;
      const index = context.actions.length;
      context.actions.push(result.action);
      context.onPhysics(state, {
        operation: 'MOVE_FOR_TIME',
        block: node.block,
        duration: node.duration,
        action: result.action,
        calculation: result.calculation,
        index,
        total: context.fixedTotal,
      });
      context.onVector(state, {
        operation: 'MOVE_FOR_TIME',
        block: node.block,
        calculation: result.vectorCalculation,
      });
      await context.wait(context.delayMs);
      context.assertActive();
      continue;
    }

    if (node.kind === 'SET_HEADING') {
      context.budget.consume('set heading');
      context.budget.consume('robot action');
      context.workspace.highlightBlock?.(node.block.id);
      const result = setHeadingResult(context.playground, node.heading);
      state = result.state;
      const index = context.actions.length;
      context.actions.push(result.action);
      context.onVector(state, {
        operation: 'SET_HEADING',
        block: node.block,
        requestedHeading: node.heading,
        headingDegrees: result.headingDegrees,
        action: result.action,
        index,
        total: context.fixedTotal,
      });
      await context.wait(context.delayMs);
      context.assertActive();
      continue;
    }

    if (node.kind === 'SET_ACCELERATION') {
      context.budget.consume('set acceleration');
      context.workspace.highlightBlock?.(node.block.id);
      state = setAccelerationResult(context.playground, node.acceleration);
      context.onAcceleration(state, {
        operation: 'SET_ACCELERATION',
        block: node.block,
        acceleration: node.acceleration,
      });
      await context.wait(context.delayMs);
      context.assertActive();
      continue;
    }

    if (node.kind === 'ACCELERATE_FOR_TIME') {
      context.budget.consume('acceleration calculation');
      context.budget.consume('robot action');
      context.workspace.highlightBlock?.(node.block.id);
      const result = accelerateForTimeResult(context.playground, node.duration);
      state = result.state;
      const index = context.actions.length;
      context.actions.push(result.action);
      context.onAcceleration(state, {
        operation: 'ACCELERATE_FOR_TIME',
        block: node.block,
        duration: node.duration,
        action: result.action,
        calculation: result.calculation,
        vectorCalculation: result.vectorCalculation,
        index,
        total: context.fixedTotal,
      });
      await context.wait(context.delayMs);
      context.assertActive();
      continue;
    }

    if (node.kind === 'SET_MASS') {
      context.budget.consume('set mass');
      context.workspace.highlightBlock?.(node.block.id);
      state = setMassResult(context.playground, node.mass);
      context.onForce(state, {
        operation: 'SET_MASS',
        block: node.block,
        mass: node.mass,
      });
      await context.wait(context.delayMs);
      context.assertActive();
      continue;
    }

    if (node.kind === 'SET_SURFACE') {
      context.budget.consume('set surface');
      context.workspace.highlightBlock?.(node.block.id);
      state = setSurfaceResult(context.playground, node.surfaceId);
      context.onFriction(state, {
        operation: 'SET_SURFACE',
        block: node.block,
        surfaceId: node.surfaceId,
      });
      await context.wait(context.delayMs);
      context.assertActive();
      continue;
    }

    if (node.kind === 'SET_NET_FORCE') {
      context.budget.consume('set net force');
      context.workspace.highlightBlock?.(node.block.id);
      state = setNetForceResult(context.playground, node.netForce);
      context.onForce(state, {
        operation: 'SET_NET_FORCE',
        block: node.block,
        netForce: node.netForce,
      });
      await context.wait(context.delayMs);
      context.assertActive();
      continue;
    }

    if (node.kind === 'APPLY_FORCE_FOR_TIME') {
      context.budget.consume('friction calculation');
      context.budget.consume('force calculation');
      context.budget.consume('acceleration calculation');
      context.budget.consume('robot action');
      context.workspace.highlightBlock?.(node.block.id);
      const result = applyForceForTimeResult(context.playground, node.duration);
      state = result.state;
      const index = context.actions.length;
      context.actions.push(result.action);
      context.onForce(state, {
        operation: 'APPLY_FORCE_FOR_TIME',
        block: node.block,
        duration: node.duration,
        action: result.action,
        calculation: result.calculation,
        accelerationCalculation: result.accelerationCalculation,
        vectorCalculation: result.vectorCalculation,
        index,
        total: context.fixedTotal,
      });
      if (result.frictionCalculation) {
        context.onFriction(state, {
          operation: 'APPLY_FORCE_FOR_TIME',
          block: node.block,
          calculation: result.frictionCalculation,
          index,
          total: context.fixedTotal,
        });
      }
      await context.wait(context.delayMs);
      context.assertActive();
      continue;
    }

    if (node.kind === 'IF_ELSE') {
      context.budget.consume('IF condition');
      context.workspace.highlightBlock?.(node.block.id);
      const conditionResult = await evaluateConditionSequentially(
        node.condition,
        context,
        node.block,
      );
      const branch = conditionResult ? node.thenBranch : node.elseBranch;
      state = await executeProgramSequentially(branch, context);
      continue;
    }

    for (let iteration = 1; iteration <= node.count; iteration += 1) {
      context.assertActive();
      context.budget.consume('repeat iteration');
      context.workspace.highlightBlock?.(node.block.id);
      context.onLoop(context.playground.getState(), {
        block: node.block,
        iteration,
        total: node.count,
      });
      await context.wait(context.delayMs);
      context.assertActive();
      state = await executeProgramSequentially(node.body, context);
    }
  }

  return state;
}

function evaluateCondition(condition, context) {
  const left = readNumberExpression(condition.left, context);
  const right = readNumberExpression(condition.right, context);
  return compareNumbers(left, condition.operator, right);
}

async function evaluateConditionSequentially(condition, context, conditionBlock) {
  const left = await readNumberExpressionSequentially(
    condition.left,
    context,
    conditionBlock,
  );
  const right = await readNumberExpressionSequentially(
    condition.right,
    context,
    conditionBlock,
  );
  return compareNumbers(left, condition.operator, right);
}

function readNumberExpression(expression, context) {
  if (expression.kind === 'NUMBER') {
    return expression.value;
  }

  context.budget.consume('sensor evaluation');
  return readSensorResult(context.playground, expression.sensorType).reading.value;
}

async function readNumberExpressionSequentially(expression, context, conditionBlock) {
  if (expression.kind === 'NUMBER') {
    return expression.value;
  }

  context.budget.consume('sensor evaluation');
  const result = readSensorResult(context.playground, expression.sensorType);
  context.onSensor(result.state, {
    block: conditionBlock,
    reading: result.reading,
  });
  await context.wait(context.delayMs);
  context.assertActive();
  return result.reading.value;
}

function readSensorResult(playground, sensorType) {
  let result;

  try {
    result = playground.readSensor?.(sensorType);
  } catch {
    throw new ProgramCompileError(
      'The front distance sensor could not produce a valid finite value.',
    );
  }

  if (!result) {
    throw new ProgramCompileError('This program requires the front-distance sensor runtime.');
  }

  if (
    result.reading?.sensor !== SENSOR_TYPES.FRONT_DISTANCE
    || !Number.isFinite(result.reading.value)
  ) {
    throw new ProgramCompileError(
      'The front distance sensor could not produce a valid finite value.',
    );
  }

  return result;
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

function containsControlFlow(nodes) {
  return nodes.some((node) => node.kind !== 'ACTION');
}

function countActions(nodes) {
  return nodes.filter((node) => node.kind === 'ACTION').length;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readRepeatCount(block) {
  const rawValue = block.getFieldValue('COUNT');
  const count = Number(rawValue);

  if (
    rawValue === null
    || rawValue === ''
    || !Number.isFinite(count)
    || !Number.isInteger(count)
    || count < 0
    || count > MAX_REPEAT_COUNT
  ) {
    throw new ProgramCompileError(
      `Repeat count must be a finite integer from 0 to ${MAX_REPEAT_COUNT}.`,
    );
  }

  return count;
}

function readPhysicsValue(block, fieldName, label, maximum) {
  const rawValue = block.getFieldValue(fieldName);
  const value = Number(rawValue);

  if (
    rawValue === null
    || rawValue === ''
    || !Number.isFinite(value)
    || value < 0
    || value > maximum
  ) {
    throw new ProgramCompileError(
      `${label} must be a finite number from 0 to ${maximum}.`,
    );
  }

  return value;
}

function setPhysicsSpeedResult(playground, speed) {
  if (typeof playground.setPhysicsSpeed !== 'function') {
    throw new ProgramCompileError('This program requires the physics learning runtime.');
  }

  try {
    return playground.setPhysicsSpeed(speed);
  } catch (error) {
    throw new ProgramCompileError(error.message);
  }
}

function moveForTimeResult(playground, duration) {
  if (typeof playground.moveForTime !== 'function') {
    throw new ProgramCompileError('This program requires the physics learning runtime.');
  }

  try {
    return playground.moveForTime(duration);
  } catch (error) {
    throw new ProgramCompileError(error.message);
  }
}

function setHeadingResult(playground, heading) {
  if (typeof playground.setHeading !== 'function') {
    throw new ProgramCompileError('This program requires the vector learning runtime.');
  }

  try {
    return playground.setHeading(heading);
  } catch (error) {
    throw new ProgramCompileError(error.message);
  }
}

function setAccelerationResult(playground, acceleration) {
  if (typeof playground.setAcceleration !== 'function') {
    throw new ProgramCompileError('This program requires the acceleration learning runtime.');
  }
  try {
    return playground.setAcceleration(acceleration);
  } catch (error) {
    throw new ProgramCompileError(error.message);
  }
}

function accelerateForTimeResult(playground, duration) {
  if (typeof playground.accelerateForTime !== 'function') {
    throw new ProgramCompileError('This program requires the acceleration learning runtime.');
  }
  try {
    return playground.accelerateForTime(duration);
  } catch (error) {
    throw new ProgramCompileError(error.message);
  }
}

function setMassResult(playground, mass) {
  if (typeof playground.setMass !== 'function') {
    throw new ProgramCompileError('This program requires the force and mass learning runtime.');
  }
  try {
    return playground.setMass(mass);
  } catch (error) {
    throw new ProgramCompileError(error.message);
  }
}

function setSurfaceResult(playground, surfaceId) {
  if (typeof playground.setSurface !== 'function') {
    throw new ProgramCompileError('This program requires the friction learning runtime.');
  }
  try {
    return playground.setSurface(surfaceId);
  } catch (error) {
    throw new ProgramCompileError(error.message);
  }
}

function setNetForceResult(playground, netForce) {
  if (typeof playground.setNetForce !== 'function') {
    throw new ProgramCompileError('This program requires the force and mass learning runtime.');
  }
  try {
    return playground.setNetForce(netForce);
  } catch (error) {
    throw new ProgramCompileError(error.message);
  }
}

function applyForceForTimeResult(playground, duration) {
  if (typeof playground.applyForceForTime !== 'function') {
    throw new ProgramCompileError('This program requires the force and mass learning runtime.');
  }
  try {
    return playground.applyForceForTime(duration);
  } catch (error) {
    throw new ProgramCompileError(error.message);
  }
}

function createExecutionContext(playground, actions, isActive) {
  let executionSteps = 0;

  return {
    playground,
    actions,
    budget: {
      consume(operation) {
        if (executionSteps >= MAX_EXECUTION_STEPS) {
          throw new ProgramExecutionError(
            `Program stopped at the ${MAX_EXECUTION_STEPS}-step safety limit before ${operation}.`,
          );
        }
        executionSteps += 1;
      },
    },
    assertActive() {
      if (!isActive()) {
        throw new ProgramExecutionError('Program cancelled by Reset.');
      }
    },
  };
}

function readMagnitude(block, fieldName, label) {
  const rawValue = block.getFieldValue(fieldName);
  const value = Number(rawValue);

  if (rawValue === null || rawValue === '' || !Number.isFinite(value) || value < 0) {
    throw new ProgramCompileError(`${label} must be a valid non-negative number.`);
  }

  return value;
}

function readHeadingValue(block) {
  const rawValue = block.getFieldValue('HEADING');
  const value = Number(rawValue);

  if (rawValue === null || rawValue === '' || !Number.isFinite(value)) {
    throw new ProgramCompileError('Heading must be a finite number.');
  }

  return value;
}

function readAccelerationValue(block) {
  const rawValue = block.getFieldValue('ACCELERATION');
  const value = Number(rawValue);

  if (
    rawValue === null
    || rawValue === ''
    || !Number.isFinite(value)
    || Math.abs(value) > MAX_ACCELERATION_MAGNITUDE
  ) {
    throw new ProgramCompileError(
      `Acceleration must be a finite number from -${MAX_ACCELERATION_MAGNITUDE} to ${MAX_ACCELERATION_MAGNITUDE}.`,
    );
  }
  return value;
}

function readMassValue(block) {
  const rawValue = block.getFieldValue('MASS');
  const value = Number(rawValue);
  if (
    rawValue === null
    || rawValue === ''
    || !Number.isFinite(value)
    || value < MIN_MASS
    || value > MAX_MASS
  ) {
    throw new ProgramCompileError(
      `Mass must be a finite number from ${MIN_MASS} to ${MAX_MASS}.`,
    );
  }
  return value;
}

function readForceValue(block) {
  const rawValue = block.getFieldValue('FORCE');
  const value = Number(rawValue);
  if (
    rawValue === null
    || rawValue === ''
    || !Number.isFinite(value)
    || Math.abs(value) > MAX_FORCE_MAGNITUDE
  ) {
    throw new ProgramCompileError(
      `Net force must be a finite number from -${MAX_FORCE_MAGNITUDE} to ${MAX_FORCE_MAGNITUDE}.`,
    );
  }
  return value;
}

function readSurfaceId(block) {
  const surfaceId = block.getFieldValue('SURFACE');
  try {
    return getSurface(surfaceId).id;
  } catch (error) {
    throw new ProgramCompileError(error.message);
  }
}
