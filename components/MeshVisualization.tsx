import React, { useMemo } from 'react';
import { Peer } from '../types.ts';

interface MeshVisualizationProps {
  peers: Peer[];
  myId: string;
}

const MeshVisualization: React.FC<MeshVisualizationProps> = ({ peers, myId }) => {
  const nodes = useMemo(() => {
    const all = [...peers.filter(p => p.isOnline), { id: myId, nickname: 'Me', isOnline: true }];
    return all.map((p, i) => {
      const angle = (i / all.length) * 2 * Math.PI;
      const radius = 80;
      return {
        ...p,
        x: 100 + radius * Math.cos(angle),
        y: 100 + radius * Math.sin(angle)
      };
    });
  }, [peers, myId]);

  return (
    <div className="bg-slate-900 rounded-xl p-4 border border-slate-700 h-64 relative overflow-hidden">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center">
        <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse shadow-[0_0_8px_#10b981]"></span>
        Active Node Map
      </h3>
      <svg viewBox="0 0 200 200" className="w-full h-full">
        {nodes.map((node, i) => 
          nodes.map((other, j) => {
            if (i >= j) return null;
            const dist = Math.sqrt(Math.pow(node.x - other.x, 2) + Math.pow(node.y - other.y, 2));
            if (dist > 120) return null;
            return (
              <line 
                key={`line-${i}-${j}`} 
                x1={node.x} y1={node.y} x2={other.x} y2={other.y} 
                stroke="#065f46" strokeWidth="0.5" 
                strokeDasharray="2,2"
                className="opacity-40"
              />
            );
          })
        )}
        {nodes.map((node) => (
          <g key={node.id}>
            <circle 
              cx={node.x} 
              cy={node.y} 
              r="6" 
              fill={node.id === myId ? "#10b981" : "#065f46"} 
              className={node.id === myId ? "glow-green" : ""}
            />
            <text x={node.x} y={node.y + 12} textAnchor="middle" fontSize="6" fill="#94a3b8" className="font-mono font-bold uppercase tracking-tighter">
              {node.nickname}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

export default MeshVisualization;