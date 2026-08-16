import assert from 'node:assert/strict';
import test from 'node:test';

import { createAccelerationRuntime } from '../src/acceleration-runtime.js';
import {
  BLOCK_TYPES,
  createBlocklyProgramController,
  DEFAULT_ACTION_DELAY_MS,
  MAX_EXECUTION_STEPS,
  MAX_REPEAT_COUNT,
  ProgramExecutionError,
} from '../src/blockly-program.js';
import { createFrictionRuntime } from '../src/friction-runtime.js';
import { createForceRuntime } from '../src/force-runtime.js';
import { createMissionRuntime } from '../src/mission-runtime.js';
import { createPhysicsRuntime } from '../src/physics-runtime.js';
import { createPlayground } from '../src/playground.js';
import { createSensorRuntime } from '../src/sensor-runtime.js';
import { simulate } from '../src/simulation-kernel.js';
import { createVectorRuntime } from '../src/vector-runtime.js';
import {
  calculateWorkEnergy,
  createEnergyState,
  ENERGY_EPSILON,
  energyVisualizationModel,
  kineticEnergy,
  updateEnergyState,
  workEnergyExplanation,
} from '../src/work-energy.js';
import { WORK_ENERGY_MISSION } from '../src/work-energy-mission.js';
import { createWorkEnergyRuntime } from '../src/work-energy-runtime.js';

let nextBlockId = 1;

class FakeBlock {
  constructor(type, { fields = {}, inputs = {} } = {}) {
    this.id = `m12-block-${nextBlockId++}`;
    this.type = type;
    this.fields = fields;
    this.inputs = inputs;
    this.next = null;
  }
  getFieldValue(name) { return this.fields[name] ?? null; }
  getInputTargetBlock(name) { return this.inputs[name] ?? null; }
  getNextBlock() { return this.next; }
  toString() { return this.type; }
}

function connect(...blocks) {
  blocks.forEach((block, index) => { block.next = blocks[index + 1] ?? null; });
  return blocks[0];
}

function workspaceFor(firstBlock) {
  const start = new FakeBlock(BLOCK_TYPES.WHEN_START);
  start.next = firstBlock;
  return {
    cleared: false,
    highlights: [],
    getTopBlocks() { return this.cleared ? [] : [start]; },
    highlightBlock(id) { this.highlights.push(id); },
    clear() { this.cleared = true; },
  };
}

const speedBlock = (speed) => new FakeBlock(BLOCK_TYPES.SET_SPEED, { fields: { SPEED: speed } });
const surfaceBlock = (surface) => new FakeBlock(BLOCK_TYPES.SET_SURFACE, { fields: { SURFACE: surface } });
const massBlock = (mass) => new FakeBlock(BLOCK_TYPES.SET_MASS, { fields: { MASS: mass } });
const forceBlock = (force) => new FakeBlock(BLOCK_TYPES.SET_NET_FORCE, { fields: { FORCE: force } });
const applyBlock = (duration) => new FakeBlock(BLOCK_TYPES.APPLY_FORCE_FOR_TIME, { fields: { DURATION: duration } });

function energyRuntime(playground = createPlayground()) {
  return createWorkEnergyRuntime(
    createFrictionRuntime(
      createForceRuntime(
        createAccelerationRuntime(
          createVectorRuntime(
            createPhysicsRuntime(createSensorRuntime(playground)),
          ),
        ),
      ),
    ),
  );
}

function missionEnergyRuntime(playground = createPlayground()) {
  return createWorkEnergyRuntime(
    createFrictionRuntime(
      createForceRuntime(
        createAccelerationRuntime(
          createVectorRuntime(
            createPhysicsRuntime(
              createSensorRuntime(
                createMissionRuntime(WORK_ENERGY_MISSION, playground),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function runEnergyProgram({
  speed = 0,
  surface = 'normal',
  mass = 2,
  force = 20,
  duration = 3,
  runtime = energyRuntime(),
} = {}) {
  return createBlocklyProgramController(
    workspaceFor(connect(
      speedBlock(speed), surfaceBlock(surface), massBlock(mass), forceBlock(force), applyBlock(duration),
    )),
    runtime,
  ).run();
}

test('M12 epsilon, mission, and inherited safety contracts match the spec', () => {
  assert.equal(ENERGY_EPSILON, 1e-8);
  assert.equal(MAX_REPEAT_COUNT, 100);
  assert.equal(MAX_EXECUTION_STEPS, 500);
  assert.deepEqual(WORK_ENERGY_MISSION, {
    id: 'work-energy-01',
    title: 'Give the Robot Enough Energy',
    description: 'Use force and motion to reach the target while observing work and kinetic energy.',
    target: { x: 200, y: 200 },
    successRadius: 15,
    concepts: ['work', 'force', 'displacement', 'kinetic energy', 'work-energy theorem', 'friction'],
  });
});

test('kinetic energy is one half mass times speed squared and zero at rest', () => {
  assert.equal(kineticEnergy(2, 10), 100);
  assert.equal(kineticEnergy(100, 0), 0);
});

test('kinetic energy scales linearly with mass', () => {
  assert.equal(kineticEnergy(4, 10), 2 * kineticEnergy(2, 10));
});

test('kinetic energy scales with speed squared', () => {
  assert.equal(kineticEnergy(2, 20), 4 * kineticEnergy(2, 10));
});

test('zero displacement produces zero applied, friction, and net work', () => {
  const result = calculateWorkEnergy({
    mass: 2,
    initialSpeed: 0,
    finalSpeed: 0,
    displacement: 0,
    appliedForce: 5,
    frictionForce: -5,
  });
  assert.equal(result.appliedWork, 0);
  assert.equal(result.frictionWork, 0);
  assert.equal(result.netWork, 0);
  assert.equal(result.deltaKineticEnergy, 0);
  assert.equal(result.withinTolerance, true);
});

test('aligned applied force does positive work and opposing force does negative work', () => {
  const positive = calculateWorkEnergy({
    mass: 2, initialSpeed: 0, finalSpeed: 10, displacement: 10, appliedForce: 10, frictionForce: 0,
  });
  const negative = calculateWorkEnergy({
    mass: 2, initialSpeed: 10, finalSpeed: 0, displacement: 10, appliedForce: -10, frictionForce: 0,
  });
  assert.equal(positive.appliedWork, 100);
  assert.equal(negative.appliedWork, -100);
});

test('friction work is negative and net work is the sum of component work', () => {
  const result = calculateWorkEnergy({
    mass: 2, initialSpeed: 0, finalSpeed: 8, displacement: 8, appliedForce: 12, frictionForce: -4,
  });
  assert.equal(result.appliedWork, 96);
  assert.equal(result.frictionWork, -32);
  assert.equal(result.netWork, 64);
  assert.equal(result.deltaKineticEnergy, 64);
  assert.equal(result.workEnergyResidual, 0);
});

test('invalid work-energy inputs reject without NaN or Infinity', () => {
  assert.throws(() => kineticEnergy(0, 10), /Mass/);
  assert.throws(() => kineticEnergy(2, -1), /Speed/);
  assert.throws(() => calculateWorkEnergy({
    mass: 2,
    initialSpeed: 0,
    finalSpeed: 1,
    displacement: Number.POSITIVE_INFINITY,
    appliedForce: 1,
    frictionForce: 0,
  }), /Displacement/);
});

test('frictionless force segment satisfies work-energy theorem', () => {
  const result = runEnergyProgram({ surface: 'ideal', force: 20, duration: 3 });
  const calculation = result.state.energy.lastCalculation;
  assert.equal(calculation.displacement, 45);
  assert.equal(calculation.appliedWork, 900);
  assert.equal(calculation.frictionWork, 0);
  assert.equal(calculation.netWork, 900);
  assert.equal(calculation.deltaKineticEnergy, 900);
  assert.ok(Math.abs(calculation.workEnergyResidual) <= ENERGY_EPSILON);
});

test('static friction produces no movement and no mechanical work', () => {
  const result = runEnergyProgram({ surface: 'normal', force: 5, duration: 3 });
  const calculation = result.state.energy.lastCalculation;
  assert.equal(result.state.robot.x, 100);
  assert.equal(calculation.displacement, 0);
  assert.equal(calculation.appliedWork, 0);
  assert.equal(calculation.frictionWork, 0);
  assert.equal(calculation.netWork, 0);
  assert.equal(calculation.deltaKineticEnergy, 0);
});

test('rough-surface motion reuses M11 forces and produces negative friction work', () => {
  const result = runEnergyProgram({ surface: 'rough', force: 20, duration: 3 });
  const calculation = result.state.energy.lastCalculation;
  assert.equal(calculation.displacement, 24.75);
  assert.equal(calculation.appliedForce, 20);
  assert.equal(calculation.frictionForce, -9);
  assert.equal(calculation.appliedWork, 495);
  assert.equal(calculation.frictionWork, -222.75);
  assert.equal(calculation.netWork, 272.25);
  assert.equal(calculation.deltaKineticEnergy, 272.25);
  assert.equal(calculation.withinTolerance, true);
});

test('braking produces negative work, lower KE, and no reversal', () => {
  const result = runEnergyProgram({ speed: 10, surface: 'normal', force: -2, duration: 2 });
  const calculation = result.state.energy.lastCalculation;
  assert.equal(calculation.initialKineticEnergy, 100);
  assert.equal(calculation.finalKineticEnergy, 16);
  assert.equal(calculation.deltaKineticEnergy, -84);
  assert.equal(calculation.netWork, -84);
  assert.equal(result.state.physics.speed, 4);
  assert.ok(result.actions[0].distance >= 0);
});

test('same inputs produce less energy and displacement on rough than ideal', () => {
  const ideal = runEnergyProgram({ surface: 'ideal', force: 20, duration: 3 }).state;
  const rough = runEnergyProgram({ surface: 'rough', force: 20, duration: 3 }).state;
  assert.ok(rough.energy.lastCalculation.finalKineticEnergy < ideal.energy.lastCalculation.finalKineticEnergy);
  assert.ok(rough.energy.lastCalculation.netWork < ideal.energy.lastCalculation.netWork);
  assert.ok(rough.energy.lastCalculation.displacement < ideal.energy.lastCalculation.displacement);
  assert.ok(rough.energy.lastCalculation.frictionWork < 0);
});

test('M12 consumes completed structured displacement and reports inconsistency without correction', () => {
  let state = {
    robot: { x: 100, y: 200, heading: 0, speed: 0 },
    physics: { speed: 2 },
    force: { mass: 2 },
    events: [],
  };
  const fakeM11 = {
    getState: () => state,
    applyForceForTime() {
      state = { ...state, robot: { ...state.robot, x: 107 }, physics: { speed: 4 }, events: [{ type: 'ROBOT_MOVED' }] };
      return {
        accelerationCalculation: { initialVelocity: 2, finalVelocity: 4 },
        vectorCalculation: { displacement: { magnitude: 7 } },
        frictionCalculation: { appliedForce: 3, frictionForce: 0 },
        action: { type: 'MOVE_FORWARD', distance: 99 },
      };
    },
  };
  const result = createWorkEnergyRuntime(fakeM11).applyForceForTime(1);
  assert.equal(result.workEnergyCalculation.displacement, 7);
  assert.equal(result.workEnergyCalculation.workEnergyResidual, 9);
  assert.equal(result.workEnergyCalculation.withinTolerance, false);
  assert.equal(result.state.robot.x, 107);
});

test('M12 never mutates x/y and movement remains a single M1 action', () => {
  const kernelCalls = [];
  const playground = createPlayground((worldState, action) => {
    kernelCalls.push({ worldState: { ...worldState }, action: { ...action } });
    return simulate(worldState, action);
  });
  const result = runEnergyProgram({ surface: 'ideal', runtime: energyRuntime(playground) });
  assert.equal(kernelCalls.length, 1);
  assert.deepEqual(kernelCalls[0].action, { type: 'MOVE_FORWARD', distance: 45 });
  assert.equal(result.state.robot.x, 145);
});

test('work-energy event follows movement and precedes mission success', () => {
  const result = runEnergyProgram({
    surface: 'normal',
    force: 20,
    duration: 5,
    runtime: missionEnergyRuntime(),
  });
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'FRICTION_CALCULATION',
    'FORCE_CALCULATION',
    'ACCELERATION_CALCULATION',
    'VECTOR_CALCULATION',
    'ROBOT_MOVED',
    'WORK_ENERGY_CALCULATION',
    'TARGET_REACHED',
  ]);
  assert.equal(result.state.mission.status, 'SUCCESS');
});

test('repeat emits one calculation per segment and accumulates theorem-consistent totals', () => {
  const repeat = new FakeBlock(BLOCK_TYPES.REPEAT, {
    fields: { COUNT: 3 },
    inputs: { BODY: applyBlock(1) },
  });
  const result = createBlocklyProgramController(
    workspaceFor(connect(speedBlock(0), surfaceBlock('normal'), massBlock(2), forceBlock(20), repeat)),
    energyRuntime(),
  ).run();
  const calculations = result.state.events.filter(({ type }) => type === 'WORK_ENERGY_CALCULATION');
  assert.equal(calculations.length, 3);
  assert.equal(result.state.energy.runSummary.segmentCount, 3);
  assert.equal(result.state.energy.runSummary.totalAppliedWork, 720);
  assert.equal(result.state.energy.runSummary.totalFrictionWork, -144);
  assert.equal(result.state.energy.runSummary.totalNetWork, 576);
  assert.equal(result.state.energy.runSummary.runDeltaKE, 576);
  assert.equal(result.state.energy.runSummary.withinTolerance, true);
});

test('sensor and IF/ELSE preserve selected force and M12 event order', () => {
  const comparison = new FakeBlock(BLOCK_TYPES.LOGIC_COMPARE, {
    fields: { OP: 'LT' },
    inputs: {
      A: new FakeBlock(BLOCK_TYPES.FRONT_DISTANCE),
      B: new FakeBlock(BLOCK_TYPES.NUMBER, { fields: { NUM: 50 } }),
    },
  });
  const condition = new FakeBlock(BLOCK_TYPES.IF_ELSE, {
    inputs: {
      CONDITION: comparison,
      DO: forceBlock(0),
      ELSE: forceBlock(20),
    },
  });
  const result = createBlocklyProgramController(
    workspaceFor(connect(speedBlock(0), surfaceBlock('normal'), massBlock(2), condition, applyBlock(1))),
    energyRuntime(),
  ).run();
  assert.equal(result.state.friction.appliedForce, 20);
  assert.deepEqual(result.state.events.map(({ type }) => type), [
    'SENSOR_READ',
    'FRICTION_CALCULATION',
    'FORCE_CALCULATION',
    'ACCELERATION_CALCULATION',
    'VECTOR_CALCULATION',
    'ROBOT_MOVED',
    'WORK_ENERGY_CALCULATION',
  ]);
});

test('valid Work + Energy mission reaches the target through existing mission evaluator', () => {
  const result = runEnergyProgram({
    surface: 'normal', force: 20, duration: 5, runtime: missionEnergyRuntime(),
  });
  assert.equal(result.state.robot.x, 200);
  assert.equal(result.state.mission.status, 'SUCCESS');
  assert.equal(result.state.events.at(-1).type, 'TARGET_REACHED');
  assert.equal(result.state.energy.lastCalculation.finalKineticEnergy, 1600);
});

test('energy visualization and deterministic explanations consume structured M12 data', () => {
  const state = runEnergyProgram({ surface: 'rough', force: 20, duration: 3 }).state.energy;
  const model = energyVisualizationModel(state);
  assert.equal(model.frictionWork.value, -222.75);
  assert.equal(model.frictionWork.sign, 'negative');
  assert.match(model.frictionWork.width, /%$/);
  assert.equal(model.finalKineticEnergy.value, state.lastCalculation.finalKineticEnergy);
  assert.equal(
    workEnergyExplanation(state.lastCalculation),
    'The applied force added kinetic energy while friction did negative work.',
  );
});

test('Reset clears M12 state and Clear Workspace preserves live energy', () => {
  const workspace = workspaceFor(connect(
    speedBlock(0), surfaceBlock('normal'), massBlock(2), forceBlock(20), applyBlock(1),
  ));
  const runtime = energyRuntime();
  const controller = createBlocklyProgramController(workspace, runtime);
  controller.run();
  const beforeClear = structuredClone(runtime.getState());
  assert.deepEqual(controller.clearWorkspace(), beforeClear);
  const reset = controller.resetRobot();
  assert.equal(reset.energy.currentKineticEnergy, 0);
  assert.equal(reset.energy.lastCalculation, null);
  assert.deepEqual(reset.energy.runSummary, createEnergyState(1, 0).runSummary);
  assert.deepEqual(reset.events, []);
});

test('M12 preserves highlighting, delay, and one energy callback per force segment', async () => {
  const speed = speedBlock(0);
  const surface = surfaceBlock('normal');
  const mass = massBlock(2);
  const force = forceBlock(20);
  const apply = applyBlock(1);
  const workspace = workspaceFor(connect(speed, surface, mass, force, apply));
  const waits = [];
  const observed = [];
  await createBlocklyProgramController(workspace, energyRuntime()).runSequentially({
    wait(milliseconds) { waits.push(milliseconds); return Promise.resolve(); },
    onEnergy(state, step) { observed.push({ netWork: step.calculation.netWork, x: state.robot.x }); },
  });
  assert.deepEqual(workspace.highlights, [speed.id, surface.id, mass.id, force.id, apply.id, null]);
  assert.deepEqual(waits, Array(5).fill(DEFAULT_ACTION_DELAY_MS));
  assert.deepEqual(observed, [{ netWork: 64, x: 104 }]);
});

test('existing execution budget remains effective around M12 observation', () => {
  const inner = new FakeBlock(BLOCK_TYPES.REPEAT, {
    fields: { COUNT: 100 },
    inputs: { BODY: applyBlock(0) },
  });
  const outer = new FakeBlock(BLOCK_TYPES.REPEAT, {
    fields: { COUNT: 100 },
    inputs: { BODY: inner },
  });
  const controller = createBlocklyProgramController(
    workspaceFor(connect(surfaceBlock('normal'), massBlock(2), forceBlock(20), outer)),
    energyRuntime(),
  );
  assert.throws(() => controller.run(), ProgramExecutionError);
  assert.equal(controller.isRunning(), false);
});

test('energy state accumulation is deterministic and immutable', () => {
  const firstCalculation = calculateWorkEnergy({
    mass: 2, initialSpeed: 0, finalSpeed: 8, displacement: 8, appliedForce: 12, frictionForce: -4,
  });
  const initial = createEnergyState(2, 0);
  const updated = updateEnergyState(initial, firstCalculation);
  assert.equal(initial.lastCalculation, null);
  assert.equal(updated.runSummary.totalNetWork, 64);
  assert.deepEqual(runEnergyProgram({ surface: 'rough' }), runEnergyProgram({ surface: 'rough' }));
});
