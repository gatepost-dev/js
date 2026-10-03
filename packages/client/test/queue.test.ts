// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// The queue: the order of its tasks, and the place that a cancelled task gives back (T-5).
import { describe, expect, it } from 'vitest';
import { createQueue } from '../src/queue.js';

interface Gate {
  readonly task: () => Promise<void>;
  readonly open: () => void;
}

// A task that starts at once, and ends only when its gate opens.
function gated(started: string[], name: string): Gate {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    task: async () => {
      started.push(name);
      await opened;
    },
    open,
  };
}

const NEVER = new AbortController().signal;

describe('createQueue', () => {
  it('starts the tasks in the order of their calls, with at most the limit at a time', async () => {
    const started: string[] = [];
    const queue = createQueue(2);
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    const gates = names.map((name) => gated(started, name));
    const calls = gates.map((gate) => queue(gate.task, NEVER));
    await Promise.resolve();
    expect(started).toEqual(['a', 'b']);
    for (const gate of gates) {
      gate.open();
      await Promise.resolve();
    }
    await Promise.all(calls);
    expect(started).toEqual(names);
  });

  it('gives the place of a task that left to the next task in line', async () => {
    const started: string[] = [];
    const queue = createQueue(1);
    const first = gated(started, 'first');
    const leaving = gated(started, 'leaving');
    const staying = gated(started, 'staying');
    const controller = new AbortController();
    const calls = [
      queue(first.task, NEVER),
      queue(leaving.task, controller.signal),
      queue(staying.task, NEVER),
    ];
    controller.abort(new Error('left'));
    await expect(calls[1]).rejects.toThrow('left');
    first.open();
    await calls[0];
    await Promise.resolve();
    expect(started).toEqual(['first', 'staying']);
    staying.open();
    await calls[2];
    const after = gated(started, 'after');
    after.open();
    await queue(after.task, NEVER);
    expect(started).toEqual(['first', 'staying', 'after']);
  });
});
