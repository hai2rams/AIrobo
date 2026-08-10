import {
  createPlayground,
  robotRenderModel,
  targetRenderModel,
} from './playground.js';
import { createMissionRuntime } from './mission-runtime.js';
import { VELOCITY_DIRECTION_MISSION } from './velocity-direction-mission.js';
import { createSensorRuntime } from './sensor-runtime.js?v=m5-spec-contract';
import { createPhysicsRuntime } from './physics-runtime.js?v=m7-physics-contract';
import { createVectorRuntime } from './vector-runtime.js?v=m8-vector-contract';
import { velocityArrowRenderModel } from './vector-motion.js?v=m8-vector-contract';
import { createBlocklyWorkspace } from './blockly-blocks.js?v=m8-vector-contract';
import {
  createBlocklyProgramController,
  ProgramCompileError,
} from './blockly-program.js?v=m8-vector-contract';

const simulationPlayground = createPlayground();
const missionPlayground = createMissionRuntime(
  VELOCITY_DIRECTION_MISSION,
  simulationPlayground,
);
const sensorPlayground = createSensorRuntime(missionPlayground);
const physicsPlayground = createPhysicsRuntime(sensorPlayground);
const playground = createVectorRuntime(physicsPlayground);
const blocklyWorkspace = createBlocklyWorkspace(
  globalThis.Blockly,
  document.querySelector('#blockly-workspace'),
);
const programController = createBlocklyProgramController(blocklyWorkspace, playground);

const elements = {
  world: document.querySelector('#world'),
  robot: document.querySelector('#robot'),
  velocityArrow: document.querySelector('#velocity-arrow'),
  target: document.querySelector('#target'),
  obstacle: document.querySelector('#obstacle'),
  x: document.querySelector('#state-x'),
  y: document.querySelector('#state-y'),
  heading: document.querySelector('#state-heading'),
  speed: document.querySelector('#state-speed'),
  step: document.querySelector('#state-step'),
  time: document.querySelector('#state-time'),
  frontDistance: document.querySelector('#sensor-front-distance'),
  eventLog: document.querySelector('#event-log'),
  eventCount: document.querySelector('#event-count'),
  programMessage: document.querySelector('#program-message'),
  runProgram: document.querySelector('#run-program'),
  missionPanel: document.querySelector('#mission-panel'),
  missionStatus: document.querySelector('#mission-status'),
  missionAttempts: document.querySelector('#mission-attempts'),
  missionDistance: document.querySelector('#mission-distance'),
  missionFeedback: document.querySelector('#mission-feedback'),
  missionTitle: document.querySelector('#mission-title'),
  missionDescription: document.querySelector('#mission-description'),
  missionTarget: document.querySelector('#mission-target'),
  missionRadius: document.querySelector('#mission-radius'),
  physicsSpeed: document.querySelector('#physics-speed'),
  physicsTime: document.querySelector('#physics-time'),
  physicsDistance: document.querySelector('#physics-distance'),
  physicsEquation: document.querySelector('#physics-equation'),
  physicsValues: document.querySelector('#physics-values'),
  physicsExplanation: document.querySelector('#physics-explanation'),
  vectorHeading: document.querySelector('#vector-heading'),
  vectorVx: document.querySelector('#vector-vx'),
  vectorVy: document.querySelector('#vector-vy'),
  vectorDx: document.querySelector('#vector-dx'),
  vectorDy: document.querySelector('#vector-dy'),
  vectorTotalDistance: document.querySelector('#vector-total-distance'),
  vectorNetDisplacement: document.querySelector('#vector-net-displacement'),
};

elements.missionTitle.textContent = VELOCITY_DIRECTION_MISSION.title;
elements.missionDescription.textContent = VELOCITY_DIRECTION_MISSION.description;
elements.missionTarget.textContent = `(${VELOCITY_DIRECTION_MISSION.target.x}, ${VELOCITY_DIRECTION_MISSION.target.y})`;
elements.missionRadius.textContent = String(VELOCITY_DIRECTION_MISSION.successRadius);

function render(state) {
  const robot = robotRenderModel(state);
  const target = targetRenderModel(state);
  const velocityArrow = velocityArrowRenderModel(state);
  const obstacle = state.obstacles[0];

  elements.world.style.width = `${state.world.width}px`;
  elements.world.style.height = `${state.world.height}px`;
  Object.assign(elements.robot.style, robot);
  Object.assign(elements.velocityArrow.style, velocityArrow);
  Object.assign(elements.target.style, target);
  Object.assign(elements.obstacle.style, {
    left: `${obstacle.x}px`,
    top: `${state.world.height - obstacle.y}px`,
    width: `${obstacle.width}px`,
    height: `${obstacle.height}px`,
  });

  elements.x.textContent = formatNumber(state.robot.x);
  elements.y.textContent = formatNumber(state.robot.y);
  elements.heading.textContent = `${formatNumber(state.robot.heading)}°`;
  elements.speed.textContent = formatNumber(state.physics.speed);
  elements.step.textContent = String(state.step);
  elements.time.textContent = String(state.time);
  elements.frontDistance.textContent = formatSensorDistance(
    state.sensors.frontDistance,
  );
  elements.eventCount.textContent = String(state.events.length);
  elements.missionStatus.textContent = missionStatusLabel(state.mission.status);
  elements.missionAttempts.textContent = String(state.mission.attemptCount);
  elements.missionDistance.textContent = formatNumber(state.mission.distanceToTarget);
  elements.missionFeedback.textContent = missionFeedback(state.mission.status);
  elements.missionPanel.dataset.status = state.mission.status;
  elements.target.classList.toggle('reached', state.mission.status === 'SUCCESS');
  renderPhysics(state.physics);
  renderVector(state.vector);

  elements.eventLog.replaceChildren();

  if (state.events.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-log';
    empty.textContent = 'No events yet. Move the robot to begin.';
    elements.eventLog.append(empty);
    return;
  }

  for (const event of state.events) {
    const item = document.createElement('li');
    item.textContent = event.type;
    elements.eventLog.append(item);
  }

  elements.eventLog.scrollTop = elements.eventLog.scrollHeight;
}

function renderVector(vector) {
  elements.vectorHeading.textContent = `${formatNumber(vector.headingDegrees)}°`;
  elements.vectorVx.textContent = `${formatNumber(vector.velocity.x)} units/s`;
  elements.vectorVy.textContent = `${formatNumber(vector.velocity.y)} units/s`;
  elements.vectorDx.textContent = vector.lastMovement
    ? `${formatNumber(vector.lastMovement.dx)} units`
    : '—';
  elements.vectorDy.textContent = vector.lastMovement
    ? `${formatNumber(vector.lastMovement.dy)} units`
    : '—';
  elements.vectorTotalDistance.textContent = `${formatNumber(vector.runSummary.totalDistanceTraveled)} units`;
  elements.vectorNetDisplacement.textContent = `${formatNumber(vector.runSummary.netDisplacement)} units`;
}

function renderPhysics(physics) {
  elements.physicsSpeed.textContent = `${formatNumber(physics.speed)} units/s`;

  if (!physics.lastCalculation) {
    elements.physicsTime.textContent = '—';
    elements.physicsDistance.textContent = '—';
    elements.physicsEquation.textContent = 'distance = speed × time';
    elements.physicsValues.textContent = 'Run a move-for-time block to calculate motion.';
    elements.physicsExplanation.textContent = 'Set a speed, then choose how long the robot should move.';
    return;
  }

  const calculation = physics.lastCalculation;
  elements.physicsTime.textContent = `${formatNumber(calculation.time)} s`;
  elements.physicsDistance.textContent = `${formatNumber(calculation.distance)} units`;
  elements.physicsEquation.textContent = calculation.equation;
  elements.physicsValues.textContent = `${formatNumber(calculation.distance)} = ${formatNumber(calculation.speed)} × ${formatNumber(calculation.time)}`;
  elements.physicsExplanation.textContent = `The robot moved ${formatNumber(calculation.distance)} units because speed × time is ${formatNumber(calculation.speed)} × ${formatNumber(calculation.time)}.`;
}

function formatNumber(value) {
  return Number(value.toFixed(2)).toString();
}

function formatSensorDistance(value) {
  return formatNumber(value);
}

for (const button of document.querySelectorAll('[data-control]')) {
  button.addEventListener('click', () => {
    const state = button.dataset.control === 'RESET'
      ? programController.resetRobot()
      : playground.execute(button.dataset.control);

    render(state);
  });
}

elements.runProgram.addEventListener('click', async () => {
  elements.runProgram.disabled = true;
  elements.runProgram.textContent = 'Running…';

  try {
    const result = await programController.runSequentially({
      onStep(state, step) {
        render(state);
        const progress = step.total === null
          ? `Running action ${step.index + 1}`
          : `Running action ${step.index + 1} of ${step.total}`;
        showProgramMessage(
          `${progress} · ${step.block.toString()}`,
          false,
        );
      },
      onSensor(state, step) {
        render(state);
        showProgramMessage(
          `Sensor read · front distance ${formatSensorDistance(step.reading.value)}`,
          false,
        );
      },
      onLoop(state, step) {
        render(state);
        showProgramMessage(`Repeat ${step.iteration} of ${step.total}`, false);
      },
      onPhysics(state, step) {
        render(state);
        const message = step.operation === 'SET_SPEED'
          ? `Speed set · ${formatNumber(step.speed)} units/s`
          : `Physics · ${formatNumber(step.calculation.distance)} = ${formatNumber(step.calculation.speed)} × ${formatNumber(step.calculation.time)}`;
        showProgramMessage(message, false);
      },
      onVector(state, step) {
        render(state);
        if (step.operation === 'SET_HEADING') {
          showProgramMessage(
            `Heading set · ${formatNumber(step.headingDegrees)}° through TURN`,
            false,
          );
        }
      },
    });
    render(result.state);
    showProgramMessage(`Program complete · ${result.actions.length} actions.`, false);
  } catch (error) {
    if (!(error instanceof ProgramCompileError)) {
      throw error;
    }

    showProgramMessage(error.message, true);
  } finally {
    elements.runProgram.disabled = false;
    elements.runProgram.textContent = '▶ Run Program';
  }
});

document.querySelector('#clear-workspace').addEventListener('click', () => {
  programController.clearWorkspace();
  showProgramMessage('Workspace cleared. Robot state was not changed.', false);
});

function showProgramMessage(message, isError) {
  elements.programMessage.textContent = message;
  elements.programMessage.classList.toggle('error', isError);
}

function missionStatusLabel(status) {
  return status === 'TRY_AGAIN'
    ? 'Try Again'
    : status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ');
}

function missionFeedback(status) {
  switch (status) {
    case 'SUCCESS':
      return 'Target reached! Mission complete.';
    case 'TRY_AGAIN':
      return 'Target not reached. Adjust your program and try again.';
    case 'IN_PROGRESS':
      return 'Mission in progress…';
    default:
      return 'Run your Blockly program to begin the mission.';
  }
}

render(playground.getState());
