import { FaceCheckInModal } from '../../components/FaceCheckInModal'

type Props = {
  open: boolean
  storeName: string
  busy?: boolean
  submitError?: string | null
  onClose: () => void
  onConfirmed: (photo: Blob) => void
}

/** MediaPipe face gate + selfie capture before supervisor store check-in. */
export function SupervisorFaceCheckInModal({
  open,
  storeName,
  busy = false,
  submitError = null,
  onClose,
  onConfirmed,
}: Props) {
  return (
    <FaceCheckInModal
      open={open}
      title={`Check in · ${storeName}`}
      busy={busy}
      maxPhotoEdge={512}
      submitError={submitError}
      onClose={onClose}
      onConfirmed={onConfirmed}
    />
  )
}
