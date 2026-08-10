import {
  createPlayground,
  robotRenderModel,
  targetRenderModel,
} from './playground.js';
import { createMissionRuntime } from './mission-runtime.js';
import { REACH_TARGET_MISSION } from './reach-target-mission.js';
import { createBlocklyWorkspace } from './blockly-blocks.js';
import {
  createBlocklyProgramController,
  ProgramCompileError,
} from './blockly-program.js';

const simulationPlayground = createPlayground();
const playground = createMissionRuntime(REACH_TARGET_MISSION, simulationPlayground);
const blocklyWorkspace = createBlocklyWorkspace(
  globalThis.Blockly,
  document.querySelector('#blockly-workspace'),
);
const programController = createBlocklyProgramController(blocklyWorkspace, playground);

const elements = {
  world: document.querySelector('#world'),
  robot: document.querySelector('#robot'),
  target: document.querySelector('#target'),
  x: document.querySelector('#state-x'),
  y: document.querySelector('#state-y'),
  heading: document.querySelector('#state-heading'),
  speed: document.querySelector('#state-speed'),
  step: document.querySelector('#state-step'),
  time: document.querySelector('#state-time'),
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
};

elements.missionTitle.textContent = REACH_TARGET_MISSION.title;
elements.missionDescription.textContent = REACH_TARGET_MISSION.description;
elements.missionTarget.textContent = `(${REACH_TARGET_MISSION.target.x}, ${REACH_TARGET_MISSION.target.y})`;
elements.missionRadius.textContent = String(REACH_TARGET_MISSION.successRadius);

function render(state) {
  const robot = robotRenderModel(state);
  const target = targetRenderModel(state);

  elements.world.style.width = `${state.world.width}px`;
  elements.world.style.height = `${state.world.height}px`;
  Object.assign(elements.robot.style, robot);
  Object.assign(elements.target.style, target);

  elements.x.textContent = formatNumber(state.robot.x);
  elements.y.textContent = formatNumber(state.robot.y);
  elements.heading.textContent = `${formatNumber(state.robot.heading)}°`;
  elements.speed.textContent = formatNumber(state.robot.speed);
  elements.step.textContent = String(state.step);
  elements.time.textContent = String(state.time);
  elements.eventCount.textContent = String(state.events.length);
  elements.missionStatus.textContent = missionStatusLabel(state.mission.status);
  elements.missionAttempts.textContent = String(state.mission.attemptCount);
  elements.missionDistance.textContent = formatNumber(state.mission.distanceToTarget);
  elements.missionFeedback.textContent = missionFeedback(state.mission.status);
  elements.missionPanel.dataset.status = state.mission.status;
  elements.target.classList.toggle('reached', state.mission.status === 'SUCCESS');

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

function formatNumber(value) {
  return Number(value.toFixed(2)).toString();
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
        showProgramMessage(
          `Running action ${step.index + 1} of ${step.total} · ${step.block.toString()}`,
          false,
        );
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
