import { ContextConsumer } from "@lit/context";
import { QueryObserver } from "@tanstack/query-core";
import type {
  QueryClient,
  QueryKey,
  QueryObserverOptions,
  QueryObserverResult,
} from "@tanstack/query-core";
import type {
  LitElement,
  ReactiveController,
  ReactiveControllerHost,
} from "lit";

import { QueryContext } from "./context";

/**
 * Temporary Promise.withResolvers type polyfill until Typescript workspace dependency is updated from 5.3.3 to >=5.4
 */
type PromiseWithResolvers = Promise<unknown> & {
  withResolvers: <T>() => {
    resolve: (value: T | PromiseLike<T>) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reject: (reason: any) => void;
    promise: Promise<T>;
  };
};

export type { QueryObserverOptions };

/**
 * QueryController is a class that integrates a query-based data fetching system
 * into a Lit component as a ReactiveController.
 *
 * @template TQueryFnData - The data type returned by the query function.
 * @template TError - The error type for query errors.
 * @template TData - The data type to be used in the component.
 * @template TQueryData - The data type returned by the query (may differ from TData).
 * @template TQueryKey - The query key type.
 */
export class QueryController<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> implements ReactiveController
{
  /**
   * The result of the query observer, containing data and error information.
   */
  result?: QueryObserverResult<TData, TError>;

  /**
   * Consumer of the lit query client context.
   */
  protected context: ContextConsumer<{ __context__: QueryClient }, LitElement>;

  /**
   * Promise that is resolved when the query client is set.
   */
  whenQueryClient = (
    Promise as unknown as PromiseWithResolvers
  ).withResolvers<QueryClient>();

  /**
   * The query client.
   * This can be set manually or using a lit query client context provider.
   */
  set queryClient(queryClient: QueryClient | undefined) {
    this._queryClient = queryClient;
    if (queryClient) {
      this.whenQueryClient.resolve(queryClient);
    }
    this.host.requestUpdate();
  }

  get queryClient() {
    return this._queryClient;
  }

  /**
   * The internal query observer responsible for managing the query.
   */
  protected queryObserver?: QueryObserver<
    TQueryFnData,
    TError,
    TData,
    TQueryData,
    TQueryKey
  >;

  /**
   * Promise that resolves when the query observer is created.
   */
  whenQueryObserver = (
    Promise as unknown as PromiseWithResolvers
  ).withResolvers<
    QueryObserver<TQueryFnData, TError, TData, TQueryData, TQueryKey>
  >();

  /**
   * Creates a new QueryController instance.
   *
   * @param host - The host component to which this controller is added.
   * @param optionsFn - A function that provides QueryObserverOptions for the query.
   * @param _queryClient - Optionally set the query client.
   * @link [QueryObserverOptions API Docs](). //TODO: Add the correct doc
   */
  constructor(
    protected host: ReactiveControllerHost,
    protected optionsFn?: () => QueryObserverOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryData,
      TQueryKey
    >,
    private _queryClient?: QueryClient,
  ) {
    this.host.addController(this);

    // Initialize the context
    this.context = new ContextConsumer(this.host as LitElement, {
      context: QueryContext,
      subscribe: true,
      callback: (value) => {
        if (value) {
          this.queryClient = value;
        }
      },
    });

    // Observe the query if a query function is provided
    if (this.optionsFn) {
      void this.observeQuery(this.optionsFn);
    }
  }

  /**
   * Creates a query observer. The query is subscribed whenever the host is connected to the dom.
   *
   * @param options - Options for the query observer
   * @param optimistic - Get an initial optimistic result. Defaults to true.
   */
  async observeQuery(
    options:
      | QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>
      | (() => QueryObserverOptions<
          TQueryFnData,
          TError,
          TData,
          TQueryData,
          TQueryKey
        >),
    optimistic = true,
  ) {
    const queryClient = await this.whenQueryClient.promise;

    // Initialize the QueryObserver with defaulted options.
    const defaultedOptions = await this.getDefaultedOptions(
      typeof options === "function" ? options() : options,
    );
    this.queryObserver = new QueryObserver(queryClient, defaultedOptions);

    // Get an optimistic result based on the defaulted options.
    if (optimistic) {
      this.result = this.queryObserver.getOptimisticResult(defaultedOptions);
    } else {
      this.result = undefined;
    }

    this.host.requestUpdate();

    this.whenQueryObserver.resolve(this.queryObserver);
  }

  /**
   * Unsubscribe function to remove the observer when the component disconnects.
   */
  protected unsubscribe?: () => void;

  /**
   * Invoked when the host component updates.
   * Updates the query observer options with default options if a query function is set.
   */
  async hostUpdate() {
    if (this.optionsFn) {
      const queryObserver = await this.whenQueryObserver.promise;

      // Update options from the options function
      const defaultedOptions = await this.getDefaultedOptions(this.optionsFn());
      queryObserver.setOptions(defaultedOptions);
    }
  }

  /**
   * Invoked when the host component is connected.
   */
  hostConnected() {
    void this.subscribe();
  }

  /**
   * Subscribes to the query observer and updates the result.
   */
  async subscribe() {
    const queryObserver = await this.whenQueryObserver.promise;

    // Unsubscribe any previous subscription before subscribing
    this.unsubscribe?.();

    this.unsubscribe = queryObserver.subscribe((result: typeof this.result) => {
      this.result = result;
      this.host.requestUpdate();
    });

    queryObserver.updateResult();
    this.host.requestUpdate();
  }

  /**
   * Invoked when the host component is disconnected.
   * Unsubscribes from the query observer to clean up.
   */
  hostDisconnected() {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  /**
   * Retrieves the default query options by combining the user-provided options
   * with the default options from the query client.
   *
   * @returns The default query options.
   */
  protected async getDefaultedOptions(
    options: QueryObserverOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryData,
      TQueryKey
    >,
  ) {
    const queryClient = await this.whenQueryClient.promise;

    return queryClient.defaultQueryOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryData,
      TQueryKey
    >(options);
  }
}
