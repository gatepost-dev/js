// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import type { Outcome } from './state.js';

/**
 * The three values that identify a lookup: the postcode, the level and the key.
 *
 * @internal
 */
export interface Asked {
  readonly code: string;
  readonly level: 1 | 2;
  readonly key: string;
}

function sameAsked(left: Asked | null, right: Asked | null): boolean {
  return (
    left !== null &&
    right !== null &&
    left.code === right.code &&
    left.level === right.level &&
    left.key === right.key
  );
}

/**
 * What the field remembers of its requests: the one in progress, the last lookup that the
 * gateway answered, and the outcome that shows. It holds the rules of `spec/field.md` for when a
 * change keeps a request and when it cancels one, and it never renders or sends anything.
 *
 * @internal
 */
export class Requests {
  /** The outcome that shows until the text or a setting changes, or null. */
  outcome: Outcome | null = null;
  /** The lookup in progress, or null. */
  asked: Asked | null = null;
  /** The last lookup that the gateway answered, or null. */
  remembered: Asked | null = null;
  #work: AbortController | null = null;

  /**
   * Decides what a change of the text or of a setting does to the requests. A lookup that
   * matches the one in progress or the remembered one stays. A location request and its
   * outcome last until the text changes. Any other change cancels the request in progress and
   * forgets the outcome.
   *
   * @param wanted - The lookup that the text and the settings call for, or null.
   * @param textChanged - True when the text differs from the text of the last change.
   * @returns True when it cancelled the requests, so the caller can start the wanted lookup.
   *   False when the requests stay.
   */
  cancelUnlessKept(wanted: Asked | null, textChanged: boolean): boolean {
    if (!textChanged && this.#locationOutcome()) {
      return false;
    }
    if (sameAsked(wanted, this.asked) || sameAsked(wanted, this.remembered)) {
      return false;
    }
    this.cancel();
    return true;
  }

  /** Cancels the request in progress and forgets the remembered lookup and the outcome. */
  cancel(): void {
    this.#work?.abort();
    this.#work = null;
    this.asked = null;
    this.remembered = null;
    this.outcome = null;
  }

  /**
   * Starts a request, and cancels the one in progress.
   *
   * @param outcome - What shows while the request runs.
   * @returns The controller that cancels the new request.
   */
  start(outcome: Outcome): AbortController {
    this.#work?.abort();
    const work = new AbortController();
    this.#work = work;
    this.outcome = outcome;
    return work;
  }

  /**
   * Starts a location request. It cancels the request in progress, and forgets the lookup in
   * progress and the remembered lookup, so a later change never matches them.
   *
   * @param outcome - What shows while the request runs.
   * @returns The controller that cancels the new request.
   */
  startLocation(outcome: Outcome): AbortController {
    const work = this.start(outcome);
    this.asked = null;
    this.remembered = null;
    return work;
  }

  /** Ends the request in progress, with no outcome. The remembered lookup stays. */
  end(): void {
    this.#work = null;
    this.asked = null;
    this.outcome = null;
  }

  /**
   * Ends the request in progress with an outcome.
   *
   * @param outcome - What shows until the text or a setting changes.
   */
  finish(outcome: Outcome): void {
    this.end();
    this.outcome = outcome;
  }

  // True while a location request is in progress, and after it, until the text changes.
  #locationOutcome(): boolean {
    const state = this.outcome?.state;
    return state === 'locating' || state === 'coarse' || state === 'no-location';
  }
}
