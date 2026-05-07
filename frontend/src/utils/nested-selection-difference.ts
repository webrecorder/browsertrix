export type Container = {
  id: string;
  itemCount: number;
  /**
   * Total number of items that were selected in the original state. This may be
   * larger than the number of item IDs we have loaded into memory (e.g. due to
   * pagination).
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
  /** Items selected outside batch ops */
  selectedItems: Set<string>;
  /** Items deselected from included containers */
  deselectedItems: Set<string>;
};

export type Delta = {
  additions: number;
  removals: number;
  addedItems: Set<string>;
  removedItems: Set<string>;
  includedContainers: Set<string>;
  excludedContainers: Set<string>;
};

/**
 * Selection delta computation for generic containers and their items.
 *
 * Model:
 * - Containers hold items. We may not know all item IDs (e.g. pagination),
 *   but we know how many items each container has.
 * - Each container may be "fully selected" (all items selected) or not.
 * - Batch operations can include/exclude entire containers with exceptions.
 * - Individual items can be selected/deselected outside batch ops.
 *
 * The delta tells us how many items are added/removed vs. the original state.
 *
 * In practical use, containers correspond to Workflows and their items to
 * Crawls, but this should be reusable for any container-item relationship.
 */
export function computeSelectionDelta(state: SelectionState): Delta {
  const addedItems = new Set<string>();
  const removedItems = new Set<string>();
  const includedContainers = new Set<string>();
  const excludedContainers = new Set<string>();
  let additions = 0;
  let removals = 0;

  const selectedCountPerContainer = new Map<string, number>();
  const containerToItems = new Map<string, Set<string>>();
  for (const [itemId, containerId] of state.itemToContainer) {
    if (!containerId) continue;
    let items = containerToItems.get(containerId);
    if (!items) {
      items = new Set<string>();
      containerToItems.set(containerId, items);
    }
    items.add(itemId);
    if (state.originalSelectedItems.has(itemId)) {
      selectedCountPerContainer.set(
        containerId,
        (selectedCountPerContainer.get(containerId) ?? 0) + 1,
      );
    }
  }

  // Process batch operations in a single pass
  for (const [containerId, operation] of state.batchOps) {
    const container = state.containers.get(containerId);
    if (!container) continue;

    if (operation.kind === "include") {
      includedContainers.add(containerId);

      const alreadySelected = selectedCountPerContainer.get(containerId) ?? 0;

      const containerItems = containerToItems.get(containerId);
      const excludedNotSelected = containerItems
        ? containerItems
            .intersection(operation.excludedItems)
            .difference(state.originalSelectedItems).size
        : 0;

      // Only subtract excluded items that are NOT already selected.
      // Items that were already selected and are now excluded are being
      // swapped out (handled as removals via deselectedItems), not simply
      // not-added, so they shouldn't reduce the new item count.
      const totalNewFromBatch = Math.max(
        0,
        container.itemCount - alreadySelected - excludedNotSelected,
      );

      let batchKnownAdded = 0;
      if (containerItems && totalNewFromBatch > 0) {
        for (const itemId of containerItems) {
          if (batchKnownAdded >= totalNewFromBatch) break;
          if (
            !state.originalSelectedItems.has(itemId) &&
            !operation.excludedItems.has(itemId)
          ) {
            addedItems.add(itemId);
            batchKnownAdded++;
          }
        }
      }

      // Numeric additions: only count items whose IDs we don't know
      additions += Math.max(0, totalNewFromBatch - batchKnownAdded);
    } else {
      // Exclusions
      excludedContainers.add(containerId);

      const originallySelected = container.wasFullySelected
        ? container.itemCount
        : container.originalSelectedCount;

      if (operation.includedItems.size > 0) {
        let validExceptions = 0;
        for (const itemId of operation.includedItems) {
          // Don't count an item as removed if it was originally selected in the container
          if (
            state.originalSelectedItems.has(itemId) &&
            state.itemToContainer.get(itemId) === containerId
          ) {
            validExceptions++;
          }
        }
        removals += Math.max(0, originallySelected - validExceptions);
      } else {
        removals += originallySelected;
      }
    }
  }

  // Containers that are currently fully selected:
  // batch-included containers + originally fully selected containers not batch excluded
  const currentlyFullySelected = new Set(includedContainers);
  for (const [containerId, container] of state.containers) {
    if (container.wasFullySelected && !excludedContainers.has(containerId)) {
      currentlyFullySelected.add(containerId);
    }
  }

  // Deselected items from fully selected containers (partial removals)
  for (const itemId of state.deselectedItems.intersection(
    state.originalSelectedItems,
  )) {
    const containerId = state.itemToContainer.get(itemId);
    if (!containerId || excludedContainers.has(containerId)) continue;
    if (currentlyFullySelected.has(containerId)) {
      removedItems.add(itemId);
    }
  }

  // Individual item selections outside batch ops
  for (const itemId of state.selectedItems.difference(
    state.originalSelectedItems,
  )) {
    const containerId = state.itemToContainer.get(itemId);
    if (containerId && includedContainers.has(containerId)) continue;
    addedItems.add(itemId);
  }

  // Individual item deselections outside batch ops
  for (const itemId of state.originalSelectedItems.difference(
    state.selectedItems,
  )) {
    const containerId = state.itemToContainer.get(itemId);
    if (
      containerId &&
      (currentlyFullySelected.has(containerId) ||
        excludedContainers.has(containerId))
    )
      continue;
    removedItems.add(itemId);
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
