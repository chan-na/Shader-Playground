import { NodeEditor } from './ui/NodeEditor';
import { Viewport } from './ui/Viewport';
import { CodeEditor } from './ui/CodeEditor';
import { Inspector } from './ui/Panels/Inspector';

export function App() {
  return (
    <div className="app-shell">
      <NodeEditor />
      <Viewport />
      <CodeEditor />
      <Inspector />
    </div>
  );
}
