/**
 * src/ml/classifier.js
 * ============================================================
 * Wraps onnxruntime-web to load sign_model_holistic.onnx and
 * run inference from a Float32Array of 258 features.
 *
 * Mirrors the inference step in vision_service._run_inference():
 *     probs = pipeline.predict_proba(features)
 *     label = encoder.inverse_transform([argmax(probs)])
 * ============================================================
 */
import * as ort from 'onnxruntime-web'

const MODEL_URL   = '/model/sign_model_holistic.onnx'
const CLASSES_URL = '/model/classes.json'

let _session = null
let _classes = null
let _loadPromise = null

/**
 * Load the model + classes JSON (once, shared across the app).
 * Returns a promise that resolves when everything's ready.
 */
export function loadModel() {
  if (_loadPromise) return _loadPromise

  _loadPromise = (async () => {
    // Point onnxruntime-web at the WASM binaries served alongside the app
    ort.env.wasm.wasmPaths = {
  'ort-wasm.wasm': '/onnx/ort-wasm.wasm',
  'ort-wasm-simd.wasm': '/onnx/ort-wasm-simd.wasm',
  'ort-wasm-simd-threaded.wasm': '/onnx/ort-wasm-simd-threaded.wasm',
}

    const [classesRes, session] = await Promise.all([
      fetch(CLASSES_URL).then(r => {
        if (!r.ok) throw new Error(`classes.json not found (${r.status})`)
        return r.json()
      }),
      ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['wasm', 'cpu'],
        graphOptimizationLevel: 'all',
      }),
    ])

    _classes = classesRes.classes
    _session = session
    console.info(`[ml] Model loaded. ${_classes.length} classes:`, _classes)
    return { classes: _classes }
  })()

  return _loadPromise
}

/**
 * Run inference on one feature vector.
 *
 * @param {Float32Array} features — length 258
 * @returns {{label: string, confidence: number, allProbs: Object<string, number>}}
 */
export async function predict(features) {
  if (!_session) {
    throw new Error('Model not loaded — call loadModel() first.')
  }

  const tensor = new ort.Tensor('float32', features, [1, features.length])
  const outputs = await _session.run({ input: tensor })

  // Find the 2D probability output (shape [1, n_classes])
  let probsArr = null
  for (const key of Object.keys(outputs)) {
    const out = outputs[key]
    if (out.dims && out.dims.length === 2 && out.dims[1] === _classes.length) {
      probsArr = out.data
      break
    }
  }
  if (!probsArr) {
    throw new Error('ONNX output format unexpected — cannot find probabilities.')
  }

  // Argmax
  let maxIdx = 0, maxVal = -Infinity
  const allProbs = {}
  for (let i = 0; i < _classes.length; i++) {
    const p = Number(probsArr[i])
    allProbs[_classes[i]] = p
    if (p > maxVal) { maxVal = p; maxIdx = i }
  }

  return {
    label:      _classes[maxIdx],
    confidence: maxVal,
    allProbs,
  }
}

export function getClasses() {
  return _classes ? [..._classes] : []
}
