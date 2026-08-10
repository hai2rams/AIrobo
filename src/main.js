import {
  createPlayground,
  robotRenderModel,
  targetRenderModel,
} from './playground.js';
import { createBlocklyWorkspace } from './blockly-blocks.js';
import {
  createBlocklyProgramController,
  ProgramCompileError,
} from './blockly-program.js';

const playground = createPlayground();
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
};

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

render(playground.getState());
