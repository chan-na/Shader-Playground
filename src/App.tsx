import { useDebugUiStore } from "./state/debugUiStore";
import { BootstrapGate } from "./ui/BootstrapGate";
import { CodeEditor } from "./ui/CodeEditor";
import { CommandPalette } from "./ui/CommandPalette";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { KeyboardShortcuts } from "./ui/KeyboardShortcuts";
import { NodeEditor } from "./ui/NodeEditor";
import { DiagnosticsPanel } from "./ui/Panels/DiagnosticsPanel";
import { SidePanel } from "./ui/Panels/SidePanel";
import { StatusBar } from "./ui/Panels/StatusBar";
import { Toasts } from "./ui/Toasts";
import { Viewport } from "./ui/Viewport";

export function App() {
  const diagOpen = useDebugUiStore((s) => s.open);
  return (
    <div className="app-shell">
      <ErrorBoundary>
        <NodeEditor />
        <Viewport />
        <CodeEditor />
        <SidePanel />
      </ErrorBoundary>
      <div className="statusbar">
        <StatusBar />
      </div>
      <CommandPalette />
      <KeyboardShortcuts />
      <BootstrapGate />
      <Toasts />
      {diagOpen && <DiagnosticsPanel />}
    </div>
  );
}
