import React, { useMemo } from 'react';
import { useStore } from '../lib/store.js';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';

const COLORS = {
  INFO: '#5b8cff', WARN: '#f5a524', ERROR: '#ef4444', FATAL: '#b91c1c',
  DEBUG: '#8a93a3', TRACE: '#5a6370', UNKNOWN: '#5a6370',
};

export default function Charts() {
  const summary = useStore(s => s.summary);
  if (!summary) return <Empty />;

  const buckets = summary.timeline?.buckets || [];
  const data = buckets.map(b => ({
    time: fmt(b.ts, summary.timeline?.bucketMs),
    INFO: b.INFO || 0,
    WARN: b.WARN || 0,
    ERROR: (b.ERROR || 0) + (b.FATAL || 0),
    DEBUG: b.DEBUG || 0,
  }));

  const levels = Object.entries(summary.byLevel || {}).map(([name, value]) => ({ name, value }));

  const fileData = useMemo(() => {
    return Object.entries(summary.byFile || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => ({ name: shortFile(name), count }));
  }, [summary]);

  return (
    <div className="p-3 space-y-4 text-xs">
      <Section title="Log volume over time">
        <div className="h-56 bg-bg-panel border border-border rounded p-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,147,163,0.15)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#8a93a3' }} />
              <YAxis tick={{ fontSize: 10, fill: '#8a93a3' }} />
              <Tooltip contentStyle={{ background: '#11141a', border: '1px solid #222833', fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="INFO" stackId="1" stroke={COLORS.INFO} fill={COLORS.INFO} fillOpacity={0.3} />
              <Area type="monotone" dataKey="WARN" stackId="1" stroke={COLORS.WARN} fill={COLORS.WARN} fillOpacity={0.4} />
              <Area type="monotone" dataKey="ERROR" stackId="1" stroke={COLORS.ERROR} fill={COLORS.ERROR} fillOpacity={0.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Distribution by level">
        <div className="h-44 bg-bg-panel border border-border rounded p-2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={levels} dataKey="value" nameKey="name" innerRadius={28} outerRadius={60} paddingAngle={2}>
                {levels.map((l, i) => <Cell key={i} fill={COLORS[l.name] || '#5a6370'} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#11141a', border: '1px solid #222833', fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {fileData.length > 0 && (
        <Section title="Records by file (top 12)">
          <div className="h-56 bg-bg-panel border border-border rounded p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fileData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(138,147,163,0.15)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#8a93a3' }} />
                <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 10, fill: '#8a93a3' }} />
                <Tooltip contentStyle={{ background: '#11141a', border: '1px solid #222833', fontSize: 11 }} />
                <Bar dataKey="count" fill="#7aa2ff" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">{title}</h3>
      {children}
    </section>
  );
}

function fmt(ts, bucketMs) {
  const d = new Date(ts);
  if (!bucketMs || bucketMs >= 24 * 60 * 60 * 1000) return d.toISOString().slice(0, 10);
  if (bucketMs >= 60 * 60 * 1000) return d.toISOString().slice(5, 13).replace('T', ' ');
  return d.toISOString().slice(11, 19);
}

function shortFile(p) {
  if (!p) return '';
  if (p.length <= 24) return p;
  return '…' + p.slice(-24);
}

function Empty() {
  return <div className="p-6 text-center text-text-muted text-xs">No data to chart.</div>;
}
