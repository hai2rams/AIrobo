export const SENSOR_TYPES = Object.freeze({
  FRONT_DISTANCE: 'FRONT_DISTANCE',
});

export const MAX_SENSOR_RANGE = 500;
export const SENSOR_UNIT = 'world-units';

const PARALLEL_EPSILON = 1e-12;

/**
 * Returns a deterministic structured reading for the nearest axis-aligned
 * obstacle intersected by the robot's forward ray.
 */
export function readFrontDistance(worldState, obstacles) {
  assertWorldState(worldState);
  assertObstacles(obstacles);

  const radians = worldState.heading * (Math.PI / 180);
  const direction = { x: Math.cos(radians), y: Math.sin(radians) };
  let nearestDistance = MAX_SENSOR_RANGE;
  let obstacleDetected = false;

  for (const obstacle of obstacles) {
    const distance = distanceAlongRay(worldState, direction, obstacle);

    if (
      distance !== null
      && distance <= MAX_SENSOR_RANGE
      && (!obstacleDetected || distance < nearestDistance)
    ) {
      nearestDistance = distance;
      obstacleDetected = true;
    }
  }

  return {
    sensor: SENSOR_TYPES.FRONT_DISTANCE,
    value: nearestDistance,
    unit: SENSOR_UNIT,
  };
}

export function sensorReadingEvent(reading, worldState) {
  assertWorldState(worldState);

  if (
    reading === null
    || typeof reading !== 'object'
    || reading.sensor !== SENSOR_TYPES.FRONT_DISTANCE
    || reading.unit !== SENSOR_UNIT
    || !Number.isFinite(reading.value)
    || reading.value < 0
    || reading.value > MAX_SENSOR_RANGE
  ) {
    throw new TypeError('A valid front-distance sensor reading is required');
  }

  return {
    type: 'SENSOR_READ',
    sensor: reading.sensor,
    value: reading.value,
    unit: reading.unit,
    robotPosition: {
      x: worldState.x,
      y: worldState.y,
    },
    heading: worldState.heading,
  };
}

function distanceAlongRay(origin, direction, obstacle) {
  const halfWidth = obstacle.width / 2;
  const halfHeight = obstacle.height / 2;
  const bounds = {
    minX: obstacle.x - halfWidth,
    maxX: obstacle.x + halfWidth,
    minY: obstacle.y - halfHeight,
    maxY: obstacle.y + halfHeight,
  };
  let minimum = -Number.MAX_VALUE;
  let maximum = Number.MAX_VALUE;

  for (const axis of [
    { position: origin.x, direction: direction.x, min: bounds.minX, max: bounds.maxX },
    { position: origin.y, direction: direction.y, min: bounds.minY, max: bounds.maxY },
  ]) {
    if (Math.abs(axis.direction) < PARALLEL_EPSILON) {
      if (axis.position < axis.min || axis.position > axis.max) {
        return null;
      }
      continue;
    }

    const first = (axis.min - axis.position) / axis.direction;
    const second = (axis.max - axis.position) / axis.direction;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));

    if (maximum < minimum) {
      return null;
    }
  }

  if (maximum < 0) {
    return null;
  }

  return Math.max(0, minimum);
}

function assertWorldState(worldState) {
  if (
    worldState === null
    || typeof worldState !== 'object'
    || !Number.isFinite(worldState.x)
    || !Number.isFinite(worldState.y)
    || !Number.isFinite(worldState.heading)
  ) {
    throw new TypeError('WorldState must contain finite x, y, and heading numbers');
  }
}

function assertObstacles(obstacles) {
  if (!Array.isArray(obstacles)) {
    throw new TypeError('Obstacles must be an array');
  }

  for (const obstacle of obstacles) {
    if (
      obstacle === null
      || typeof obstacle !== 'object'
      || typeof obstacle.id !== 'string'
      || !Number.isFinite(obstacle.x)
      || !Number.isFinite(obstacle.y)
      || !Number.isFinite(obstacle.width)
      || !Number.isFinite(obstacle.height)
      || obstacle.width <= 0
      || obstacle.height <= 0
    ) {
      throw new TypeError('Each obstacle must have an id, position, width, and height');
    }
  }
}
