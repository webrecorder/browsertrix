import { type FetchQueryOptions, type QueryClient } from "@tanstack/query-core";

import { type APIController } from "@/controllers/api";
import { type Collection } from "@/types/collection";

export default class APIResources {
  queryClient: QueryClient;
  apiController: APIController;
  constructor(queryClient: QueryClient, apiController: APIController) {
    this.queryClient = queryClient;
    this.apiController = apiController;
  }

  Collections(): FetchQueryOptions<Collection[]> {
    return {
      queryKey: ["collections"],
      queryFn: async () => this.apiController.fetch("/collections"),
    };
  }
}
