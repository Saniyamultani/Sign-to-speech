"""
3_export_to_onnx.py
====================
Converts the trained sklearn Pipeline (StandardScaler + RandomForest)
into an ONNX model that runs in the browser via onnxruntime-web.

Run ONCE after training to produce:
    model/sign_model_holistic.onnx
    model/classes.json             ← label lookup for JS

Verifies the ONNX model against the original by predicting on the
same random input — the two must agree to floating-point precision
before we touch the frontend.
"""

from __future__ import annotations
import json
import sys
from pathlib import Path

import joblib
import numpy as np

MODEL_IN   = Path("model/sign_model_holistic.pkl")
ENCODER_IN = Path("model/label_encoder_holistic.pkl")
MODEL_OUT  = Path("model/sign_model_holistic.onnx")
CLASSES_OUT = Path("model/classes.json")


def main() -> int:
    # ── Import late so we get a clean error if skl2onnx isn't installed ──
    try:
        from skl2onnx import convert_sklearn
        from skl2onnx.common.data_types import FloatTensorType
        import onnxruntime as ort
    except ImportError as e:
        print("\n[ERROR] Missing packages. Install with:")
        print("    pip install skl2onnx onnxruntime\n")
        print(f"Detail: {e}")
        return 1

    # ── Load the trained artefacts ──
    if not MODEL_IN.is_file():
        print(f"[ERROR] {MODEL_IN} not found. Run 2_train_model.py first.")
        return 1

    print(f"Loading {MODEL_IN}...")
    pipeline = joblib.load(MODEL_IN)
    encoder  = joblib.load(ENCODER_IN)

    n_features = pipeline.n_features_in_
    classes    = [str(c) for c in encoder.classes_]
    print(f"  • {len(classes)} classes: {classes}")
    print(f"  • {n_features} input features")

    # ── Convert ──
    # 'zipmap=False' gives us a plain float array of probabilities
    # (instead of a dict per sample — awkward in JS).
    print("\nConverting to ONNX...")
    onnx_model = convert_sklearn(
        pipeline,
        initial_types=[("input", FloatTensorType([None, n_features]))],
        target_opset=15,
        options={id(pipeline): {"zipmap": False}},
    )

    MODEL_OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(MODEL_OUT, "wb") as f:
        f.write(onnx_model.SerializeToString())
    print(f"  • Wrote {MODEL_OUT} ({MODEL_OUT.stat().st_size/1024:.1f} KB)")

    # Classes file — the JS side uses this to map index → label
    with open(CLASSES_OUT, "w") as f:
        json.dump({"classes": classes, "n_features": n_features}, f, indent=2)
    print(f"  • Wrote {CLASSES_OUT}")

    # ── Verification: predict on random input both ways ──
    print("\nVerifying ONNX vs sklearn predictions...")
    rng = np.random.default_rng(42)
    test_batch = rng.standard_normal((5, n_features)).astype(np.float32)

    sk_probs = pipeline.predict_proba(test_batch)

    sess = ort.InferenceSession(str(MODEL_OUT),
                                providers=["CPUExecutionProvider"])
    # Output names vary by skl2onnx version — grab them dynamically
    output_names = [o.name for o in sess.get_outputs()]
    print(f"  • ONNX output names: {output_names}")
    outputs = sess.run(None, {"input": test_batch})

    # The probability output is a 2D array with shape (batch, n_classes)
    onnx_probs = None
    for out in outputs:
        if hasattr(out, 'shape') and len(out.shape) == 2 and out.shape[1] == len(classes):
            onnx_probs = out
            break

    if onnx_probs is None:
        print("[ERROR] Could not find probability output in ONNX model.")
        print(f"  Outputs: {[(n, o.shape if hasattr(o,'shape') else type(o)) for n,o in zip(output_names, outputs)]}")
        return 1

    max_diff = float(np.abs(sk_probs - onnx_probs).max())
    print(f"  • Max probability difference: {max_diff:.2e}")

    if max_diff < 1e-4:
        print("\n[OK] ONNX model matches sklearn predictions.")
        print(f"\nNext steps:")
        print(f"  1. Copy {MODEL_OUT} to frontend/public/model/")
        print(f"  2. Copy {CLASSES_OUT} to frontend/public/model/")
        print(f"  3. Run the browser-inference setup (coming next)")
        return 0
    else:
        print(f"\n[FAIL] Predictions diverge by {max_diff}. "
              "This would cause wrong signs in the browser.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
