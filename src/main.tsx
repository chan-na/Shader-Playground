import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { useGraphStore } from './state/graphStore';
import { useSelectionStore } from './state/selectionStore';

if (import.meta.env.DEV) {
  // Expose stores for debugging / Playwright-style verification.
  (window as unknown as { __sp: unknown }).__sp = {
    graph: useGraphStore,
    selection: useSelectionStore,
  };
}

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
