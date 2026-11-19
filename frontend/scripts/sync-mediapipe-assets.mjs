/**
 * Copy MediaPipe WASM from node_modules and ensure the face model is in public/.
 * Runs on postinstall / prebuild so face check uses same-origin assets (offline-capable).
 */
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { request as httpsRequest } from 'node:https'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const wasmDest = join(root, 'public', 'mediapipe', 'wasm')
const modelDestDir = join(root, 'public', 'mediapipe', 'models')
const modelDest = join(modelDestDir, 'blaze_face_short_range.tflite')
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(dest)
    const req = httpsRequest(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        out.close()
        download(res.headers.location, dest).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        out.close()
        reject(new Error(`Download failed (${res.statusCode}): ${url}`))
        return
      }
      res.pipe(out)
      out.on('finish', () => out.close(() => resolve()))
      out.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

mkdirSync(wasmDest, { recursive: true })
mkdirSync(modelDestDir, { recursive: true })

if (!existsSync(wasmSrc)) {
  console.warn('[sync-mediapipe] @mediapipe/tasks-vision wasm not found — run npm install first.')
  process.exit(0)
}

for (const name of readdirSync(wasmSrc)) {
  copyFileSync(join(wasmSrc, name), join(wasmDest, name))
}
console.log(`[sync-mediapipe] Copied WASM → public/mediapipe/wasm (${readdirSync(wasmDest).length} files)`)

const needModel = !existsSync(modelDest) || statSync(modelDest).size < 1000
if (needModel) {
  console.log('[sync-mediapipe] Downloading face model…')
  await download(MODEL_URL, modelDest)
}
console.log('[sync-mediapipe] Face model ready at public/mediapipe/models/blaze_face_short_range.tflite')
