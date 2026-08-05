import { Task, TaskStatus } from "@lit/task";
import {
  type LitElement,
  type ReactiveController,
  type ReactiveControllerHost,
} from "lit";

import {
  pollControllerOptionsSchema,
  type PollControllerOptions,
} from "./types";

import { initialVisibilityState } from "@/utils/visibility-state";

type TaskValue<T = Task> =
  T extends Task<readonly unknown[], infer R> ? R : never;

const defaultOptions = {
  timeoutSeconds: 5,
  pauseWhenHidden: true,
  stopPollOnError: true,
} satisfies PollControllerOptions;

/**
 * Poll manager that handles starting, pausing, and resuming polls, as well as
 * rendering polled data.
 *
 * The timer for the next poll starts when the task finishes, not at an exact
 * interval.
 *
 * Because Lit's `Task.render()` will only render one task status at a time,
 * the latest polled value won't be rendered if the task is in progress during
 * the current poll. Use `renderComplete()` instead to always render the most
 * recently polled value, even when the task is pending.
 *
 * @FIXME The poll controller's render methods create circularity issues when
 * inferring the type of the poll controller instance. As a workaround, the
 * instance can be explicitly typed (despite seeming redundant) as
 * `PollController<typeof this.task>`:
 * ```ts
 * readonly poll: PollController<typeof this.task> = new PollController(this, this.task);
 * ```
 *
 * See "Polling" story in Storybook for a usage example.
 */
export class PollController<T extends Task> implements ReactiveController {
  #options: PollControllerOptions;

  readonly #mainTask: Task;
  readonly #pollTask: Task<[TaskStatus], number | undefined>;

  #paused?: boolean;

  constructor(
    host: ReactiveControllerHost & LitElement,
    task: T,
    options?: PollControllerOptions,
  ) {
    host.addController(this);

    this.#options = {
      ...defaultOptions,
      ...options,
    };
    this.#mainTask = task;

    const pollTask = new Task(host, {
      task: async ([status]) => {
        const timeoutSeconds = this.#options.timeoutSeconds;
        if (!timeoutSeconds) return;
        if (status < TaskStatus.COMPLETE) return;

        window.clearTimeout(pollTask.value);

        if (this.#options.stopPollOnError && status === TaskStatus.ERROR) {
          return;
        }

        return window.setTimeout(() => {
          void this.#mainTask.run();
        }, timeoutSeconds * 1000);
      },
      args: () => [task.status],
    });

    this.#pollTask = pollTask;
  }

  /**
   * Render most recent task value.
   */
  public renderComplete(renderer: (value: TaskValue<T>) => unknown) {
    return this.#mainTask.value !== undefined
      ? renderer(this.#mainTask.value as TaskValue<T>)
      : undefined;
  }

  /**
   * Render when task is in progress or has never run.
   * To differentiate between initial run and subsequent runs,
   * check if the `value` exists.
   */
  public renderPending(renderer: (value: TaskValue<T>) => unknown) {
    if (
      this.#mainTask.status === TaskStatus.INITIAL ||
      this.#mainTask.status === TaskStatus.PENDING
    ) {
      return renderer(this.#mainTask.value as TaskValue<T>);
    }
  }

  /**
   * Render error thrown by task.
   */
  public renderError(renderer: (err: unknown) => unknown) {
    if (this.#mainTask.status === TaskStatus.ERROR) {
      return renderer(this.#mainTask.error);
    }
  }

  /**
   * Stop the poll timer, allowing any active task to finish.
   */
  public pause(): void {
    window.clearTimeout(this.#pollTask.value);

    this.#paused = true;
  }

  /**
   * Start the poll timer, which will run the task on the next tick.
   */
  public resume(): void {
    if (!this.#mainTask.value) {
      console.debug(
        "cannot resume when there is no task value. did you mean to `start()`?",
      );
    }
    void this.#pollTask.run();

    this.#paused = false;
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

    this.#paused = false;

    return this.#mainTask.taskComplete;
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
