import { useEffect, useRef, useState } from "react";
import { FaceMesh } from "@mediapipe/face_mesh";

const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];
const NOSE = 1;
const MOUTH_LEFT = 61;
const MOUTH_RIGHT = 291;

const CALIBRATION_TARGET = 30;
const MOVEMENT_WINDOW = 50;
const STATIC_THRESHOLD = 0.001;
const EAR_BLINK_THRESHOLD = 0.19;
const EAR_DYNAMIC_MULTIPLIER = 0.82;
const EAR_DYNAMIC_MAX = 0.26;
const BLINK_DROP_MIN = 0.04;
const TURN_THRESHOLD = 0.06;
const SMILE_THRESHOLD = 0.045;
const TURN_HOLD_FRAMES = 3;
const SMILE_HOLD_FRAMES = 3;
const BLINK_MIN_CLOSED_FRAMES = 1;
const BLINK_MIN_OPEN_FRAMES = 1;

const getEAR = (landmarks, eye) => {
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const [p1, p2, p3, p4, p5, p6] = eye.map((index) => landmarks[index]);
  const verticalA = distance(p2, p6);
  const verticalB = distance(p3, p5);
  const horizontal = distance(p1, p4);
  return (verticalA + verticalB) / (2 * horizontal);
};

const getHorizontalDirection = (landmarks) => {
  const isMirrored = landmarks[33].x > landmarks[263].x;
  return isMirrored ? 1 : -1;
};

export default function useLiveness(videoRef) {
  const [status, setStatus] = useState("Initializing...");

  const neutralNoseX = useRef(null);
  const calibrationFrames = useRef(0);
  const calibrationSum = useRef(0);
  const openEyeEARSum = useRef(0);
  const openEyeEARBaseline = useRef(null);
  const mouthWidthSum = useRef(0);
  const mouthBaseline = useRef(null);

  const blinkDetected = useRef(false);
  const blinkClosedPhase = useRef(false);
  const leftTurn = useRef(false);
  const rightTurn = useRef(false);
  const smileDetected = useRef(false);
  const eyeClosedFrames = useRef(0);
  const eyeOpenFrames = useRef(0);
  const leftTurnFrames = useRef(0);
  const rightTurnFrames = useRef(0);
  const smileFrames = useRef(0);

  const lastNoseX = useRef(null);
  const movementHistory = useRef([]);
  const frameCount = useRef(0);
  const verificationLocked = useRef(false);

  const resetState = () => {
    verificationLocked.current = false;
    neutralNoseX.current = null;
    calibrationFrames.current = 0;
    calibrationSum.current = 0;
    openEyeEARSum.current = 0;
    openEyeEARBaseline.current = null;
    mouthWidthSum.current = 0;
    mouthBaseline.current = null;
    blinkDetected.current = false;
    blinkClosedPhase.current = false;
    leftTurn.current = false;
    rightTurn.current = false;
    smileDetected.current = false;
    eyeClosedFrames.current = 0;
    eyeOpenFrames.current = 0;
    leftTurnFrames.current = 0;
    rightTurnFrames.current = 0;
    smileFrames.current = 0;
    lastNoseX.current = null;
    movementHistory.current = [];
    frameCount.current = 0;
  };

  useEffect(() => {
    if (!videoRef.current) return;

    const faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    faceMesh.onResults((results) => {
      if (verificationLocked.current) {
        return;
      }

      if (!results.multiFaceLandmarks) {
        resetState();
        setStatus("No Face Detected");
        return;
      }

      const landmarks = results.multiFaceLandmarks[0];
      const nose = landmarks[NOSE];
      const mouthWidth = Math.abs(
        landmarks[MOUTH_RIGHT].x - landmarks[MOUTH_LEFT].x
      );
      const avgEAR =
        (getEAR(landmarks, LEFT_EYE) + getEAR(landmarks, RIGHT_EYE)) / 2;

      if (calibrationFrames.current < CALIBRATION_TARGET) {
        calibrationSum.current += nose.x;
        openEyeEARSum.current += avgEAR;
        mouthWidthSum.current += mouthWidth;
        calibrationFrames.current += 1;
        neutralNoseX.current = calibrationSum.current / calibrationFrames.current;
        openEyeEARBaseline.current =
          openEyeEARSum.current / calibrationFrames.current;
        mouthBaseline.current = mouthWidthSum.current / calibrationFrames.current;
        setStatus("Look Straight - Calibrating (eyes open)...");
        return;
      }

      const dynamicBlinkThreshold = Math.min(
        EAR_DYNAMIC_MAX,
        Math.max(
          EAR_BLINK_THRESHOLD,
          (openEyeEARBaseline.current || EAR_BLINK_THRESHOLD) *
            EAR_DYNAMIC_MULTIPLIER
        )
      );
      const dynamicBlinkReopen = dynamicBlinkThreshold + 0.015;
      const baselineEar = openEyeEARBaseline.current || EAR_BLINK_THRESHOLD;
      const isEyeClosed =
        avgEAR < dynamicBlinkThreshold || baselineEar - avgEAR > BLINK_DROP_MIN;

      if (isEyeClosed) {
        eyeClosedFrames.current += 1;
        eyeOpenFrames.current = 0;
        if (eyeClosedFrames.current >= BLINK_MIN_CLOSED_FRAMES) {
          blinkClosedPhase.current = true;
        }
      } else {
        if (avgEAR > dynamicBlinkReopen) {
          eyeOpenFrames.current += 1;
        }
        if (blinkClosedPhase.current && eyeOpenFrames.current >= BLINK_MIN_OPEN_FRAMES) {
          blinkDetected.current = true;
          blinkClosedPhase.current = false;
        }
        eyeClosedFrames.current = 0;
      }

      const horizontalDirection = getHorizontalDirection(landmarks);
      const movement = (nose.x - neutralNoseX.current) * horizontalDirection;
      if (movement > TURN_THRESHOLD) {
        rightTurnFrames.current += 1;
      } else {
        rightTurnFrames.current = 0;
      }
      if (movement < -TURN_THRESHOLD) {
        leftTurnFrames.current += 1;
      } else {
        leftTurnFrames.current = 0;
      }
      if (rightTurnFrames.current >= TURN_HOLD_FRAMES) rightTurn.current = true;
      if (leftTurnFrames.current >= TURN_HOLD_FRAMES) leftTurn.current = true;

      const mouthTarget = Math.max(
        SMILE_THRESHOLD,
        (mouthBaseline.current || SMILE_THRESHOLD) * 1.25
      );
      if (mouthWidth > mouthTarget) {
        smileFrames.current += 1;
      } else {
        smileFrames.current = 0;
      }
      if (smileFrames.current >= SMILE_HOLD_FRAMES) smileDetected.current = true;

      if (lastNoseX.current !== null) {
        movementHistory.current.push(Math.abs(nose.x - lastNoseX.current));
        if (movementHistory.current.length > MOVEMENT_WINDOW) {
          movementHistory.current.shift();
        }
      }
      lastNoseX.current = nose.x;
      frameCount.current += 1;

      const avgMove = movementHistory.current.length
        ? movementHistory.current.reduce((a, b) => a + b, 0) /
          movementHistory.current.length
        : 0;

      if (
        frameCount.current > 100 &&
        avgMove < STATIC_THRESHOLD &&
        !blinkDetected.current
      ) {
        setStatus("Fake Image Detected");
        return;
      }

      if (!blinkDetected.current) {
        setStatus("Please Blink");
      } else if (!leftTurn.current) {
        setStatus("Turn Left");
      } else if (!rightTurn.current) {
        setStatus("Turn Right");
      } else if (!smileDetected.current) {
        setStatus("Please Smile");
      } else {
        verificationLocked.current = true;
        setStatus("Face has been detected");
      }
    });

    const interval = setInterval(async () => {
      if (videoRef.current) {
        await faceMesh.send({ image: videoRef.current });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [videoRef]);

  return status;
}
