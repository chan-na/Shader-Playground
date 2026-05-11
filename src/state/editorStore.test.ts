import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editorStore';

describe('editorStore', () => {
  beforeEach(() => {
    const s = useEditorStore.getState();
    s.setStage('fragment');
    s.clearJump();
  });

  it('toggles the active stage', () => {
    useEditorStore.getState().setStage('vertex');
    expect(useEditorStore.getState().activeStage).toBe('vertex');
  });

  it('requestJump bumps rev on every call so identical lines re-fire', () => {
    useEditorStore.getState().requestJump({
      nodeId: 'shader-1',
      stage: 'fragment',
      line: 5,
    });
    const first = useEditorStore.getState().jumpRequest;
    expect(first).not.toBeNull();
    expect(first!.line).toBe(5);
    expect(first!.rev).toBeGreaterThan(0);

    useEditorStore.getState().requestJump({
      nodeId: 'shader-1',
      stage: 'fragment',
      line: 5,
    });
    const second = useEditorStore.getState().jumpRequest;
    expect(second!.rev).toBe(first!.rev + 1);
  });

  it('clearJump resets the pending request', () => {
    useEditorStore.getState().requestJump({
      nodeId: 'shader-1',
      stage: 'vertex',
      line: 10,
      column: 4,
    });
    expect(useEditorStore.getState().jumpRequest).not.toBeNull();
    useEditorStore.getState().clearJump();
    expect(useEditorStore.getState().jumpRequest).toBeNull();
  });
});
