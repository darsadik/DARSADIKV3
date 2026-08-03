import { useState } from 'react'
import { STATUS_META } from '../../lib/camionPerformance'
import { fmtMoney } from '../../lib/utils'

/**
 * PerfChart — évolution chronologique d'une métrique de performance carburant.
 * points: [{ label, value, status }]  (status: 'normal' | 'surveiller' | 'anormale')
 */
export default function PerfChart({ title, points, color, unit, height = 180 }) {
  const [hover, setHover] = useState(null)

  if (!points || points.length === 0) {
    return (
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
        <div className="text-center text-gray-400 text-xs py-10">
          Pas assez de données pour tracer une évolution
        </div>
      </div>
    )
  }

  const isMoney = typeof unit === 'string' && unit.includes('DH')
  const fmtValue = (v, decimals) => isMoney ? fmtMoney(v) : v.toFixed(decimals)

  const W = 640, H = height, padL = 40, padR = 12, padT = 16, padB = 26

  const values = points.map(p => p.value)
  let min = Math.min(...values), max = Math.max(...values)
  if (min === max) { min -= 1; max += 1 }
  const pad = (max - min) * 0.15
  min = Math.max(0, min - pad)
  max += pad

  const xStep = points.length > 1 ? (W - padL - padR) / (points.length - 1) : 0
  const xAt = i => padL + xStep * i
  const yAt = v => H - padB - ((v - min) / (max - min || 1)) * (H - padT - padB)

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)}`).join(' ')

  const tickIdx = points.length > 1
    ? Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]))
    : [0]

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-2.5 text-[10px] text-gray-500 flex-wrap">
          {Object.entries(STATUS_META).map(([k, m]) => (
            <span key={k} className="flex items-center gap-1">{m.emoji} {m.label}</span>
          ))}
        </div>
      </div>

      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        {[0, 1, 2, 3].map(i => {
          const y = padT + (i * (H - padT - padB)) / 3
          const val = max - (i * (max - min)) / 3
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{fmtValue(val, 1)}</text>
            </g>
          )
        })}

        {hover !== null && (
          <line x1={xAt(hover)} x2={xAt(hover)} y1={padT} y2={H - padB} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3,3" />
        )}

        <path d={path} fill="none" stroke={color} strokeWidth="2" />

        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(h => (h === i ? null : h))} style={{ cursor: 'pointer' }}>
            <circle cx={xAt(i)} cy={yAt(p.value)} r="10" fill="transparent" />
            <circle cx={xAt(i)} cy={yAt(p.value)} r={hover === i ? 5 : 3.5} fill={STATUS_META[p.status]?.color || '#94a3b8'} stroke="#fff" strokeWidth="1.5" />
          </g>
        ))}

        {tickIdx.map(i => (
          <text key={i} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#94a3b8">{points[i].label}</text>
        ))}
      </svg>

      <div className="mt-2 text-xs rounded-lg px-3 py-2 flex items-center justify-between border" style={{
        background: hover !== null ? '#f8fafc' : 'transparent',
        borderColor: hover !== null ? '#e2e8f0' : 'transparent',
      }}>
        {hover !== null ? (
          <>
            <span className="text-gray-500">{points[hover].sub || points[hover].label}</span>
            <span className="font-bold text-gray-900">{fmtValue(points[hover].value, 2)} {unit}</span>
            <span className={STATUS_META[points[hover].status]?.text}>
              {STATUS_META[points[hover].status]?.emoji} {STATUS_META[points[hover].status]?.label}
            </span>
          </>
        ) : (
          <span className="text-gray-300">Survolez un point pour le détail</span>
        )}
      </div>
    </div>
  )
}
