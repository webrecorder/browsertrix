import { Task } from "@lit/task";
import {
  type LitElement,
  type ReactiveController,
  type ReactiveControllerHost,
} from "lit";

import {
  pollControllerOptionsSchema,
  type PollControllerInitOptions,
  type PollControllerOptions,
} from "./types";

const defaultOptions = {
  timeoutSeconds: 5,
  pauseInBackground: true,
} satisfies PollControllerOptions;

/**
 * Poll manager that handles starting, pausing, and resuming polls.
 */
export class PollController implements ReactiveController {
  readonly #host: ReactiveControllerHost & LitElement;

  #options: PollControllerOptions;

  readonly #mainTask: Task;
  readonly #pollTask: Task<[unknown, number | undefined], number | undefined>;

  constructor(
    host: ReactiveControllerHost & LitElement,
    options: PollControllerInitOptions,
  ) {
    this.#host = host;
    host.addController(this);

    const { task, ...opts } = options;

    this.#options = {
      ...defaultOptions,
      ...opts,
    };
    this.#mainTask = task;

    const pollTask = new Task(this.#host, {
      task: async ([value, timeoutSeconds]) => {
        if (!value || !timeoutSeconds) return;

        if (this.#pollTask.value) {
          window.clearTimeout(pollTask.value);
        }

        return window.setTimeout(() => {
          void this.#mainTask.run();
        }, timeoutSeconds * 1000);
      },
      args: () => [this.#mainTask.value, this.#options.timeoutSeconds],
    });

    this.#pollTask = pollTask;
  }

  hostConnected(): void {
    if (this.#options.pauseInBackground) {
      document.addEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
    }
  }

  hostDisconnected(): void {
    window.clearTimeout(this.#pollTask.value);

    if (this.#options.pauseInBackground) {
      document.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
    }
  }

  setOptions(opts: Partial<PollControllerOptions>) {
    const { error } = pollControllerOptionsSchema.safeParse(opts);

    if (error) {
      console.error(error);
    } else {
      this.#options = {
        ...this.#options,
        ...opts,
      };
    }
  }

  pause() {
    window.clearTimeout(this.#pollTask.value);
  }

  resume() {
    void this.#mainTask.run();
  }

  stop() {
    this.#mainTask.abort();
    window.clearTimeout(this.#pollTask.value);
  }

  private readonly handleVisibilityChange = () => {
    if (document.hidden) {
      this.pause();
    } else {
      this.resume();
    }
  };
}
