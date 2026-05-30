/**
 * MobileTable — shows a table on desktop, cards on mobile
 * Props:
 *   columns: [{ key, label, className }]
 *   rows: array of data
 *   renderCard: (row) => JSX  — mobile card render
 *   keyField: string (default 'id')
 *   footer: JSX (optional)
 *   emptyMessage: string
 */
import { useEffect, useState } from 'react'

export default function MobileTable({ columns, rows, renderCard, keyField = 'id', footer, emptyMessage = 'Aucune donnée' }) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (isMobile) {
    return (
      <div className="mobile-card-list">
        {rows.length === 0 ? (
          <div className="text-center text-gray-400 py-10">{emptyMessage}</div>
        ) : (
          rows.map(row => (
            <div key={row[keyField]}>
              {renderCard(row)}
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} className={`th ${col.className || ''}`}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row[keyField]} className="hover:bg-gray-50 transition-colors">
              {columns.map(col => (
                <td key={col.key} className={`td ${col.className || ''}`}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="td text-center text-gray-400 py-10">{emptyMessage}</td></tr>
          )}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  )
}
