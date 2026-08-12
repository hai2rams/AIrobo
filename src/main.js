import {
  createPlayground,
  robotRenderModel,
  targetRenderModel,
} from './playground.js';
import { createMissionRuntime } from './mission-runtime.js';
import { NEWTON_SECOND_LAW_MISSION } from './newton-second-law-mission.js';
import { createSensorRuntime } from './sensor-runtime.js?v=m5-spec-contract';
import { createPhysicsRuntime } from './physics-runtime.js?v=m7-physics-contract';
import { createVectorRuntime } from './vector-runtime.js?v=m8-vector-contract';
import { velocityArrowRenderModel } from './vector-motion.js?v=m8-vector-contract';
import { createAccelerationRuntime } from './acceleration-runtime.js?v=m9-acceleration-contract';
import { createForceRuntime } from './force-runtime.js?v=m10-force-contract';
import {
  accelerationArrowRenderModel,
  forceArrowRenderModel,
} from './force-mass.js?v=m10-force-contract';
import { createBlocklyWorkspace } from './blockly-blocks.js?v=m10-force-contract';
import {
  createBlocklyProgramController,
  ProgramCompileError,
} from './blockly-program.js?v=m10-force-contract';

const simulationPlayground = createPlayground();
const missionPlayground = createMissionRuntime(
  NEWTON_SECOND_LAW_MISSION,
  simulationPlayground,
);
const sensorPlayground = createSensorRuntime(missionPlayground);
const physicsPlayground = createPhysicsRuntime(sensorPlayground);
const vectorPlayground = createVectorRuntime(physicsPlayground);
const accelerationPlayground = createAccelerationRuntime(vectorPlayground);
const playground = createForceRuntime(accelerationPlayground);
const blocklyWorkspace = createBlocklyWorkspace(
  globalThis.Blockly,
  document.querySelector('#blockly-workspace'),
);
const programController = createBlocklyProgramController(blocklyWorkspace, playground);

const elements = {
  world: document.querySelector('#world'),
  robot: document.querySelector('#robot'),
  velocityArrow: document.querySelector('#velocity-arrow'),
  forceArrow: document.querySelector('#force-arrow'),
  accelerationArrow: document.querySelector('#acceleration-arrow'),
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
  accelerationValue: document.querySelector('#acceleration-value'),
  accelerationInitial: document.querySelector('#acceleration-initial'),
  accelerationFinal: document.querySelector('#acceleration-final'),
  accelerationRequestedTime: document.querySelector('#acceleration-requested-time'),
  accelerationEffectiveTime: document.querySelector('#acceleration-effective-time'),
  accelerationDisplacement: document.querySelector('#acceleration-displacement'),
  accelerationVelocityEquation: document.querySelector('#acceleration-velocity-equation'),
  accelerationDisplacementEquation: document.querySelector('#acceleration-displacement-equation'),
  accelerationExplanation: document.querySelector('#acceleration-explanation'),
  velocityGraphLine: document.querySelector('#velocity-time-line'),
  positionGraphLine: document.querySelector('#position-time-line'),
  forceMass: document.querySelector('#force-mass'),
  forceNet: document.querySelector('#force-net'),
  forceAcceleration: document.querySelector('#force-acceleration'),
  forceEquation: document.querySelector('#force-equation'),
  forceChain: document.querySelector('#force-chain'),
  comparisonMass: document.querySelector('#comparison-mass'),
  comparisonForce: document.querySelector('#comparison-force'),
};

elements.missionTitle.textContent = NEWTON_SECOND_LAW_MISSION.title;
elements.missionDescription.textContent = NEWTON_SECOND_LAW_MISSION.description;
elements.missionTarget.textContent = `(${NEWTON_SECOND_LAW_MISSION.target.x}, ${NEWTON_SECOND_LAW_MISSION.target.y})`;
elements.missionRadius.textContent = String(NEWTON_SECOND_LAW_MISSION.successRadius);

function render(state) {
  const robot = robotRenderModel(state);
  const target = targetRenderModel(state);
  const velocityArrow = velocityArrowRenderModel(state);
  const forceArrow = forceArrowRenderModel(state);
  const accelerationArrow = accelerationArrowRenderModel(state);
  const obstacle = state.obstacles[0];

  elements.world.style.width = `${state.world.width}px`;
  elements.world.style.height = `${state.world.height}px`;
  Object.assign(elements.robot.style, robot);
  Object.assign(elements.velocityArrow.style, velocityArrow);
  Object.assign(elements.forceArrow.style, forceArrow);
  Object.assign(elements.accelerationArrow.style, accelerationArrow);
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
  renderAcceleration(state.acceleration);
  renderForce(state.force);

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

function renderForce(force) {
  const acceleration = force.netForce / force.mass;
  elements.forceMass.textContent = `${formatNumber(force.mass)} mass-units`;
  elements.forceNet.textContent = `${formatNumber(force.netForce)} force-units`;
  elements.forceAcceleration.textContent = `${formatNumber(acceleration)} units/s²`;
  elements.forceEquation.textContent = `${formatNumber(acceleration)} = ${formatNumber(force.netForce)} / ${formatNumber(force.mass)}`;
  elements.forceChain.textContent = 'Force + Mass → Acceleration → Velocity Change → Motion';
  const comparison = force.comparisons;
  elements.comparisonMass.textContent = `Same force, mass ${formatNumber(force.mass)} → ${formatNumber(comparison.currentAcceleration)}; mass ${formatNumber(comparison.largerMass)} → ${formatNumber(comparison.largerMassAcceleration)} units/s².`;
  elements.comparisonForce.textContent = `Same mass, force ${formatNumber(force.netForce)} → ${formatNumber(comparison.currentAcceleration)}; force ${formatNumber(comparison.largerForce)} → ${formatNumber(comparison.largerForceAcceleration)} units/s².`;
}

function renderAcceleration(acceleration) {
  elements.accelerationValue.textContent = `${formatNumber(acceleration.acceleration)} units/s²`;

  if (!acceleration.lastCalculation) {
    elements.accelerationInitial.textContent = '—';
    elements.accelerationFinal.textContent = '—';
    elements.accelerationRequestedTime.textContent = '—';
    elements.accelerationEffectiveTime.textContent = '—';
    elements.accelerationDisplacement.textContent = '—';
    elements.accelerationVelocityEquation.textContent = 'vf = vi + at';
    elements.accelerationDisplacementEquation.textContent = 'd = vi t + 1/2 a t²';
    elements.accelerationExplanation.textContent = 'Run an accelerate-for-time block to observe changing velocity.';
    elements.velocityGraphLine.setAttribute('points', '18,102 222,102');
    elements.positionGraphLine.setAttribute('points', '18,102 222,102');
    return;
  }

  const calculation = acceleration.lastCalculation;
  elements.accelerationInitial.textContent = `${formatNumber(calculation.initialVelocity)} units/s`;
  elements.accelerationFinal.textContent = `${formatNumber(calculation.finalVelocity)} units/s`;
  elements.accelerationRequestedTime.textContent = `${formatNumber(calculation.requestedTime)} s`;
  elements.accelerationEffectiveTime.textContent = `${formatNumber(calculation.effectiveTime)} s`;
  elements.accelerationDisplacement.textContent = `${formatNumber(calculation.displacement)} units`;
  elements.accelerationVelocityEquation.textContent = `${formatNumber(calculation.finalVelocity)} = ${formatNumber(calculation.initialVelocity)} + ${formatNumber(calculation.acceleration)} × ${formatNumber(calculation.effectiveTime)}`;
  elements.accelerationDisplacementEquation.textContent = `${formatNumber(calculation.displacement)} = ${formatNumber(calculation.initialVelocity)} × ${formatNumber(calculation.effectiveTime)} + ½ × ${formatNumber(calculation.acceleration)} × ${formatNumber(calculation.effectiveTime)}²`;
  elements.accelerationExplanation.textContent = calculation.stoppedEarly
    ? `Robot stopped after ${formatNumber(calculation.stoppingTime)} s; the remaining requested time caused no reversal.`
    : 'The slope of velocity-time is acceleration; its area is displacement.';
  elements.velocityGraphLine.setAttribute(
    'points',
    graphPoints(acceleration.graphs.velocityTime.points),
  );
  elements.positionGraphLine.setAttribute(
    'points',
    graphPoints(acceleration.graphs.positionTime.points),
  );
}

function graphPoints(points) {
  const maxTime = Math.max(1, ...points.map(({ time }) => time));
  const maxValue = Math.max(1, ...points.map(({ value }) => value));
  return points.map(({ time, value }) => {
    const x = 18 + (time / maxTime) * 204;
    const y = 102 - (value / maxValue) * 84;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
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
      onAcceleration(state, step) {
        render(state);
        const message = step.operation === 'SET_ACCELERATION'
          ? `Acceleration set · ${formatNumber(step.acceleration)} units/s²`
          : `Acceleration · ${formatNumber(step.calculation.initialVelocity)} → ${formatNumber(step.calculation.finalVelocity)} units/s · ${formatNumber(step.calculation.displacement)} units`;
        showProgramMessage(message, false);
      },
      onForce(state, step) {
        render(state);
        let message;
        if (step.operation === 'SET_MASS') {
          message = `Mass set · ${formatNumber(step.mass)} mass-units`;
        } else if (step.operation === 'SET_NET_FORCE') {
          message = `Net force set · ${formatNumber(step.netForce)} force-units`;
        } else {
          message = `Newton's Second Law · ${formatNumber(step.calculation.acceleration)} = ${formatNumber(step.calculation.netForce)} / ${formatNumber(step.calculation.mass)}`;
        }
        showProgramMessage(message, false);
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
