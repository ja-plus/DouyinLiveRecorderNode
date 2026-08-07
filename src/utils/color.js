// @ts-check
/**
 * Color utilities for terminal output
 */
export const Color = {
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
  RESET: '\x1b[0m'
};

/** @typedef {(typeof Color)[keyof typeof Color]} ColorCode */

/**
 * @param {string} text
 * @param {ColorCode} color
 */
export function printColored(text, color) {
  console.log(`${color}${text}${Color.RESET}`);
}
