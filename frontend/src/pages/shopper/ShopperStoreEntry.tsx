import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { enterShopperStore } from '../../lib/storeRegistry'

/** What a store's QR code opens: remember which store this shopper is at, then start the journey. */
export function ShopperStoreEntry() {
  const { storeSlug = '' } = useParams()
  const [params] = useSearchParams()
  enterShopperStore(storeSlug, params)
  return <Navigate to="/shopper" replace />
}
