import { expect } from "@open-wc/testing";

import { computeSelectionDelta } from "./nested-selection-difference";

describe("computeSelectionDelta", () => {
  // Helper to create a basic state
  const createState = (
    overrides: {
      containers?: Map<
        string,
        {
          id: string;
          itemCount: number;
          originalSelectedCount: number;
          wasFullySelected: boolean;
        }
      >;
      itemToContainer?: Map<string, string>;
      originalSelectedItems?: Set<string>;
      batchOps?: Map<
        string,
        | { kind: "include"; excludedItems: Set<string> }
        | { kind: "exclude"; includedItems: Set<string> }
      >;
      selectedItems?: Set<string>;
      deselectedItems?: Set<string>;
    } = {},
  ) => ({
    containers: overrides.containers ?? new Map(),
    itemToContainer: overrides.itemToContainer ?? new Map(),
    originalSelectedItems: overrides.originalSelectedItems ?? new Set(),
    batchOps: overrides.batchOps ?? new Map(),
    selectedItems: overrides.selectedItems ?? new Set(),
    deselectedItems: overrides.deselectedItems ?? new Set(),
  });

  it("returns zero delta for empty state", () => {
    const delta = computeSelectionDelta(createState());
    expect(delta.additions).to.equal(0);
    expect(delta.removals).to.equal(0);
    expect(delta.addedItems.size).to.equal(0);
    expect(delta.removedItems.size).to.equal(0);
  });

  describe("batch include (select all)", () => {
    it("adds all items when including a previously unselected container", () => {
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 5,
                originalSelectedCount: 0,
                wasFullySelected: false,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
            ["c3", "wf1"],
            ["c4", "wf1"],
            ["c5", "wf1"],
          ]),
          batchOps: new Map([
            ["wf1", { kind: "include" as const, excludedItems: new Set() }],
          ]),
        }),
      );
      expect(delta.additions).to.equal(5);
      expect(delta.removals).to.equal(0);
      expect(delta.includedContainers.has("wf1")).to.be.true;
    });

    it("adds all except excluded items", () => {
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 5,
                originalSelectedCount: 0,
                wasFullySelected: false,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
            ["c3", "wf1"],
            ["c4", "wf1"],
            ["c5", "wf1"],
          ]),
          batchOps: new Map([
            [
              "wf1",
              {
                kind: "include" as const,
                excludedItems: new Set(["c2", "c4"]),
              },
            ],
          ]),
          deselectedItems: new Set(["c2", "c4"]),
        }),
      );
      expect(delta.additions).to.equal(3);
      expect(delta.removals).to.equal(0);
    });

    it("does not double-count already-selected items", () => {
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 5,
                originalSelectedCount: 2,
                wasFullySelected: false,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
            ["c3", "wf1"],
            ["c4", "wf1"],
            ["c5", "wf1"],
          ]),
          originalSelectedItems: new Set(["c1", "c3"]),
          batchOps: new Map([
            ["wf1", { kind: "include" as const, excludedItems: new Set() }],
          ]),
        }),
      );
      expect(delta.additions).to.equal(3); // 5 total - 2 already selected
      expect(delta.removals).to.equal(0);
    });

    it("tracks deselected items as individual removes when workflow stays selected", () => {
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 5,
                originalSelectedCount: 5,
                wasFullySelected: true,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
            ["c3", "wf1"],
            ["c4", "wf1"],
            ["c5", "wf1"],
          ]),
          originalSelectedItems: new Set(["c1", "c2", "c3", "c4", "c5"]),
          batchOps: new Map([
            [
              "wf1",
              { kind: "include" as const, excludedItems: new Set(["c2"]) },
            ],
          ]),
          deselectedItems: new Set(["c2"]),
        }),
      );
      // 5 total - 1 excluded = 4 batch-added, but all 5 were already selected
      // So batch adds 0, but c2 is individually removed
      expect(delta.additions).to.equal(0);
      expect(delta.removals).to.equal(1);
      expect(delta.removedItems.has("c2")).to.be.true;
    });
  });

  describe("batch exclude (deselect all)", () => {
    it("removes all items when excluding a fully selected container", () => {
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 5,
                originalSelectedCount: 5,
                wasFullySelected: true,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
            ["c3", "wf1"],
            ["c4", "wf1"],
            ["c5", "wf1"],
          ]),
          originalSelectedItems: new Set(["c1", "c2", "c3", "c4", "c5"]),
          batchOps: new Map([
            ["wf1", { kind: "exclude" as const, includedItems: new Set() }],
          ]),
        }),
      );
      expect(delta.additions).to.equal(0);
      expect(delta.removals).to.equal(5);
      expect(delta.excludedContainers.has("wf1")).to.be.true;
    });

    it("removes all except re-included items", () => {
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 5,
                originalSelectedCount: 5,
                wasFullySelected: true,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
            ["c3", "wf1"],
            ["c4", "wf1"],
            ["c5", "wf1"],
          ]),
          originalSelectedItems: new Set(["c1", "c2", "c3", "c4", "c5"]),
          batchOps: new Map([
            [
              "wf1",
              {
                kind: "exclude" as const,
                includedItems: new Set(["c2", "c4"]),
              },
            ],
          ]),
          selectedItems: new Set(["c2", "c4"]),
        }),
      );
      expect(delta.additions).to.equal(0);
      expect(delta.removals).to.equal(3); // 5 - 2 re-included
    });

    it("removes only saved items from partially selected container", () => {
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 5,
                originalSelectedCount: 2,
                wasFullySelected: false,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
            ["c3", "wf1"],
            ["c4", "wf1"],
            ["c5", "wf1"],
          ]),
          originalSelectedItems: new Set(["c1", "c3"]),
          batchOps: new Map([
            ["wf1", { kind: "exclude" as const, includedItems: new Set() }],
          ]),
        }),
      );
      expect(delta.additions).to.equal(0);
      expect(delta.removals).to.equal(2); // Only c1 and c3 were saved
    });
  });

  describe("individual item changes", () => {
    it("tracks individual item additions", () => {
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 5,
                originalSelectedCount: 0,
                wasFullySelected: false,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
          ]),
          selectedItems: new Set(["c1", "c2"]),
        }),
      );
      expect(delta.additions).to.equal(2);
      expect(delta.addedItems.has("c1")).to.be.true;
      expect(delta.addedItems.has("c2")).to.be.true;
    });

    it("tracks individual item removals", () => {
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 5,
                originalSelectedCount: 0,
                wasFullySelected: false,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
          ]),
          originalSelectedItems: new Set(["c1", "c2"]),
        }),
      );
      expect(delta.removals).to.equal(2);
      expect(delta.removedItems.has("c1")).to.be.true;
      expect(delta.removedItems.has("c2")).to.be.true;
    });

    it("does not count items in batch containers as individual adds", () => {
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 5,
                originalSelectedCount: 0,
                wasFullySelected: false,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
          ]),
          originalSelectedItems: new Set(["c1"]),
          batchOps: new Map([
            ["wf1", { kind: "include" as const, excludedItems: new Set() }],
          ]),
          selectedItems: new Set(["c2"]),
        }),
      );
      // c2 is newly selected via batch include and tracked in addedItems
      expect(delta.additions).to.equal(4); // 5 total - 1 already saved
      expect(delta.addedItems.has("c2")).to.be.true;
    });
  });

  describe("edge cases and state transitions", () => {
    it("returns no changes when re-selecting a deselected fully-selected workflow", () => {
      // Original: wf1 fully selected with 5 items
      // Action: deselect wf1, then re-select it
      // Expected: no changes
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 5,
                originalSelectedCount: 5,
                wasFullySelected: true,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
            ["c3", "wf1"],
            ["c4", "wf1"],
            ["c5", "wf1"],
          ]),
          originalSelectedItems: new Set(["c1", "c2", "c3", "c4", "c5"]),
          // Batch remove then re-added - should cancel out
          batchOps: new Map(),
        }),
      );
      expect(delta.additions).to.equal(0);
      expect(delta.removals).to.equal(0);
    });

    it("tracks partial deselections from fully selected workflow", () => {
      // Original: wf1 fully selected with 5 items
      // Action: deselect c2 and c4
      // Expected: removing 2 items
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 5,
                originalSelectedCount: 5,
                wasFullySelected: true,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
            ["c3", "wf1"],
            ["c4", "wf1"],
            ["c5", "wf1"],
          ]),
          originalSelectedItems: new Set(["c1", "c2", "c3", "c4", "c5"]),
          batchOps: new Map([
            [
              "wf1",
              {
                kind: "include" as const,
                excludedItems: new Set(["c2", "c4"]),
              },
            ],
          ]),
          deselectedItems: new Set(["c2", "c4"]),
        }),
      );
      expect(delta.additions).to.equal(0);
      expect(delta.removals).to.equal(2);
      expect(delta.removedItems.has("c2")).to.be.true;
      expect(delta.removedItems.has("c4")).to.be.true;
    });

    it("handles multiple containers with mixed operations", () => {
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 3,
                originalSelectedCount: 0,
                wasFullySelected: false,
              },
            ],
            [
              "wf2",
              {
                id: "wf2",
                itemCount: 4,
                originalSelectedCount: 4,
                wasFullySelected: true,
              },
            ],
            [
              "wf3",
              {
                id: "wf3",
                itemCount: 2,
                originalSelectedCount: 0,
                wasFullySelected: false,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["a1", "wf1"],
            ["a2", "wf1"],
            ["a3", "wf1"],
            ["b1", "wf2"],
            ["b2", "wf2"],
            ["b3", "wf2"],
            ["b4", "wf2"],
            ["c1", "wf3"],
            ["c2", "wf3"],
          ]),
          originalSelectedItems: new Set(["b1", "b2", "b3", "b4", "c1"]),
          batchOps: new Map([
            ["wf1", { kind: "include" as const, excludedItems: new Set() }],
            [
              "wf2",
              { kind: "exclude" as const, includedItems: new Set(["b2"]) },
            ],
          ]),
          selectedItems: new Set(["b2", "c1"]),
        }),
      );
      // wf1: +3 items (was empty, now included)
      // wf2: -3 items (was 4, keeping b2, removing b1/b3/b4)
      // wf3: c1 was selected, c2 not selected - no batch op, so c1 not removed (still in originalSelected)
      expect(delta.additions).to.equal(3);
      expect(delta.removals).to.equal(3);
      expect(delta.includedContainers.has("wf1")).to.be.true;
      expect(delta.excludedContainers.has("wf2")).to.be.true;
    });

    it("uses originalSelectedCount when we don't know all item IDs", () => {
      // Container has 1000 items but we only loaded 10 item IDs
      // Original state: 500 items selected (partially selected container)
      // Action: batch exclude the container
      // Expected: 500 removals (using originalSelectedCount, not counting IDs)
      const itemToContainer = new Map<string, string>();
      // Only load 10 item IDs
      for (let i = 0; i < 10; i++) {
        itemToContainer.set(`c${i}`, "wf1");
      }

      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 1000,
                originalSelectedCount: 500,
                wasFullySelected: false,
              },
            ],
          ]),
          itemToContainer,
          originalSelectedItems: new Set(["c0", "c1", "c2", "c3", "c4"]),
          batchOps: new Map([
            ["wf1", { kind: "exclude" as const, includedItems: new Set() }],
          ]),
        }),
      );
      expect(delta.removals).to.equal(500);
      expect(delta.additions).to.equal(0);
    });

    it("uses originalSelectedCount with exceptions for unknown items", () => {
      // Container has 1000 items, 500 originally selected
      // We only know 10 item IDs
      // Action: exclude container but keep 2 items
      // Expected: 498 removals (500 - 2 known exceptions that were selected)
      const itemToContainer = new Map<string, string>();
      for (let i = 0; i < 10; i++) {
        itemToContainer.set(`c${i}`, "wf1");
      }

      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 1000,
                originalSelectedCount: 500,
                wasFullySelected: false,
              },
            ],
          ]),
          itemToContainer,
          originalSelectedItems: new Set(["c0", "c1", "c2", "c3", "c4"]),
          batchOps: new Map([
            [
              "wf1",
              {
                kind: "exclude" as const,
                includedItems: new Set(["c0", "c1"]),
              },
            ],
          ]),
          selectedItems: new Set(["c0", "c1"]),
        }),
      );
      // 500 originally selected - 2 valid exceptions (c0, c1 were in originalSelectedItems)
      expect(delta.removals).to.equal(498);
      expect(delta.additions).to.equal(0);
    });

    it("handles items without containers (uploads)", () => {
      const delta = computeSelectionDelta(
        createState({
          containers: new Map(),
          itemToContainer: new Map([
            ["u1", ""],
            ["u2", ""],
          ]),
          originalSelectedItems: new Set(["u1"]),
          selectedItems: new Set(["u1", "u2"]),
        }),
      );
      expect(delta.additions).to.equal(1);
      expect(delta.addedItems.has("u2")).to.be.true;
      expect(delta.removals).to.equal(0);
    });

    it("never returns negative counts", () => {
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 5,
                originalSelectedCount: 5,
                wasFullySelected: true,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
          ]),
          originalSelectedItems: new Set(["c1", "c2"]),
          batchOps: new Map([
            [
              "wf1",
              {
                kind: "exclude" as const,
                includedItems: new Set(["c1", "c2", "c3"]),
              },
            ],
          ]),
        }),
      );
      expect(delta.additions).to.be.at.least(0);
      expect(delta.removals).to.be.at.least(0);
    });

    it("correctly counts when exceptions exceed saved items in exclude", () => {
      // Original: 2 items saved
      // Exclude with 3 exceptions (more than saved)
      // Should not go negative
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 5,
                originalSelectedCount: 0,
                wasFullySelected: false,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
            ["c3", "wf1"],
            ["c4", "wf1"],
            ["c5", "wf1"],
          ]),
          originalSelectedItems: new Set(["c1", "c2"]),
          batchOps: new Map([
            [
              "wf1",
              {
                kind: "exclude" as const,
                includedItems: new Set(["c1", "c2", "c3"]),
              },
            ],
          ]),
        }),
      );
      // Only c1 and c2 were saved, and both are in exceptions
      // So 0 items are actually removed
      expect(delta.removals).to.equal(0);
    });

    it("excludes non-originally-selected exception items from removal deduction", () => {
      // Original: c1, c2 saved (2 items originally selected)
      // Exclude with exceptions [c1, c3] — c3 was NOT originally selected
      // c3 is counted as an individual addition (newly selected via exception).
      // Only c2 should be counted as removed.
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 5,
                originalSelectedCount: 2,
                wasFullySelected: false,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
            ["c3", "wf1"],
            ["c4", "wf1"],
            ["c5", "wf1"],
          ]),
          originalSelectedItems: new Set(["c1", "c2"]),
          batchOps: new Map([
            [
              "wf1",
              {
                kind: "exclude" as const,
                includedItems: new Set(["c1", "c3"]),
              },
            ],
          ]),
          selectedItems: new Set(["c1", "c3"]),
        }),
      );
      expect(delta.removals).to.equal(1); // c2 removed
      expect(delta.additions).to.equal(1); // c3 added via individual selection
    });

    it("tracks items newly added via batch include in addedItems", () => {
      // Workflow has 3 items, 2 originally selected (c1, c2).
      // User selects remaining item → batch include (all checked).
      // User then deselects c1 (originally selected).
      // c3 should appear as an addition, c1 as a removal.
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 3,
                originalSelectedCount: 2,
                wasFullySelected: false,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
            ["c3", "wf1"],
          ]),
          originalSelectedItems: new Set(["c1", "c2"]),
          batchOps: new Map([
            [
              "wf1",
              {
                kind: "include" as const,
                excludedItems: new Set(["c1"]),
              },
            ],
          ]),
          selectedItems: new Set(["c1", "c2"]),
          deselectedItems: new Set(["c1"]),
        }),
      );
      expect(delta.additions).to.equal(1);
      expect(delta.removals).to.equal(1);
      expect(delta.addedItems.has("c3")).to.be.true;
      expect(delta.removedItems.has("c1")).to.be.true;
    });

    it("ignores excludedItems / includedItems belonging to other containers", () => {
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 3,
                originalSelectedCount: 0,
                wasFullySelected: false,
              },
            ],
            [
              "wf2",
              {
                id: "wf2",
                itemCount: 3,
                originalSelectedCount: 3,
                wasFullySelected: true,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["a1", "wf1"],
            ["a2", "wf1"],
            ["a3", "wf1"],
            ["b1", "wf2"],
            ["b2", "wf2"],
            ["b3", "wf2"],
          ]),
          originalSelectedItems: new Set(["a1", "b1", "b2", "b3"]),
          batchOps: new Map([
            [
              "wf1",
              {
                kind: "include" as const,
                excludedItems: new Set(["b1", "b2"]),
              },
            ],
            [
              "wf2",
              {
                kind: "exclude" as const,
                includedItems: new Set(["a1", "b3"]),
              },
            ],
          ]),
          selectedItems: new Set(["a1", "b3"]),
        }),
      );
      // wf1 include: a1 already selected, b1/b2 belong to wf2 → excluded=0
      // additions = 3 - 1 - 0 = 2 (a2, a3)
      // wf2 exclude: b3 kept, a1 belongs to wf1 → validExceptions=1 (b3 only)
      // removals = 3 - 1 = 2 (b1, b2)
      expect(delta.additions).to.equal(2);
      expect(delta.removals).to.equal(2);
      expect(delta.includedContainers.has("wf1")).to.be.true;
      expect(delta.excludedContainers.has("wf2")).to.be.true;
    });

    it("ignores deselected items that were never originally selected", () => {
      // wf1 fully selected, but c4 was never selected originally
      // Deselecting c4 should be a no-op
      const delta = computeSelectionDelta(
        createState({
          containers: new Map([
            [
              "wf1",
              {
                id: "wf1",
                itemCount: 3,
                originalSelectedCount: 3,
                wasFullySelected: true,
              },
            ],
          ]),
          itemToContainer: new Map([
            ["c1", "wf1"],
            ["c2", "wf1"],
            ["c3", "wf1"],
            ["c4", "wf1"],
          ]),
          originalSelectedItems: new Set(["c1", "c2", "c3"]),
          batchOps: new Map([
            ["wf1", { kind: "include" as const, excludedItems: new Set() }],
          ]),
          deselectedItems: new Set(["c4"]),
        }),
      );
      expect(delta.additions).to.equal(0);
      expect(delta.removals).to.equal(0);
      expect(delta.removedItems.has("c4")).to.be.false;
    });

    it("handles items with no container mapping (undefined containerId)", () => {
      // Items not in itemToContainer at all — containerId is undefined
      // An orphaned originally-selected item no longer selected → removal
      // An orphaned newly-selected item → addition
      const delta = computeSelectionDelta(
        createState({
          containers: new Map(),
          itemToContainer: new Map(),
          originalSelectedItems: new Set(["orphan1"]),
          selectedItems: new Set(["orphan2"]),
        }),
      );
      expect(delta.removals).to.equal(1);
      expect(delta.removedItems.has("orphan1")).to.be.true;
      expect(delta.additions).to.equal(1);
      expect(delta.addedItems.has("orphan2")).to.be.true;
    });
  });
});
