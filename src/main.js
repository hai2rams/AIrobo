import {
  createPlayground,
  robotRenderModel,
  targetRenderModel,
} from './playground.js';

const playground = createPlayground();

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
    render(playground.execute(button.dataset.control));
  });
}

render(playground.getState());
