import { provide } from "@lit/context";
import { QueryCache, QueryClient } from "@tanstack/query-core";
import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

import { QueryContext } from "./context";

/**
 * Definition for the properties provided by the query client mixin class.
 */
export interface QueryContextProps {
  /**
   * Tanstack Query Client
   */
  queryClient: QueryClient;
}

/**
 * Generic constructor definition
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Constructor<T = object> = new (...args: any[]) => T;

const queryCache = new QueryCache({
  onError: (error) => {
    console.log("query cache", error);
  },
  onSuccess: (data) => {
    console.log("query cache", data);
  },
  onSettled: (data, error) => {
    console.log("query cache", data, error);
  },
});

/**
 * Query Client Context as mixin class.
 * Extend this mixin class to make any LitElement class a context provider.
 *
 * @param Base - The base class to extend. Must be or inherit LitElement.
 * @returns Class extended with query client context provider property.
 */
export const QueryClientMixin = <T extends Constructor<LitElement>>(
  Base: T,
) => {
  class QueryClientContextProvider extends Base implements QueryContextProps {
    /**
     * The query client provided as a context.
     * May be overridden to set a custom configuration.
     */
    @provide({ context: QueryContext })
    @state()
    queryClient = new QueryClient({
      queryCache,
      defaultOptions: { queries: { staleTime: Infinity } },
    });

    connectedCallback(): void {
      super.connectedCallback();
      this.queryClient.mount();
    }

    disconnectedCallback(): void {
      super.disconnectedCallback();
      this.queryClient.unmount();
    }
  }

  // Cast return type to the mixin's interface intersected with the Base type
  return QueryClientContextProvider as Constructor<QueryContextProps> & T;
};

/**
 * Query client context provided as a Custom Component.
 * Place any components that should use the query client context as children.
 */
@customElement("query-client-provider")
export class QueryClientProvider extends QueryClientMixin(LitElement) {
  render() {
    return html`<slot></slot>`;
  }
}
