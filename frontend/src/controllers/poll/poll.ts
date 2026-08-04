import { Task, TaskStatus } from "@lit/task";
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
  pauseWhenHidden: true,
} satisfies PollControllerOptions;

/**
 * Poll manager that handles starting, pausing, and resuming polls, as well as
 * rendering polled data.
 *
 * Because Lit's `Task.render()` will only render one task status at a time,
 * the latest polled value won't be rendered if the task is in progress during
 * the current poll. Use `PollController.renderComplete` instead to always
 * render the most recently polled value, even when the task is pending.
 */
export class PollController<T> implements ReactiveController {
  readonly #host: ReactiveControllerHost & LitElement;

  #options: PollControllerOptions;

  readonly #mainTask: PollControllerInitOptions<T>["task"];
  readonly #pollTask: Task<readonly [T], number | undefined>;

  constructor(
    host: ReactiveControllerHost & LitElement,
    options: PollControllerInitOptions<T>,
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
      task: async ([value]) => {
        const timeoutSeconds = this.#options.timeoutSeconds;

        if (!value || !timeoutSeconds) return;

        if (this.#pollTask.value) {
          window.clearTimeout(pollTask.value);
        }

        return window.setTimeout(() => {
          void this.#mainTask.run();
        }, timeoutSeconds * 1000);
      },
      args: () => [this.#mainTask.value],
    });

    this.#pollTask = pollTask;
  }

  /**
   * Render most recent task value.
   */
  renderComplete(renderer: (value: T) => unknown) {
    return this.#mainTask.value !== undefined
      ? renderer(this.#mainTask.value)
      : undefined;
  }

  /**
   * Render when task is in progress or has never run.
   * To differentiate between initial run and subsequent runs,
   * check if the `value` exists.
   */
  renderPending(renderer: (value: T | undefined) => unknown) {
    if (
      this.#mainTask.status === TaskStatus.INITIAL ||
      this.#mainTask.status === TaskStatus.PENDING
    ) {
      return renderer(this.#mainTask.value);
    }
  }

  /**
   * Render error thrown by task.
   */
  renderError(renderer: (err: unknown) => unknown) {
    if (this.#mainTask.status === TaskStatus.ERROR) {
      return renderer(this.#mainTask.error);
    }
  }

  /**
   * Stop the poll timer, allowing any active task to finish.
   */
  pause(): void {
    window.clearTimeout(this.#pollTask.value);
  }

  /**
   * Start the poll timer, which will run the task on the next tick.
   */
  resume(): void {
    if (!this.#mainTask.value) {
      console.debug(
        "cannot resume when there is no task value. did you mean to `start()`?",
      );
    }
    void this.#pollTask.run();
  }

  /**
   * Immediately stop current task and poll timer.
   */
  async stop() {
    this.pause();
    this.#mainTask.abort();
    return this.#mainTask.taskComplete;
  }

  /**
   * Run current task and start poll timer.
   */
  async start() {
    await this.#mainTask.run();
    return this.#mainTask.taskComplete;
  }

  hostConnected(): void {
    if (this.#options.pauseWhenHidden) {
      document.addEventListener(
        "visibilitychange",
        this.handleVisibilityChange,
      );
    }
  }

  hostDisconnected(): void {
    window.clearTimeout(this.#pollTask.value);

    if (this.#options.pauseWhenHidden) {
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

  private readonly handleVisibilityChange = () => {
    if (document.hidden) {
      this.pause();
    } else {
      this.resume();
    }
  };
}
