import React, { useEffect, useRef, useState } from "react";
import { Camera } from "@mediapipe/camera_utils";
import { startWebcam } from "../../hooks/useCamera";
import { createFaceMesh } from "../detection/FaceMeshDetector";
import { getBoundingBox } from "../detection/CropUtils";
import { drawBox } from "../../utils/drawUtils";

import {
  CAMERA_WIDTH,
  CAMERA_HEIGHT,
} from "../../utils/constants";

import "./CameraStyles.css";

const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

const MOUTH_LEFT = 61;
const MOUTH_RIGHT = 291;
const MOUTH_TOP = 13;
const MOUTH_BOTTOM = 14;

const EYE_THRESHOLD = 0.26;
const TURN_THRESHOLD = 0.035;
const SMILE_THRESHOLD = 4.0;
const MAX_TIME = 45;

const CHALLENGES = [
  "BLINK",
  "TURN_LEFT",
  "TURN_RIGHT",
  "SMILE",
];

const INITIAL_CHALLENGE = "null";

const CHALLENGE_DETAILS = {
  BLINK: {
    title: "Blink",
    instruction: "Blink once to confirm movement",
    short: "blink",
  },
  TURN_LEFT: {
    title: "Turn Left",
    instruction: "Turn your face gently to the left",
    short: "left turn",
  },
  TURN_RIGHT: {
    title: "Turn Right",
    instruction: "Turn your face gently to the right",
    short: "right turn",
  },
  SMILE: {
    title: "Smile",
    instruction: "Smile clearly for the camera",
    short: "smile",
  },
};

export default function FaceCamera() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);

  const [step, setStep] = useState(
  "Preparing Verification"
);
const [instruction, setInstruction] =
  useState(
    "Generating random challenge..."
  );
  const [timeLeft, setTimeLeft] = useState(MAX_TIME);
  const [verified, setVerified] = useState(false);
  const [failed, setFailed] = useState(false);
const [currentChallenge, setCurrentChallenge] =
  useState(null);
  const [completedItems, setCompletedItems] =
    useState([]);

  const blink = useRef(false);
  const leftTurn = useRef(false);
  const rightTurn = useRef(false);
  const smile = useRef(false);
  const completed = useRef(new Set());

  const verifiedRef = useRef(false);
  const failedRef = useRef(false);
  const currentChallengeRef = useRef(
    INITIAL_CHALLENGE
  );

  const progress =
    (completedItems.length / CHALLENGES.length) * 100;
  const timePercent = (timeLeft / MAX_TIME) * 100;
  const statusType = verified
    ? "success"
    : failed
    ? "error"
    : "active";
  const statusText = verified
    ? "Verified"
    : failed
    ? "Failed"
    : "Processing";

useEffect(() => {
  generateRandomChallenge();
}, []);
  useEffect(() => {
    failedRef.current = failed;
  }, [failed]);

  useEffect(() => {
    if (verified || failed) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          failedRef.current = true;
          setFailed(true);
          setStep("Verification Failed");
          setInstruction("Time limit exceeded");
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [verified, failed]);

  function setActiveChallenge(challenge) {
    const details = CHALLENGE_DETAILS[challenge];

    currentChallengeRef.current = challenge;
    setCurrentChallenge(challenge);
    setStep(details.title);
    setInstruction(details.instruction);
  }

  function generateRandomChallenge() {
    const remaining = CHALLENGES.filter(
      (item) => !completed.current.has(item)
    );

    if (remaining.length === 0) {
      verifiedRef.current = true;
      currentChallengeRef.current = null;
      setCurrentChallenge(null);
      setVerified(true);
      setStep("Face Verified");
      setInstruction("Real human verified successfully");
      return;
    }

    const random =
      remaining[
        Math.floor(Math.random() * remaining.length)
      ];

    setActiveChallenge(random);
  }

  async function initCamera() {
    await startWebcam(videoRef);

    const faceMesh = createFaceMesh(onResults);

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) {
          await faceMesh.send({
            image: videoRef.current,
          });
        }
      },
      width: CAMERA_WIDTH,
      height: CAMERA_HEIGHT,
    });

    camera.start();
    cameraRef.current = camera;

    return videoRef.current;
  }

  const distance = (a, b) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const EAR = (lm, eye) => {
    const p1 = lm[eye[0]];
    const p2 = lm[eye[1]];
    const p3 = lm[eye[2]];
    const p4 = lm[eye[3]];
    const p5 = lm[eye[4]];
    const p6 = lm[eye[5]];

    return (
      (distance(p2, p6) + distance(p3, p5)) /
      (2 * distance(p1, p4))
    );
  };

  const completeChallenge = (action) => {
    if (currentChallengeRef.current !== action) {
      return;
    }

    completed.current.add(action);
    setCompletedItems(
      Array.from(completed.current)
    );

    if (action === "BLINK") blink.current = true;
    if (action === "TURN_LEFT") leftTurn.current = true;
    if (action === "TURN_RIGHT") rightTurn.current = true;
    if (action === "SMILE") smile.current = true;

    if (completed.current.size === CHALLENGES.length) {
      verifiedRef.current = true;
      currentChallengeRef.current = null;
      setCurrentChallenge(null);
      setVerified(true);
      setStep("Face Verified");
      setInstruction("Real human verified successfully");
      return;
    }

    const remaining = CHALLENGES.filter(
      (item) => !completed.current.has(item)
    );
    const random =
      remaining[
        Math.floor(Math.random() * remaining.length)
      ];

    currentChallengeRef.current = null;
    setCurrentChallenge(null);
    setStep(`${CHALLENGE_DETAILS[action].title} Complete`);
    setInstruction("Great. Loading next check...");

    setTimeout(() => {
      setActiveChallenge(random);
    }, 1200);
  };

  const onResults = (results) => {
    if (verifiedRef.current || failedRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(
      results.image,
      -CAMERA_WIDTH,
      0,
      CAMERA_WIDTH,
      CAMERA_HEIGHT
    );
    ctx.restore();

    if (!results.multiFaceLandmarks) {
      setStep("No Face");
      setInstruction("Show your face clearly");
      return;
    }

    if (results.multiFaceLandmarks.length > 1) {
      setStep("Multiple Faces Detected");
      setInstruction("Only one face allowed");
      return;
    }

    let bestFace = null;
    let bestArea = 0;
    let bestBox = null;

    results.multiFaceLandmarks.forEach((lm) => {
      const box = getBoundingBox(
        lm,
        CAMERA_WIDTH,
        CAMERA_HEIGHT
      );
      const area = box.w * box.h;

      if (area > bestArea) {
        bestArea = area;
        bestFace = lm;
        bestBox = box;
      }
    });

    const lm = bestFace;
    const box = bestBox;

    drawBox(ctx, box);

    const minArea =
      CAMERA_WIDTH * CAMERA_HEIGHT * 0.12;

    if (box.w * box.h < minArea) {
      setStep("Move Closer");
      setInstruction("Bring your face closer");
      return;
    }

    const leftEAR = EAR(lm, LEFT_EYE);
    const rightEAR = EAR(lm, RIGHT_EYE);
    const avgEAR = (leftEAR + rightEAR) / 2;

    if (
      avgEAR < EYE_THRESHOLD &&
      currentChallengeRef.current === "BLINK" &&
      !completed.current.has("BLINK")
    ) {
      completeChallenge("BLINK");
    }

    const nose = lm[1];
    const leftFace = lm[234];
    const rightFace = lm[454];
    const centerX = (leftFace.x + rightFace.x) / 2;
    const diff = nose.x - centerX;

    if (
      diff > TURN_THRESHOLD &&
      currentChallengeRef.current === "TURN_LEFT" &&
      !completed.current.has("TURN_LEFT")
    ) {
      completeChallenge("TURN_LEFT");
    }

    if (
      diff < -TURN_THRESHOLD &&
      currentChallengeRef.current === "TURN_RIGHT" &&
      !completed.current.has("TURN_RIGHT")
    ) {
      completeChallenge("TURN_RIGHT");
    }

    const mouthWidth = distance(
      lm[MOUTH_LEFT],
      lm[MOUTH_RIGHT]
    );
    const mouthHeight = distance(
      lm[MOUTH_TOP],
      lm[MOUTH_BOTTOM]
    );
    const smileRatio = mouthWidth / mouthHeight;

    if (
      smileRatio > SMILE_THRESHOLD &&
      currentChallengeRef.current === "SMILE" &&
      !completed.current.has("SMILE")
    ) {
      completeChallenge("SMILE");
    }
  };

  const resetSystem = () => {
    blink.current = false;
    leftTurn.current = false;
    rightTurn.current = false;
    smile.current = false;
    completed.current.clear();
    currentChallengeRef.current = null;
    verifiedRef.current = false;
    failedRef.current = false;

    setVerified(false);
    setFailed(false);
    setTimeLeft(MAX_TIME);
    setCompletedItems([]);
    generateRandomChallenge();
  };

  useEffect(() => {
    let mountedVideo = null;

    initCamera().then((video) => {
      mountedVideo = video;
    });

    return () => {
      const camera = cameraRef.current;

      if (camera) {
        camera.stop();
      }

      if (mountedVideo?.srcObject) {
        mountedVideo.srcObject
          .getTracks()
          .forEach((track) => track.stop());
      }
    };
    // Camera setup runs once; live verification state is read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="livenessShell">
      <div className="heroCopy">
        <p className="eyebrow">Final year project</p>
        <h1 className="mainTitle">
          Active Liveness Detection
        </h1>
        <p className="heroSubtitle">
          A real-time face verification interface with randomized
          motion challenges and instant status feedback.
        </p>
      </div>

      <div className="cameraLayout">
        <div className="cameraStage">
          <div className="cameraHeader">
            <div>
              <p className="stageLabel">Secure camera scan</p>
              <h2>{step}</h2>
            </div>
            <div className={`statusBadge ${statusType}`}>
              {statusText}
            </div>
          </div>

          <div className="cameraFrame">
            <div className="corner topLeft" />
            <div className="corner topRight" />
            <div className="corner bottomLeft" />
            <div className="corner bottomRight" />
            <div className="scanLine" />

            <video
              ref={videoRef}
              className="hiddenVideo"
              width={CAMERA_WIDTH}
              height={CAMERA_HEIGHT}
            />

            <canvas
              ref={canvasRef}
              className="cameraCanvas"
              width={CAMERA_WIDTH}
              height={CAMERA_HEIGHT}
            />
          </div>

          <div className="timerRow">
            <span>
              Time left <strong>{timeLeft}s</strong>
            </span>
            <div className="timerTrack">
              <div
                className={`timerFill ${statusType}`}
                style={{ width: `${timePercent}%` }}
              />
            </div>
          </div>
        </div>

        <aside className="controlPanel">
          <div className="panelTop">
            <p className="cardEyebrow">
              Verification console
            </p>
            <button
              className="resetButton"
              type="button"
              onClick={resetSystem}
            >
              Reset
            </button>
          </div>

          <div className={`statusPanel ${statusType}`}>
            <p className="statusLabel">
              Current instruction
            </p>
            <h3>{instruction}</h3>
            <p>
              {verified
                ? "All motion checks are complete."
                : failed
                ? "The verification window has expired."
                : currentChallenge
                ? `Complete the ${CHALLENGE_DETAILS[
                    currentChallenge
                  ].short} check to continue.`
                : "Preparing the next check."}
            </p>
          </div>

          <div className="progressBlock">
            <div className="progressSummary">
              <span>Progress</span>
              <strong>
                {completedItems.length}/{CHALLENGES.length}
              </strong>
            </div>
            <div className="topProgress">
              <div
                className="topProgressFill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="stepsGrid">
            {CHALLENGES.map((challenge, index) => {
              const details =
                CHALLENGE_DETAILS[challenge];
              const done =
                completedItems.includes(challenge);
              const active =
                currentChallenge === challenge && !done;

              return (
                <div
                  className={`stepItem ${
                    done ? "done" : ""
                  } ${active ? "active" : ""}`}
                  key={challenge}
                >
                  <span className="stepIndex">
                    {done ? "OK" : index + 1}
                  </span>
                  <div>
                    <p className="stepName">
                      {details.title}
                    </p>
                    <p className="stepHint">
                      {done
                        ? "Completed"
                        : active
                        ? "Waiting for action"
                        : "Pending"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}
