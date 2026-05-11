import { BootstrapGate } from "./ui/BootstrapGate";
import { CodeEditor } from "./ui/CodeEditor";
import { CommandPalette } from "./ui/CommandPalette";
import { KeyboardShortcuts } from "./ui/KeyboardShortcuts";
import { NodeEditor } from "./ui/NodeEditor";
import { SidePanel } from "./ui/Panels/SidePanel";
import { StatusBar } from "./ui/Panels/StatusBar";
import { Viewport } from "./ui/Viewport";

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
      <BootstrapGate />
    </div>
  );
}
