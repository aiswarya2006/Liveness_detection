import React, { useEffect, useRef, useState } from "react";
import { Camera } from "@mediapipe/camera_utils";
import { startWebcam } from "../../hooks/useCamera";
import { createFaceMesh } from "../detection/FaceMeshDetector";
import { getBoundingBox } from "../detection/CropUtils";
import { drawBox } from "../../utils/drawUtils";
import { CAMERA_WIDTH, CAMERA_HEIGHT } from "../../utils/constants";
import "./CameraStyles.css";

const LEFT_EYE_POINTS = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE_POINTS = [362, 385, 387, 263, 373, 380];
const BASE_VERIFICATION_STEPS = [
  {
    key: "blink",
    label: "Blink",
    shortLabel: "Blink once",
    hint: "Close both eyes once, then open them again.",
    visual: "O O -> - - -> O O",
    demo: "Blink one time naturally.",
    emoji: "😉",
  },
  {
    key: "left",
    label: "Turn Left",
    shortLabel: "Turn left",
    hint: "Slowly turn your face to your left side.",
    visual: "<- FACE",
    demo: "Turn left and hold for a moment.",
    emoji: "🙂",
  },
  {
    key: "right",
    label: "Turn Right",
    shortLabel: "Turn right",
    hint: "Slowly turn your face to your right side.",
    visual: "FACE ->",
    demo: "Turn right and hold for a moment.",
    emoji: "🙂",
  },
  {
    key: "smile",
    label: "Smile",
    shortLabel: "Smile",
    hint: "Give a gentle smile to finish the check.",
    visual: ": )",
    demo: "A small natural smile is enough.",
    emoji: "😊",
  },
];

const shuffleSteps = (steps) => {
  const shuffled = [...steps];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
};

const STATUS_COPY = {
  starting: {
    title: "Starting camera",
    hint: "Please wait while we get the camera ready.",
  },
  noFace: {
    title: "Show your face",
    hint: "Place your face inside the camera frame and look forward.",
  },
  calibrating: {
    title: "Hold still",
    hint: "Keep your head straight for a moment so we can prepare the check.",
  },
  verified: {
    title: "Face verified",
    hint: "You have completed the liveness check successfully.",
  },
  stopped: {
    title: "Check stopped",
    hint: "The session stopped for safety. Press retry and try again in good light.",
  },
};

const calculateEAR = (landmarks, eyeIndices) => {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const [p1, p2, p3, p4, p5, p6] = eyeIndices.map((i) => landmarks[i]);
  return (d(p2, p6) + d(p3, p5)) / (2 * d(p1, p4));
};

export default function FaceCamera() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const stopped = useRef(false);
  const timeoutRef = useRef(null);

  const blinkFrames = useRef(0);
  const leftFrames = useRef(0);
  const rightFrames = useRef(0);
  const smileFrames = useRef(0);

  const blinkDone = useRef(false);
  const leftDone = useRef(false);
  const rightDone = useRef(false);
  const smileDone = useRef(false);

  const calibrationFrames = useRef(0);
  const smoothEAR = useRef([]);

  const prevLandmarks = useRef(null);
  const fakeFrames = useRef(0);

  const [step, setStep] = useState("Starting...");
  const [verified, setVerified] = useState(false);
  const [verificationSteps, setVerificationSteps] = useState(() =>
    shuffleSteps(BASE_VERIFICATION_STEPS)
  );

  const completedSteps = [
    blinkDone.current,
    leftDone.current,
    rightDone.current,
    smileDone.current,
  ].filter(Boolean).length;
  const progressValue = verified
    ? 100
    : (completedSteps / verificationSteps.length) * 100;
  const statusTone = stopped.current ? "error" : verified ? "success" : "active";
  const currentVisualStep =
    verificationSteps.find((item) => step.startsWith(item.label)) || null;
  const currentStepNumber = currentVisualStep
    ? verificationSteps.findIndex((item) => item.key === currentVisualStep.key) + 1
    : 0;
  const nextVisualStep =
    currentStepNumber > 0 && currentStepNumber < verificationSteps.length
      ? verificationSteps[currentStepNumber]
      : null;

  const statusContent = verified
    ? STATUS_COPY.verified
    : stopped.current
      ? STATUS_COPY.stopped
      : step === "Starting..."
        ? STATUS_COPY.starting
        : step === "Show your face"
          ? STATUS_COPY.noFace
          : step === "Hold still..."
            ? STATUS_COPY.calibrating
            : currentVisualStep
              ? {
                  title: currentVisualStep.shortLabel,
                  hint: currentVisualStep.hint,
                }
              : {
                  title: "Follow the instructions",
                  hint: "Complete each step slowly and clearly.",
                };

  useEffect(() => {
    startCamera();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    setVerificationSteps(shuffleSteps(BASE_VERIFICATION_STEPS));
    await startWebcam(videoRef);

    timeoutRef.current = setTimeout(() => {
      if (!verified && !stopped.current) {
        stopCamera("Fake image detected. Verification took too long");
      }
    }, 15000);

    const faceMesh = createFaceMesh(onResults);

    new Camera(videoRef.current, {
      onFrame: async () => {
        if (!stopped.current) {
          await faceMesh.send({ image: videoRef.current });
        }
      },
      width: CAMERA_WIDTH,
      height: CAMERA_HEIGHT,
    }).start();
  };

  const stopCamera = (message = "Fake detected. Camera stopped") => {
    stopped.current = true;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
    }

    setVerified(false);
    setStep(message);
  };

  const checkFakeFace = (landmarks, ctx) => {
    if (!prevLandmarks.current) {
      prevLandmarks.current = landmarks;
      return false;
    }

    let movement = 0;

    for (let i = 0; i < landmarks.length; i++) {
      const dx = landmarks[i].x - prevLandmarks.current[i].x;
      const dy = landmarks[i].y - prevLandmarks.current[i].y;
      movement += Math.sqrt(dx * dx + dy * dy);
    }

    prevLandmarks.current = landmarks;

    if (movement < 0.0015) {
      fakeFrames.current++;
    } else {
      fakeFrames.current = 0;
    }

    const data = ctx.getImageData(0, 0, 60, 60).data;
    let brightness = 0;

    for (let i = 0; i < data.length; i += 4) {
      brightness += data[i];
    }
    brightness /= data.length / 4;

    if (!checkFakeFace.prevBrightness) {
      checkFakeFace.prevBrightness = brightness;
    }

    const flicker = Math.abs(brightness - checkFakeFace.prevBrightness);
    checkFakeFace.prevBrightness = brightness;

    const depth = Math.abs(landmarks[1].z);

    if (fakeFrames.current > 20 || flicker > 20 || depth < 0.008) {
      stopCamera();
      return true;
    }

    return false;
  };

  const onResults = (results) => {
    if (stopped.current) return;

    const ctx = canvasRef.current.getContext("2d");

    ctx.clearRect(0, 0, CAMERA_WIDTH, CAMERA_HEIGHT);
    ctx.drawImage(results.image, 0, 0, CAMERA_WIDTH, CAMERA_HEIGHT);

    if (!results.multiFaceLandmarks?.length) {
      setStep("Show your face");
      return;
    }

    if (results.multiFaceLandmarks.length > 1) {
      stopCamera();
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];

    if (checkFakeFace(landmarks, ctx)) return;

    const box = getBoundingBox(landmarks, CAMERA_WIDTH, CAMERA_HEIGHT);
    drawBox(ctx, box);

    if (calibrationFrames.current < 30) {
      calibrationFrames.current++;
      setStep("Hold still...");
      return;
    }

    const noseX = landmarks[1].x;

    if (
      (step === "Blink" && (noseX > 0.6 || noseX < 0.4)) ||
      (step === "Turn Left" && noseX < 0.35) ||
      (step === "Turn Right" && noseX > 0.65)
    ) {
      stopCamera();
      return;
    }

    const ear =
      (calculateEAR(landmarks, LEFT_EYE_POINTS) +
        calculateEAR(landmarks, RIGHT_EYE_POINTS)) /
      2;

    smoothEAR.current.push(ear);
    if (smoothEAR.current.length > 5) smoothEAR.current.shift();

    const avgEAR =
      smoothEAR.current.reduce((a, b) => a + b, 0) / smoothEAR.current.length;

    if (avgEAR < 0.22) {
      blinkFrames.current++;
    } else {
      if (blinkFrames.current > 5) blinkDone.current = true;
      blinkFrames.current = 0;
    }

    if (noseX > 0.65) {
      leftFrames.current++;
    } else {
      if (leftFrames.current > 5) leftDone.current = true;
      leftFrames.current = 0;
    }

    if (noseX < 0.35) {
      rightFrames.current++;
    } else {
      if (rightFrames.current > 5) rightDone.current = true;
      rightFrames.current = 0;
    }

    const mouthWidth = Math.abs(landmarks[291].x - landmarks[61].x);
    const mouthHeight = Math.abs(landmarks[13].y - landmarks[14].y);
    const faceWidth = Math.abs(landmarks[454].x - landmarks[234].x);
    const smileStretch = mouthWidth / (faceWidth + 0.001);
    const mouthOpenRatio = mouthHeight / (faceWidth + 0.001);
    const smileRatio = mouthWidth / (mouthHeight + 0.001);
    const isGentleSmile =
      smileStretch > 0.28 && (smileRatio > 4 || mouthOpenRatio < 0.08);

    if (isGentleSmile) {
      smileFrames.current++;
    } else {
      if (smileFrames.current > 4) smileDone.current = true;
      smileFrames.current = 0;
    }

    const stepCompletionMap = {
      blink: blinkDone.current,
      left: leftDone.current,
      right: rightDone.current,
      smile: smileDone.current,
    };

    const nextPendingStep = verificationSteps.find(
      (item) => !stepCompletionMap[item.key]
    );

    if (nextPendingStep) {
      return setStep(nextPendingStep.label);
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setStep("Face Verified");
    setVerified(true);
  };

  return (
    <div className="mainContainer">
      <div className="heroCopy">
        <p className="eyebrow">Secure Identity Check</p>
        <h1 className="mainTitle">Liveness Detection</h1>
        <p className="heroSubtitle">
          Follow the simple steps on the right. Move slowly and keep your face inside
          the camera frame.
        </p>
      </div>

      <div className="cameraSection">
        <div className="cameraWrapper">
          <div className="cameraGlow" />

          <canvas
            ref={canvasRef}
            width={CAMERA_WIDTH}
            height={CAMERA_HEIGHT}
            className="cameraCanvas"
          />
        </div>

        <div className="floatingCard">
          <div className="cardHeader">
            <div>
              <p className="cardEyebrow">Live Session</p>
              <h2>Liveness Verification</h2>
            </div>
            <span className={`statusBadge ${statusTone}`}>
              {verified ? "Done" : stopped.current ? "Stopped" : "Live"}
            </span>
          </div>

          <div className="topProgress" aria-hidden="true">
            <div
              className="topProgressFill"
              style={{ width: `${progressValue}%` }}
            />
          </div>

          <div className="progressSummary">
            <span>
              {verified
                ? "Completed"
                : `${completedSteps} of ${verificationSteps.length} finished`}
            </span>
            <span>
              {verified
                ? "All steps done"
                : `Step ${currentStepNumber || 1} of ${verificationSteps.length}`}
            </span>
          </div>

          <div className={`statusPanel ${statusTone}`}>
            <p className="statusLabel">What To Do Now</p>
            <p className="statusText">{statusContent.title}</p>
            <p className="statusHint">{statusContent.hint}</p>
          </div>

          {!verified && !stopped.current && currentVisualStep && (
            <div className="instructionShowcase">
              <p className="instructionLabel">Example</p>
              <div className="instructionVisual">
                <div className="instructionFace" aria-hidden="true">
                  {currentVisualStep.key === "left" && (
                    <span className="emojiDirection">
                      <span className="directionArrow">←</span>
                      <span>{currentVisualStep.emoji}</span>
                    </span>
                  )}
                  {currentVisualStep.key === "right" && (
                    <span className="emojiDirection">
                      <span>{currentVisualStep.emoji}</span>
                      <span className="directionArrow">→</span>
                    </span>
                  )}
                  {currentVisualStep.key !== "left" &&
                    currentVisualStep.key !== "right" &&
                    currentVisualStep.emoji}
                </div>
                <div className="instructionEmoji" aria-hidden="true">
                  {currentVisualStep.visual}
                </div>
                <p className="instructionTitle">{currentVisualStep.shortLabel}</p>
                <p className="instructionDemo">{currentVisualStep.demo}</p>
              </div>
            </div>
          )}

          {!verified && !stopped.current && nextVisualStep && (
            <div className="nextStepCard">
              <p className="nextStepLabel">Next Step</p>
              <div className="nextStepPreview">
                <span className="nextStepEmoji" aria-hidden="true">
                  {nextVisualStep.emoji}
                </span>
                <div>
                  <p className="nextStepTitle">{nextVisualStep.shortLabel}</p>
                  <p className="nextStepHint">{nextVisualStep.hint}</p>
                </div>
              </div>
            </div>
          )}

          <div className="quickTips">
            <p className="quickTipsTitle">Helpful Tips</p>
            <ul className="tipsList">
              <li>Look straight at the camera before each step.</li>
              <li>Move slowly so the camera can follow your face.</li>
              <li>Use good light and keep only one face in view.</li>
            </ul>
          </div>

          <div className="stepsGrid">
            {verificationSteps.map((item, index) => {
              const isDone =
                (item.key === "blink" && blinkDone.current) ||
                (item.key === "left" && leftDone.current) ||
                (item.key === "right" && rightDone.current) ||
                (item.key === "smile" && smileDone.current);
              const isActive = !isDone && step.startsWith(item.label);
              const itemTone = isDone ? "done" : isActive ? "active" : "idle";

              return (
                <div key={item.key} className={`stepItem ${itemTone}`}>
                  <span className="stepIndex">{isDone ? "OK" : index + 1}</span>
                  <div>
                    <p className="stepName">{item.shortLabel}</p>
                    <p className="stepHint">{item.hint}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {stopped.current && (
            <button className="retryButton" onClick={() => window.location.reload()}>
              Retry
            </button>
          )}
        </div>
      </div>

      <video ref={videoRef} style={{ display: "none" }} />
    </div>
  );
}
