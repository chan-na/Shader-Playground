import { AppToolbar } from "./ui/AppToolbar";
import { BootstrapGate } from "./ui/BootstrapGate";
import { CommandPalette } from "./ui/CommandPalette";
import { DockLayout } from "./ui/DockLayout";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { ExportShareDialog } from "./ui/ExportShare/ExportShareDialog";
import { GpuBlockScreen } from "./ui/GpuBlockScreen";
import { KeyboardShortcuts } from "./ui/KeyboardShortcuts";
import { StatusBar } from "./ui/Panels/StatusBar";
import { Toasts } from "./ui/Toasts";

export function App() {
  return (
    <div className="app-shell">
      <AppToolbar />
      <ErrorBoundary>
        <div className="shell-content">
          <DockLayout />
        </div>
      </ErrorBoundary>
      <div className="statusbar">
        <StatusBar />
      </div>
      <CommandPalette />
      <ExportShareDialog />
      <KeyboardShortcuts />
      <BootstrapGate />
      <Toasts />
      <GpuBlockScreen />
    </div>
  );
}
