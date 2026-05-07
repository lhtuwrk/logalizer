import React, { useRef } from 'react';
import { useStore } from '../lib/store.js';

export default function EmptyState() {
  const uploadAnalyze = useStore(s => s.uploadAnalyze);
  const fileInputRef = useRef(null);

  return (
    <div className="flex-1 flex items-center justify-center p-10">
      <div className="max-w-xl w-full text-center flex flex-col items-center">

        {/* Animated icon */}
        <div style={{ animation: 'es-float 5s ease-in-out infinite' }} className="mb-8">
          <svg viewBox="0 0 24 24" width="140" height="140" fill="none"
               strokeLinecap="round" strokeLinejoin="round">
            {/* Chevron — draws in first */}
            <path d="M6 8L10 12L6 16"
                  stroke="currentColor" strokeWidth="1.4"
                  strokeDasharray="12" strokeDashoffset="12"
                  style={{ animation: 'es-draw 0.55s cubic-bezier(.4,0,.2,1) 0.1s forwards' }} />
            {/* Top line */}
            <path d="M13 9H21"
                  stroke="currentColor" strokeWidth="1.4"
                  strokeDasharray="8" strokeDashoffset="8"
                  style={{ animation: 'es-draw 0.4s cubic-bezier(.4,0,.2,1) 0.45s forwards' }} />
            {/* Bottom line */}
            <path d="M13 15H19"
                  stroke="currentColor" strokeWidth="1.4"
                  strokeDasharray="6" strokeDashoffset="6"
                  style={{ animation: 'es-draw 0.35s cubic-bezier(.4,0,.2,1) 0.7s forwards' }} />
            {/* Green dot — pops in then pulses */}
            <circle cx="21" cy="15" r="1.8" fill="#22c55e"
                    style={{
                      transformBox: 'fill-box',
                      transformOrigin: 'center',
                      animation: 'es-dot-pop 0.4s cubic-bezier(.34,1.56,.64,1) 0.95s both, es-dot-pulse 2.8s ease-in-out 1.4s infinite',
                    }} />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">Logalizer</h1>
        <p className="mt-2 text-text-muted max-w-sm">
          Paste raw logs, drop files, or scan a folder. The parser auto-detects timestamp,
          level, and structure (plain text, JSON, key=value), then surfaces errors,
          anomalies, and root-cause hints.
        </p>

        <div className="mt-8 grid grid-cols-3 gap-3 text-sm w-full">
          <Feature title="Any format" body="JSON, logfmt, or plain text — auto-detected." />
          <Feature title="Big files" body="Streaming parser handles 100MB+ with virtualized rendering." />
          <Feature title="Investigate" body="One-click report with timeline, top errors, hints." />
        </div>

        <div className="mt-8">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2.5 rounded-md bg-accent/20 border border-accent text-accent hover:bg-accent/30 font-medium text-sm"
          >
            Upload →
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept=".log,.txt,.json,.gz,.zip,text/plain,application/zip,application/gzip"
            onChange={(e) => { if (e.target.files?.length) uploadAnalyze([...e.target.files]); }}
          />
        </div>
      </div>

      <style>{`
        @keyframes es-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
        @keyframes es-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes es-dot-pop {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        @keyframes es-dot-pulse {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(1.6); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

function Feature({ title, body }) {
  return (
    <div className="p-3 rounded-md bg-bg-panel border border-border text-left">
      <div className="text-text font-medium text-sm">{title}</div>
      <div className="text-text-muted text-xs mt-1">{body}</div>
    </div>
  );
}
