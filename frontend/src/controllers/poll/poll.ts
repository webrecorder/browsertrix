import { Task, TaskStatus, type TaskConfig } from "@lit/task";
import { type ReactiveControllerHost } from "lit";

import {
  pollControllerOptionsSchema,
  type PollControllerInitOptions,
  type PollControllerOptions,
} from "./types";

import { initialVisibilityState } from "@/utils/visibility-state";

const defaultOptions = {
  pauseWhenHidden: true,
  stopPollOnError: true,
} satisfies PollControllerOptions;

/**
 * Poll manager that handles executing, pausing, and resuming polls, as well
 * as rendering polled data.
 *
 * The timer for the next poll starts when the task finishes, not at an exact
 * interval.
 *
 * Because Lit's `Task.render()` will only render one task status at a time,
 * the latest polled value won't be rendered if the task is in progress during
 * the current poll. Use `renderComplete()` instead to always render the most
 * recently polled value, even when the task is pending.
 *
 * See "Polling" story in Storybook for a usage example.
 */
export class PollController<
  const T extends readonly unknown[] = readonly unknown[],
  const R = unknown,
> extends Task<T, R> {
  #options: PollControllerOptions;
  #previousValue?: R;
  #paused?: boolean;

  readonly #pollTask: Task<[TaskStatus], number | undefined>;

  constructor(
    host: ReactiveControllerHost,
    taskConfig: TaskConfig<T, R>,
    options: PollControllerInitOptions,
  ) {
    super(host, {
      ...taskConfig,
      onComplete: (value) => {
        this.#previousValue = value;
        taskConfig.onComplete?.(value);
      },
    });

    this.#options = {
      ...defaultOptions,
      ...options,
    };

    this.#pollTask = new Task(host, {
      task: async ([status]) => {
        const timeoutSeconds = this.#options.timeoutSeconds;
        if (!timeoutSeconds) return;

        if (status === TaskStatus.PENDING) {
          this.clearTimer();
        }

        if (status < TaskStatus.COMPLETE) return;
        if (this.#options.stopPollOnError && status === TaskStatus.ERROR) {
          return;
        }

        return window.setTimeout(() => {
          if (this.#paused) return;
          void this.run();
        }, timeoutSeconds * 1000);
      },
      args: () => [this.status],
    });
  }

  /**
   * Value returned from previously completed task run.
   */
  public get previousValue() {
    return this.#previousValue;
  }

  /**
   * Whether polling is currently paused/stopped.
   */
  public get paused() {
    return this.#paused;
  }

  /**
   * Render most recent task value.
   */
  public renderComplete(renderer: (value: R) => unknown) {
    return this.value !== undefined ? renderer(this.value) : undefined;
  }

  /**
   * Render when task is in progress or has never run.
   * To differentiate between initial run and subsequent runs,
   * check if the `value` exists.
   */
  public renderPending(renderer: (value: R | undefined) => unknown) {
    if (
      this.status === TaskStatus.INITIAL ||
      this.status === TaskStatus.PENDING
    ) {
      return renderer(this.value);
    }
  }

  /**
   * Cancel the poll timer. It's up to the caller to restart the poll.
   */
  public clearTimer(): void {
    window.clearTimeout(this.#pollTask.value);
  }

  /**
   * Render error thrown by task.
   */
  public renderError(renderer: (err: unknown) => unknown) {
    if (this.status === TaskStatus.ERROR) {
      return renderer(this.error);
    }
  }

  /**
   * Stop the poll timer, allowing any active task to finish.
   */
  public pause(): void {
    this.#paused = true;
    this.clearTimer();
  }

  /**
   * Start the poll timer, which will run the task on the next tick.
   */
  public resume(): void {
    if (!this.value) {
      console.debug(
        "cannot resume when there is no task value. did you mean to `start()`?",
      );
    }

    this.#paused = false;
    void this.#pollTask.run();
  }

  /**
   * Immediately stop current task and poll timer.
   */
  async stop() {
    this.pause();
    this.abort();
    return this.taskComplete;
  }

  /**
   * Run current task and start poll timer.
   */
  async start() {
    this.#paused = false;
    void this.run();
    return this.taskComplete;
  }

  hostConnected(): void {
    if (this.#options.pauseWhenHidden) {
      // If the page is open in a background tab or otherwise initially hidden,
      // stop the task and start on the first visibility change.
      if (initialVisibilityState.hidden) {
        void this.stop();

        document.addEventListener(
          "visibilitychange",
          async () => {
            if (!document.hidden) {
              await this.start();
            }

            document.addEventListener(
              "visibilitychange",
              this.handleVisibilityChange,
            );
          },
          { once: true, capture: true },
        );
      } else {
        document.addEventListener(
          "visibilitychange",
          () => {
            if (document.hidden) {
              if (document.hasFocus()) {
                // TODO Check why visibilitychange fires on page reload in Firefox
                console.debug("document is hidden but has focus");
              } else {
                this.pause();
              }
            }

            window.setTimeout(() => {
              document.addEventListener(
                "visibilitychange",
                this.handleVisibilityChange,
              );
            }, 0);
          },
          { once: true, capture: true },
        );
      }
    }
  }

  hostDisconnected(): void {
    this.clearTimer();

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
