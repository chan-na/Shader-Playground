import { beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from './selectionStore';

describe('selectionStore', () => {
  beforeEach(() => {
    useSelectionStore.getState().select(null);
  });

  it('starts with no selection', () => {
    expect(useSelectionStore.getState().selectedNodeId).toBeNull();
  });

  it('select changes the current selection', () => {
    useSelectionStore.getState().select('node-42');
    expect(useSelectionStore.getState().selectedNodeId).toBe('node-42');
    useSelectionStore.getState().select(null);
    expect(useSelectionStore.getState().selectedNodeId).toBeNull();
  });
});
