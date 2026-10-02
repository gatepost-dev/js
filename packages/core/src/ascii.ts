// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Changes the ASCII letters a to z to upper case, and keeps every other character.
 *
 * @param text - Any text.
 * @returns The text with upper-case ASCII letters.
 * @internal
 */
export function upperAscii(text: string): string {
  return text.replace(/[a-z]/g, (letter) => letter.toUpperCase());
}
