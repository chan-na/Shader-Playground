import { NodeEditor } from './ui/NodeEditor';
import { Viewport } from './ui/Viewport';
import { CodeEditor } from './ui/CodeEditor';
import { SidePanel } from './ui/Panels/SidePanel';
import { StatusBar } from './ui/Panels/StatusBar';
import { CommandPalette } from './ui/CommandPalette';
import { KeyboardShortcuts } from './ui/KeyboardShortcuts';

export function App() {
  return (
    <div className="app-shell">
      <NodeEditor />
      <Viewport />
      <CodeEditor />
      <SidePanel />
      <div className="statusbar">
        <StatusBar />
      </div>
      <CommandPalette />
      <KeyboardShortcuts />
    </div>
  );
}
