import React, { useEffect } from 'react';

export default function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed top-16 right-4 max-w-sm bg-bg-panel border border-level-error/40 text-text px-4 py-3 rounded-md shadow-lg flex items-start gap-3">
      <span className="lvl-ERROR mt-0.5">●</span>
      <div className="flex-1 text-sm">{message}</div>
      <button onClick={onClose} className="text-text-muted hover:text-text">×</button>
    </div>
  );
}
