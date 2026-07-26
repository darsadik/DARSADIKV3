import { useState } from 'react'
import Layout from '../../components/Layout'
import { useRouter } from 'next/router'
import VoyageDetailPanel from '../../components/voyage/VoyageDetailPanel'

export default function VoyageDetail() {
  const router = useRouter()
  const { id }  = router.query
  const [voyage, setVoyage] = useState(null)

  return (
    <Layout
      title={voyage ? (voyage.reference || `Voyage #${voyage.id}`) : 'Voyage'}
      subtitle={voyage ? `${voyage.camion_plaque}${voyage.chauffeur?' • '+voyage.chauffeur:''}${voyage.destination?' → '+voyage.destination:''}` : undefined}
    >
      <VoyageDetailPanel voyageId={id} onVoyageLoaded={setVoyage} />
    </Layout>
  )
}
