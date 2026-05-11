import { NodeEditor } from './ui/NodeEditor';
import { Viewport } from './ui/Viewport';
import { CodeEditor } from './ui/CodeEditor';

export function App() {
  return (
    <div className="app-shell">
      <NodeEditor />
      <Viewport />
      <CodeEditor />
    </div>
  );
}
