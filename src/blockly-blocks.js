import { BLOCK_TYPES } from './blockly-program.js';

export const ROBOT_TOOLBOX = Object.freeze({
  kind: 'flyoutToolbox',
  contents: [
    { kind: 'block', type: BLOCK_TYPES.WHEN_START },
    { kind: 'block', type: BLOCK_TYPES.MOVE_FORWARD },
    { kind: 'block', type: BLOCK_TYPES.TURN_LEFT },
    { kind: 'block', type: BLOCK_TYPES.TURN_RIGHT },
  ],
});

export const ACCEPTANCE_PROGRAM = Object.freeze({
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: BLOCK_TYPES.WHEN_START,
        x: 40,
        y: 35,
        next: {
          block: {
            type: BLOCK_TYPES.MOVE_FORWARD,
            fields: { DISTANCE: 25 },
            next: {
              block: {
                type: BLOCK_TYPES.TURN_LEFT,
                fields: { ANGLE: 15 },
                next: {
                  block: {
                    type: BLOCK_TYPES.MOVE_FORWARD,
                    fields: { DISTANCE: 25 },
                  },
                },
              },
            },
          },
        },
      },
    ],
  },
});

export function registerRobotBlocks(Blockly) {
  Blockly.defineBlocksWithJsonArray([
    {
      type: BLOCK_TYPES.WHEN_START,
      message0: 'when start',
      nextStatement: null,
      colour: 215,
      hat: 'cap',
      tooltip: 'Run the connected robot commands.',
    },
    {
      type: BLOCK_TYPES.MOVE_FORWARD,
      message0: 'move forward %1',
      args0: [
        {
          type: 'field_number',
          name: 'DISTANCE',
          value: 25,
          min: 0,
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 155,
      tooltip: 'Move forward by the entered distance.',
    },
    {
      type: BLOCK_TYPES.TURN_LEFT,
      message0: 'turn left %1°',
      args0: [
        {
          type: 'field_number',
          name: 'ANGLE',
          value: 15,
          min: 0,
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 45,
      tooltip: 'Turn counter-clockwise by the entered angle.',
    },
    {
      type: BLOCK_TYPES.TURN_RIGHT,
      message0: 'turn right %1°',
      args0: [
        {
          type: 'field_number',
          name: 'ANGLE',
          value: 15,
          min: 0,
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 15,
      tooltip: 'Turn clockwise by the entered angle.',
    },
  ]);
}

export function createBlocklyWorkspace(Blockly, element) {
  registerRobotBlocks(Blockly);

  const workspace = Blockly.inject(element, {
    toolbox: ROBOT_TOOLBOX,
    trashcan: true,
    move: {
      scrollbars: true,
      drag: true,
      wheel: true,
    },
    zoom: {
      controls: true,
      wheel: true,
      startScale: 0.9,
      maxScale: 1.4,
      minScale: 0.6,
      scaleSpeed: 1.1,
    },
  });

  Blockly.serialization.workspaces.load(ACCEPTANCE_PROGRAM, workspace);
  return workspace;
}
