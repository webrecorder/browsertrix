/**
 * Generic selection delta computation for containers and their items.
 *
 * Model:
 * - Containers hold items. We may not know all item IDs (e.g. pagination),
 *   but we know how many items each container has.
 * - Each container may be "fully selected" (all items selected) or not.
 * - Batch operations can include/exclude entire containers with exceptions.
 * - Individual items can be selected/deselected outside batch ops.
 *
 * The delta tells us how many items are added/removed vs. the original state.
 */

export type Container = {
  id: string;
  itemCount: number;
  /**
   * Total number of items that were selected in the original state,
   * according to the API. This may be larger than the number of item
   * IDs we have loaded into memory (e.g. due to pagination).
   */
  originalSelectedCount: number;
  wasFullySelected: boolean;
};

export type BatchOperation =
  | { kind: "include"; excludedItems: Set<string> }
  | { kind: "exclude"; includedItems: Set<string> };

export type SelectionState = {
  containers: Map<string, Container>;
  itemToContainer: Map<string, string>;
  originalSelectedItems: Set<string>;
  batchOps: Map<string, BatchOperation>;
  selectedItems: Set<string>; // Items selected outside batch ops
  deselectedItems: Set<string>; // Items deselected from included containers
};

export type Delta = {
  additions: number;
  removals: number;
  addedItems: Set<string>;
  removedItems: Set<string>;
  includedContainers: Set<string>;
  excludedContainers: Set<string>;
};

export function computeSelectionDelta(state: SelectionState): Delta {
  const addedItems = new Set<string>();
  const removedItems = new Set<string>();
  const includedContainers = new Set<string>();
  const excludedContainers = new Set<string>();
  let additions = 0;
  let removals = 0;

  // Classify batch operations
  for (const [containerId, op] of state.batchOps) {
    if (op.kind === "include") {
      includedContainers.add(containerId);
    } else {
      excludedContainers.add(containerId);
    }
  }

  // Determine which containers are currently fully selected.
  // This includes:
  // - Containers with batch include ops
  // - Containers that were originally fully selected and not batch excluded
  const currentlyFullySelected = new Set<string>();
  for (const containerId of includedContainers) {
    currentlyFullySelected.add(containerId);
  }
  for (const [containerId, container] of state.containers) {
    if (container.wasFullySelected && !excludedContainers.has(containerId)) {
      currentlyFullySelected.add(containerId);
    }
  }

  // --- Batch includes: items added by including a container ---
  for (const containerId of includedContainers) {
    const container = state.containers.get(containerId);
    if (!container) continue;

    const op = state.batchOps.get(containerId);
    if (!op || op.kind !== "include") continue;

    // Count items that would be added (total - already selected - excluded)
    const alreadySelected = countInContainer(
      state.originalSelectedItems,
      state.itemToContainer,
      containerId,
    );
    const excluded = countInContainer(
      op.excludedItems,
      state.itemToContainer,
      containerId,
    );

    additions += Math.max(0, container.itemCount - alreadySelected - excluded);
  }

  // --- Batch excludes: items removed by excluding a container ---
  for (const containerId of excludedContainers) {
    const container = state.containers.get(containerId);
    if (!container) continue;

    const op = state.batchOps.get(containerId);
    if (!op || op.kind !== "exclude") continue;

    // How many items were originally selected in this container?
    // Use originalSelectedCount which comes from the API and accounts
    // for items we may not have loaded.
    const originallySelected = container.wasFullySelected
      ? container.itemCount
      : container.originalSelectedCount;

    if (op.includedItems.size > 0) {
      // Some items are re-selected (exceptions to the exclusion).
      // Only count exceptions that were originally selected.
      const validExceptions = countInContainer(
        op.includedItems,
        state.itemToContainer,
        containerId,
      );
      removals += Math.max(0, originallySelected - validExceptions);
    } else {
      removals += originallySelected;
    }
  }

  // --- Deselected items from fully selected containers (partial removals) ---
  for (const itemId of state.deselectedItems) {
    const containerId = state.itemToContainer.get(itemId);
    if (!containerId || excludedContainers.has(containerId)) continue;

    // Only count if the container is currently fully selected AND
    // the item was originally selected (otherwise it wasn't "removed")
    if (
      currentlyFullySelected.has(containerId) &&
      state.originalSelectedItems.has(itemId)
    ) {
      removedItems.add(itemId);
    }
  }

  // --- Individual item selections outside batch ops ---
  for (const itemId of state.selectedItems) {
    const containerId = state.itemToContainer.get(itemId);
    // Only count if not part of an include batch op
    if (containerId && includedContainers.has(containerId)) continue;

    if (!state.originalSelectedItems.has(itemId)) {
      addedItems.add(itemId);
    }
  }

  // --- Individual item deselections outside batch ops ---
  for (const itemId of state.originalSelectedItems) {
    const containerId = state.itemToContainer.get(itemId);
    // Skip items in fully selected containers (they're still selected)
    // and excluded containers (handled by batch exclude loop)
    if (
      containerId &&
      (currentlyFullySelected.has(containerId) ||
        excludedContainers.has(containerId))
    )
      continue;

    if (!state.selectedItems.has(itemId)) {
      removedItems.add(itemId);
    }
  }

  additions += addedItems.size;
  removals += removedItems.size;

  return {
    additions,
    removals,
    addedItems,
    removedItems,
    includedContainers,
    excludedContainers,
  };
}

function countInContainer(
  items: Set<string>,
  itemToContainer: Map<string, string>,
  containerId: string,
): number {
  let count = 0;
  for (const itemId of items) {
    if (itemToContainer.get(itemId) === containerId) {
      count++;
    }
  }
  return count;
}
