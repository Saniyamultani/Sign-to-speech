/**
 * src/ml/features.js
 * ============================================================
 * Feature extraction — MUST match backend/services/vision_service.py
 * exactly, feature-for-feature, or the trained model will produce
 * garbage predictions.
 *
 * Output shape: Float32Array of length 258
 *   [63]  left_hand  — 21 landmarks × (x, y, z), wrist-centred
 *   [63]  right_hand — same
 *   [132] pose       — 33 landmarks × (x, y, z, visibility), shoulders-centred
 *
 * Face landmarks are excluded (USE_FACE=false in your .env).
 * ============================================================
 */

const HAND_LANDMARK_COUNT = 21   // MediaPipe: 21 per hand
const POSE_LANDMARK_COUNT = 33   // MediaPipe: 33 pose landmarks

export const N_FEATURES = 258    // 63 + 63 + 132

/**
 * Extract a 63-length array for one hand.
 * Mirrors _extract_hand() in vision_service.py — subtracts wrist (lm[0]).
 *
 * @param {Array|null} landmarks — list of {x, y, z} from MediaPipe, or null
 * @returns {Float32Array} length 63 (all zeros if no hand)
 */
export function extractHand(landmarks) {
  const out = new Float32Array(63)
  if (!landmarks || landmarks.length !== HAND_LANDMARK_COUNT) return out

  const wrist = landmarks[0]
  const wx = wrist.x, wy = wrist.y, wz = wrist.z

  for (let i = 0; i < HAND_LANDMARK_COUNT; i++) {
    const lm = landmarks[i]
    const base = i * 3
    out[base]     = lm.x - wx
    out[base + 1] = lm.y - wy
    out[base + 2] = lm.z - wz
  }
  return out
}

/**
 * Extract a 132-length array for pose.
 * Mirrors _extract_pose() — subtracts midpoint of shoulders (lm[11], lm[12]).
 * Keeps visibility as the 4th channel, unchanged.
 *
 * @param {Array|null} landmarks — list of {x, y, z, visibility}
 * @returns {Float32Array} length 132
 */
export function extractPose(landmarks) {
  const out = new Float32Array(132)
  if (!landmarks || landmarks.length !== POSE_LANDMARK_COUNT) return out

  const l = landmarks[11], r = landmarks[12]    // shoulders
  const mx = (l.x + r.x) / 2
  const my = (l.y + r.y) / 2
  const mz = (l.z + r.z) / 2

  for (let i = 0; i < POSE_LANDMARK_COUNT; i++) {
    const lm = landmarks[i]
    const base = i * 4
    out[base]     = lm.x - mx
    out[base + 1] = lm.y - my
    out[base + 2] = lm.z - mz
    out[base + 3] = lm.visibility ?? 0
  }
  return out
}

/**
 * Combine all three into the 258-length feature vector the model expects.
 * Order MUST match Python: left_hand, right_hand, pose.
 *
 * @param {Object} results — MediaPipe Holistic output
 * @returns {Float32Array} length 258
 */
export function buildFeatures(results) {
  const features = new Float32Array(N_FEATURES)

  const leftHand  = extractHand(results.leftHandLandmarks  || null)
  const rightHand = extractHand(results.rightHandLandmarks || null)
  const pose      = extractPose(results.poseLandmarks       || null)

  features.set(leftHand, 0)
  features.set(rightHand, 63)
  features.set(pose, 126)

  return features
}

/**
 * Returns true if MediaPipe found at least one of hands or pose.
 * Matches the body_ok check in vision_service.py — we classify Neutral
 * whenever the user isn't visible to the camera.
 */
export function hasBody(results) {
  return Boolean(
    results.poseLandmarks ||
    results.leftHandLandmarks ||
    results.rightHandLandmarks
  )
}
