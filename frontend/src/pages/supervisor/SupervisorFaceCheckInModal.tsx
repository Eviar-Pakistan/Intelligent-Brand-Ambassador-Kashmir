import { FaceCheckInModal } from '../../components/FaceCheckInModal'

type Props = {
  open: boolean
  storeName: string
  busy?: boolean
  onClose: () => void
  onConfirmed: (photo: Blob) => void
}

/** MediaPipe face gate + selfie capture before supervisor store check-in. */
export function SupervisorFaceCheckInModal({
  open,
  storeName,
  busy = false,
  onClose,
  onConfirmed,
}: Props) {
  return (
    <FaceCheckInModal
      open={open}
      title={`Check in · ${storeName}`}
      busy={busy}
      onClose={onClose}
      onConfirmed={onConfirmed}
    />
  )
}
