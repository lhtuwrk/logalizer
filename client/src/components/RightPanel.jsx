import React from 'react';
import { useStore } from '../lib/store.js';
import Insights from './Insights.jsx';
import Charts from './Charts.jsx';
import Report from './Report.jsx';

export default function RightPanel() {
  const tab = useStore(s => s.rightTab);
  const setTab = useStore(s => s.setRightTab);
  const report = useStore(s => s.report);

  return (
    <aside className="w-full border-l border-border bg-bg-elev flex flex-col min-h-0 overflow-hidden">
      <div className="h-9 flex items-center px-2 border-b border-border text-xs gap-1 shrink-0">
        <Tab id="insights" tab={tab} onClick={setTab}>Insights</Tab>
        <Tab id="charts" tab={tab} onClick={setTab}>Charts</Tab>
        {report && <Tab id="report" tab={tab} onClick={setTab}>Report</Tab>}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {tab === 'insights' && <Insights />}
        {tab === 'charts' && <Charts />}
        {tab === 'report' && <Report />}
      </div>
    </aside>
  );
}

function Tab({ id, tab, onClick, children }) {
  const active = tab === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-3 py-1.5 rounded-md ${active ? 'bg-bg-hover text-text' : 'text-text-muted hover:text-text'}`}
    >
      {children}
    </button>
  );
}
