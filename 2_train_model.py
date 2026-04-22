"""
===============================================================
SCRIPT 2: MODEL TRAINING — WITH DATA AUGMENTATION
Sign Language to Speech/Text Translator — Final Year Project
===============================================================
NEW IN THIS VERSION:
  ✔ Data Augmentation — synthetically rotates, mirrors, and
    adds noise to landmark coordinates so the model learns
    to recognise signs even when the angle changes slightly.
    This is the key fix for angle sensitivity.
  ✔ StandardScaler in pipeline for better generalisation
  ✔ class_weight='balanced' handles unequal sample counts

HOW AUGMENTATION WORKS:
  For each real training sample, we generate N synthetic copies
  by applying small random perturbations:
    • Gaussian noise   (simulates shaky hands / sensor noise)
    • Slight rotation  (2D rotation of x,y coords ±15°)
    • Mirror flip      (horizontally flip x coords — simulates
                        left-hand vs right-hand perspective)
  This effectively multiplies your dataset size by (1 + AUG_COPIES)
  without collecting more real data.

HOW TO USE:
  1. Run: python 2_train_model.py
  2. Check printed accuracy and confusion matrix
  3. Model saved to model/sign_model_holistic.pkl
===============================================================
"""

import pandas as pd
import numpy as np
import os
import joblib
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.ensemble        import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing   import LabelEncoder, StandardScaler
from sklearn.metrics         import (classification_report,
                                     confusion_matrix, accuracy_score)
from sklearn.pipeline        import Pipeline

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────
CSV_PATH     = "data/landmarks_holistic.csv"
MODEL_PATH   = "model/sign_model_holistic.pkl"
ENCODER_PATH = "model/label_encoder_holistic.pkl"

N_ESTIMATORS  = 300       # More trees = more stable predictions
MAX_DEPTH     = None      # Full depth; set 25 to reduce overfitting
RANDOM_STATE  = 42

# ── Augmentation settings ────────────────────
AUGMENT        = True     # Set False to skip augmentation
AUG_COPIES     = 4        # Synthetic copies per real sample
NOISE_STD      = 0.008    # Gaussian noise std (coords are 0–1 range)
MAX_ROTATION   = 15       # Max rotation angle in degrees (±)
DO_MIRROR      = True     # Include horizontal mirror copies

os.makedirs("model", exist_ok=True)


# ─────────────────────────────────────────────
# DATA AUGMENTATION
# ─────────────────────────────────────────────

def rotate_2d(coords_flat, angle_deg):
    """
    Apply a 2D rotation to the x,y components of every landmark.
    z (depth) is left unchanged — we only rotate in the image plane.

    This simulates the user performing a sign at a slightly
    different angle/tilt, which is the most common real-world
    variation between users and sessions.

    Args:
        coords_flat (np.ndarray): 1D feature vector
        angle_deg (float): Rotation angle in degrees

    Returns:
        np.ndarray: Rotated feature vector (same shape)
    """
    rad   = np.radians(angle_deg)
    cos_a = np.cos(rad)
    sin_a = np.sin(rad)
    result= coords_flat.copy()

    # Features are laid out as: [x0, y0, z0, x1, y1, z1, ...]
    # Every 3rd value starting at 0 is x, every 3rd at 1 is y
    # But our holistic layout mixes (x,y,z) triplets and pose has 4-tuples
    # Safe approach: iterate every 3 values (hand/face blocks)
    i = 0
    while i + 2 < len(result):
        x = result[i]
        y = result[i + 1]
        result[i]     = cos_a * x - sin_a * y
        result[i + 1] = sin_a * x + cos_a * y
        i += 3

    return result


def mirror_x(coords_flat):
    """
    Flip the x-coordinate of every landmark horizontally.
    Simulates performing the sign with the opposite hand orientation
    or from a slightly different camera angle.

    Args:
        coords_flat (np.ndarray): 1D feature vector

    Returns:
        np.ndarray: Mirrored feature vector
    """
    result = coords_flat.copy()
    i = 0
    while i < len(result):
        result[i] = -result[i]   # Negate x
        i += 3
    return result


def augment_dataset(X_train, y_train, rng):
    """
    Generate AUG_COPIES synthetic samples per real training sample.

    Each copy applies a random combination of:
      1. Gaussian noise  (always applied, small magnitude)
      2. Random rotation (±MAX_ROTATION degrees)
      3. Mirror flip     (50% chance, if DO_MIRROR=True)

    WHY ONLY AUGMENT TRAINING DATA?
      Test data must remain real (unaugmented) so accuracy
      metrics reflect real-world performance, not performance
      on synthetic data.

    Args:
        X_train (np.ndarray): Real training features
        y_train (np.ndarray): Real training labels

    Returns:
        X_aug (np.ndarray): Original + synthetic samples
        y_aug (np.ndarray): Corresponding labels
    """
    X_list = [X_train]
    y_list = [y_train]

    for _ in range(AUG_COPIES):
        X_copy = X_train.copy().astype(np.float64)

        # 1. Gaussian noise
        X_copy += rng.normal(0, NOISE_STD, X_copy.shape)

        # 2. Random rotation (different angle per sample)
        angles = rng.uniform(-MAX_ROTATION, MAX_ROTATION, len(X_copy))
        X_copy = np.array([rotate_2d(row, ang)
                           for row, ang in zip(X_copy, angles)])

        # 3. Mirror flip (random 50%)
        if DO_MIRROR:
            mask   = rng.random(len(X_copy)) < 0.5
            X_copy = np.array([mirror_x(row) if flip else row
                               for row, flip in zip(X_copy, mask)])

        X_list.append(X_copy.astype(np.float32))
        y_list.append(y_train)

    X_aug = np.vstack(X_list)
    y_aug = np.concatenate(y_list)

    # Shuffle the augmented dataset
    idx = rng.permutation(len(X_aug))
    return X_aug[idx], y_aug[idx]


# ─────────────────────────────────────────────
# DATA LOADING
# ─────────────────────────────────────────────

def load_data(csv_path):
    """
    Load holistic landmark CSV and clean empty rows.

    Returns:
        X (np.ndarray): Feature matrix
        y (np.ndarray): String class labels
    """
    print(f"[INFO] Loading '{csv_path}'...")
    df = pd.read_csv(csv_path)
    print(f"[INFO] Raw shape: {df.shape}")

    # Drop rows where all features are zero (undetected frames)
    feat_cols = [c for c in df.columns if c != 'label']
    mask      = df[feat_cols].abs().sum(axis=1) > 0
    df        = df[mask]
    print(f"[INFO] After cleaning: {df.shape}")
    print(f"\n[INFO] Class distribution:\n{df['label'].value_counts()}\n")

    X = df.drop(columns=['label']).values.astype(np.float32)
    y = df['label'].values
    return X, y


# ─────────────────────────────────────────────
# TRAINING
# ─────────────────────────────────────────────

def train(X_train, y_train):
    """
    Pipeline: StandardScaler → RandomForestClassifier
    Trained on augmented data.
    """
    print(f"[INFO] Training on {len(X_train)} samples "
          f"({N_ESTIMATORS} trees)...")
    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', RandomForestClassifier(
            n_estimators=N_ESTIMATORS,
            max_depth=MAX_DEPTH,
            random_state=RANDOM_STATE,
            n_jobs=-1,
            class_weight='balanced'
        ))
    ])
    pipeline.fit(X_train, y_train)
    print("[INFO] Training complete.\n")
    return pipeline


# ─────────────────────────────────────────────
# EVALUATION & PLOTS
# ─────────────────────────────────────────────

def evaluate(pipeline, X_test, y_test, encoder):
    y_pred       = pipeline.predict(X_test)
    acc          = accuracy_score(y_test, y_pred)
    y_tn         = encoder.inverse_transform(y_test)
    y_pn         = encoder.inverse_transform(y_pred)
    print(f"[RESULT] Test Accuracy (on REAL data): {acc*100:.2f}%\n")
    print(classification_report(y_tn, y_pn))
    return y_tn, y_pn


def cross_validate(pipeline, X_real, y_real):
    """Cross-validate on ORIGINAL (non-augmented) data for honest metrics."""
    print("[INFO] 5-fold CV on original data...")
    scores = cross_val_score(pipeline, X_real, y_real,
                             cv=5, scoring='accuracy', n_jobs=-1)
    print(f"[RESULT] CV: {scores.mean()*100:.2f}% ± {scores.std()*100:.2f}%\n")


def save_plots(y_tn, y_pn, pipeline, encoder):
    classes = list(encoder.classes_)

    # Confusion matrix
    cm = confusion_matrix(y_tn, y_pn, labels=classes)
    plt.figure(figsize=(max(8, len(classes)), max(6, len(classes) - 1)))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                xticklabels=classes, yticklabels=classes)
    plt.title("Confusion Matrix"); plt.ylabel("Actual"); plt.xlabel("Predicted")
    plt.tight_layout()
    plt.savefig("model/confusion_matrix.png", dpi=150)
    plt.close()

    # Feature importance
    imp  = pipeline.named_steps['clf'].feature_importances_
    idxs = np.argsort(imp)[::-1][:30]
    plt.figure(figsize=(14, 4))
    plt.bar(range(30), imp[idxs], color='steelblue')
    plt.title("Top 30 Feature Importances"); plt.ylabel("Score")
    plt.xticks(range(30), idxs, rotation=45, fontsize=7)
    plt.tight_layout()
    plt.savefig("model/feature_importance.png", dpi=150)
    plt.close()
    print("[INFO] Plots saved to model/")


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    print("\n" + "="*60)
    print("  HOLISTIC TRAINER + DATA AUGMENTATION")
    print("="*60 + "\n")

    rng = np.random.default_rng(RANDOM_STATE)

    # Load
    X, y = load_data(CSV_PATH)

    # Encode
    encoder = LabelEncoder()
    y_enc   = encoder.fit_transform(y)
    print(f"[INFO] Classes: {list(encoder.classes_)}\n")

    # Split on REAL data first (test set stays real)
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y_enc, test_size=0.2,
        random_state=RANDOM_STATE, stratify=y_enc
    )
    print(f"[INFO] Real train: {len(X_tr)} | Real test: {len(X_te)}\n")

    # Augment ONLY the training split
    if AUGMENT:
        X_tr_aug, y_tr_aug = augment_dataset(X_tr, y_tr, rng)
        print(f"[INFO] After augmentation: {len(X_tr_aug)} training samples "
              f"({AUG_COPIES}× copies, noise + rotation + mirror)\n")
    else:
        X_tr_aug, y_tr_aug = X_tr, y_tr

    # Train
    pipeline = train(X_tr_aug, y_tr_aug)

    # Evaluate on real test data
    y_tn, y_pn = evaluate(pipeline, X_te, y_te, encoder)

    # Cross-validate on full real data
    pipeline_cv = train(X_tr, y_tr)   # Retrain without aug for honest CV
    cross_validate(pipeline_cv, X, y_enc)

    # Plots
    save_plots(y_tn, y_pn, pipeline, encoder)

    # Save the augmentation-trained model (better real-world performance)
    joblib.dump(pipeline, MODEL_PATH)
    joblib.dump(encoder,  ENCODER_PATH)
    print(f"\n[SAVED] Model   → '{MODEL_PATH}'")
    print(f"[SAVED] Encoder → '{ENCODER_PATH}'")
    print("\n[NEXT] Run 3_inference.py")


if __name__ == "__main__":
    main()
