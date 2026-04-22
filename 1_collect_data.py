"""
===============================================================
SCRIPT 1: DATA COLLECTION — HOLISTIC EDITION (v3)
Sign Language to Speech/Text Translator — Final Year Project
===============================================================
This script is UNCHANGED from v2. It collects holistic landmark
data (both hands + pose + optional face) and saves to CSV.

The training script (2_train_model.py) now applies DATA AUGMENTATION
automatically, so you do NOT need to collect more samples.
Collect 150 samples per sign as before.

For full documentation see the v2 script comments.
===============================================================
"""

import cv2
import mediapipe as mp
import csv
import os
import numpy as np
import time

OUTPUT_CSV        = "data/landmarks_holistic.csv"
SAMPLES_PER_LABEL = 150
CAPTURE_DELAY     = 0.05
USE_FACE          = False   # Must match 2_train_model.py and 3_inference.py

os.makedirs("data", exist_ok=True)

mp_holistic  = mp.solutions.holistic
mp_drawing   = mp.solutions.drawing_utils

holistic = mp_holistic.Holistic(
    static_image_mode=False,
    model_complexity=1,
    smooth_landmarks=True,
    enable_segmentation=False,
    refine_face_landmarks=True,
    min_detection_confidence=0.6,
    min_tracking_confidence=0.5
)


def extract_hand(lms):
    if lms is None: return [0.0] * 63
    c = np.array([[l.x, l.y, l.z] for l in lms.landmark])
    c -= c[0]
    return c.flatten().tolist()

def extract_pose(lms):
    if lms is None: return [0.0] * 132
    c = np.array([[l.x, l.y, l.z, l.visibility] for l in lms.landmark])
    mid = (c[11, :3] + c[12, :3]) / 2.0
    c[:, :3] -= mid
    return c.flatten().tolist()

def extract_face(lms):
    if not USE_FACE: return []
    if lms is None: return [0.0] * 1404
    c = np.array([[l.x, l.y, l.z] for l in lms.landmark])
    c -= c[1]
    return c.flatten().tolist()

def build_row(results):
    return (extract_hand(results.left_hand_landmarks) +
            extract_hand(results.right_hand_landmarks) +
            extract_pose(results.pose_landmarks) +
            extract_face(results.face_landmarks))

def save_to_csv(label, row):
    file_exists = os.path.isfile(OUTPUT_CSV)
    with open(OUTPUT_CSV, mode='a', newline='') as f:
        writer = csv.writer(f)
        if not file_exists:
            lh  = [f'lh_{ax}{i}'   for i in range(21) for ax in ['x','y','z']]
            rh  = [f'rh_{ax}{i}'   for i in range(21) for ax in ['x','y','z']]
            ps  = [f'pose_{ax}{i}' for i in range(33) for ax in ['x','y','z','v']]
            fc  = ([f'face_{ax}{i}' for i in range(468) for ax in ['x','y','z']]
                   if USE_FACE else [])
            writer.writerow(['label'] + lh + rh + ps + fc)
        writer.writerow([label] + row)

def draw_skeleton(frame, results):
    if results.pose_landmarks:
        mp_drawing.draw_landmarks(
            frame, results.pose_landmarks, mp_holistic.POSE_CONNECTIONS,
            mp_drawing.DrawingSpec(color=(0,210,90), thickness=2, circle_radius=3),
            mp_drawing.DrawingSpec(color=(0,170,70), thickness=2))
    if results.left_hand_landmarks:
        mp_drawing.draw_landmarks(
            frame, results.left_hand_landmarks, mp_holistic.HAND_CONNECTIONS,
            mp_drawing.DrawingSpec(color=(0,210,255), thickness=2, circle_radius=4),
            mp_drawing.DrawingSpec(color=(0,170,220), thickness=2))
    if results.right_hand_landmarks:
        mp_drawing.draw_landmarks(
            frame, results.right_hand_landmarks, mp_holistic.HAND_CONNECTIONS,
            mp_drawing.DrawingSpec(color=(255,210,0), thickness=2, circle_radius=4),
            mp_drawing.DrawingSpec(color=(220,170,0), thickness=2))

def main():
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    if not cap.isOpened():
        print("[ERROR] Cannot open webcam."); return

    n_feat = 258 + (1404 if USE_FACE else 0)
    print(f"\n{'='*55}\n  HOLISTIC DATA COLLECTOR  ({n_feat} features/frame)\n{'='*55}")
    print("Stand so your SHOULDERS are visible in frame.\n")

    while True:
        label = input("Enter label (or 'quit'): ").strip()
        if label.lower() == 'quit': break
        if not label: continue

        print(f"  → '{label}' — press SPACE to start, Q to cancel")
        collecting, count = False, 0

        while True:
            ret, frame = cap.read()
            if not ret: break
            frame = cv2.flip(frame, 1)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb.flags.writeable = False
            results = holistic.process(rgb)
            rgb.flags.writeable = True
            draw_skeleton(frame, results)

            h, w = frame.shape[:2]
            ov = frame.copy()
            cv2.rectangle(ov, (0,0), (w,85), (10,10,10), -1)
            cv2.addWeighted(ov, 0.65, frame, 0.35, 0, frame)

            lh = results.left_hand_landmarks  is not None
            rh = results.right_hand_landmarks is not None
            ps = results.pose_landmarks       is not None
            status = f"LH:{'OK' if lh else '--'}  RH:{'OK' if rh else '--'}  Pose:{'OK' if ps else '--'}"

            color = (0,255,130) if collecting else (0,220,255)
            cv2.putText(frame, f"Label: {label}", (15, 42),
                        cv2.FONT_HERSHEY_DUPLEX, 1.1, color, 2, cv2.LINE_AA)
            cv2.putText(frame, status, (15,72),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.52, (180,180,180), 1)

            if collecting:
                bar = int((count / SAMPLES_PER_LABEL) * (w - 30))
                cv2.rectangle(frame, (15, h-30), (w-15, h-10), (40,40,40), -1)
                cv2.rectangle(frame, (15, h-30), (15+bar, h-10), (0,210,100), -1)
                cv2.putText(frame, f"{count}/{SAMPLES_PER_LABEL}",
                            (w-120, h-12), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (220,220,220), 1)

                if ps or lh or rh:
                    save_to_csv(label, build_row(results))
                    count += 1
                    time.sleep(CAPTURE_DELAY)
                else:
                    cv2.putText(frame, "MOVE INTO FRAME", (15, h-38),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0,60,230), 2)
                if count >= SAMPLES_PER_LABEL:
                    print(f"  [OK] {count} samples saved for '{label}'")
                    break
            else:
                cv2.putText(frame, "SPACE=start   Q=cancel",
                            (15, h-12), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150,150,150), 1)

            cv2.imshow("Data Collector", frame)
            key = cv2.waitKey(1) & 0xFF
            if   key == ord(' ') and not collecting:
                collecting = True
                print(f"  [CAPTURING]...")
            elif key == ord('q'):
                print(f"  [CANCELLED]"); break

    cap.release()
    cv2.destroyAllWindows()
    holistic.close()
    print(f"\n[DONE] Data → '{OUTPUT_CSV}'")
    print("[NEXT] Run 2_train_model.py")

if __name__ == "__main__":
    main()
