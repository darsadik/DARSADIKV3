import EventCard from './EventCard'

export default function UnifiedTimelineList({ events, loading, onFixVoyage, onEditKm, onAssignFuel, onFixGasoil }) {
  if (loading) return <div className="card text-center text-gray-400 py-10">Chargement...</div>
  if (events.length === 0) return <div className="card text-center text-gray-400 py-10">Aucun événement pour ces filtres</div>

  return (
    <div className="card">
      {events.map((e, i) => (
        <EventCard
          key={e.id}
          event={e}
          isLast={i === events.length - 1}
          onFixVoyage={onFixVoyage}
          onEditKm={onEditKm}
          onAssignFuel={onAssignFuel}
          onFixGasoil={onFixGasoil}
        />
      ))}
    </div>
  )
}
