import { BLOCK_TYPES } from './blockly-program.js?v=m8-vector-contract';

export const ROBOT_TOOLBOX = Object.freeze({
  kind: 'flyoutToolbox',
  contents: [
    { kind: 'block', type: BLOCK_TYPES.WHEN_START },
    { kind: 'block', type: BLOCK_TYPES.MOVE_FORWARD },
    { kind: 'block', type: BLOCK_TYPES.TURN_LEFT },
    { kind: 'block', type: BLOCK_TYPES.TURN_RIGHT },
    { kind: 'block', type: BLOCK_TYPES.SET_SPEED },
    { kind: 'block', type: BLOCK_TYPES.SET_HEADING },
    { kind: 'block', type: BLOCK_TYPES.MOVE_FOR_TIME },
    { kind: 'block', type: BLOCK_TYPES.REPEAT },
    { kind: 'block', type: BLOCK_TYPES.IF_ELSE },
    { kind: 'block', type: BLOCK_TYPES.FRONT_DISTANCE },
    {
      kind: 'block',
      type: BLOCK_TYPES.LOGIC_COMPARE,
      fields: { OP: 'LT' },
    },
    {
      kind: 'block',
      type: BLOCK_TYPES.NUMBER,
      fields: { NUM: 50 },
    },
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
            type: BLOCK_TYPES.SET_SPEED,
            fields: { SPEED: 40 },
            next: {
              block: {
                type: BLOCK_TYPES.SET_HEADING,
                fields: { HEADING: 26.5650511771 },
                next: {
                  block: {
                    type: BLOCK_TYPES.MOVE_FOR_TIME,
                    fields: { DURATION: 5.59016994375 },
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
    {
      type: BLOCK_TYPES.SET_SPEED,
      message0: 'set speed %1 units/s',
      args0: [
        {
          type: 'field_number',
          name: 'SPEED',
          value: 20,
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 285,
      tooltip: 'Set the speed used by physics motion blocks.',
    },
    {
      type: BLOCK_TYPES.MOVE_FOR_TIME,
      message0: 'move for %1 seconds',
      args0: [
        {
          type: 'field_number',
          name: 'DURATION',
          value: 5,
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 285,
      tooltip: 'Move using distance = speed × time.',
    },
    {
      type: BLOCK_TYPES.SET_HEADING,
      message0: 'set heading %1°',
      args0: [
        {
          type: 'field_number',
          name: 'HEADING',
          value: 0,
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 330,
      tooltip: 'Set a direction through the existing robot turn action.',
    },
    {
      type: BLOCK_TYPES.REPEAT,
      message0: 'repeat %1 times',
      args0: [
        {
          type: 'field_number',
          name: 'COUNT',
          value: 4,
        },
      ],
      message1: 'do %1',
      args1: [
        {
          type: 'input_statement',
          name: 'BODY',
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 120,
      tooltip: 'Repeat the enclosed commands a finite number of times.',
    },
    {
      type: BLOCK_TYPES.FRONT_DISTANCE,
      message0: 'front distance',
      output: 'Number',
      colour: 265,
      tooltip: 'Read the distance to the obstacle directly in front of the robot.',
    },
    {
      type: BLOCK_TYPES.IF_ELSE,
      message0: 'if %1',
      args0: [
        {
          type: 'input_value',
          name: 'CONDITION',
          check: 'Boolean',
        },
      ],
      message1: 'do %1',
      args1: [
        {
          type: 'input_statement',
          name: 'DO',
        },
      ],
      message2: 'else %1',
      args2: [
        {
          type: 'input_statement',
          name: 'ELSE',
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 210,
      tooltip: 'Run only the branch selected by the condition.',
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
