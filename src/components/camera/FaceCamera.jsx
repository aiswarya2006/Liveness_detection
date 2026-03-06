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

const EYE_CLOSED_THRESHOLD = 0.19;
const HEAD_TURN_THRESHOLD = 0.06;
const SMILE_THRESHOLD = 0.045;

const CALIBRATION_TARGET = 40;

const calculateEAR = (landmarks, eyeIndices) => {
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const [p1, p2, p3, p4, p5, p6] = eyeIndices.map(
    (index) => landmarks[index]
  );

  return (distance(p2, p6) + distance(p3, p5)) / (2 * distance(p1, p4));
};

export default function FaceCamera() {

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);

  const calibrationFramesRef = useRef(0);

  const blinkDetectedRef = useRef(false);
  const turnedLeftRef = useRef(false);
  const turnedRightRef = useRef(false);
  const smileDetectedRef = useRef(false);

  const [step, setStep] = useState("Starting Camera...");
  const [instruction, setInstruction] = useState("Allow camera access");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    initCamera();

    return () => {
      if (cameraRef.current) cameraRef.current.stop();

      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject
          .getTracks()
          .forEach((track) => track.stop());
      }
    };
  }, []);

  const resetSystem = () => {

    calibrationFramesRef.current = 0;
    blinkDetectedRef.current = false;
    turnedLeftRef.current = false;
    turnedRightRef.current = false;
    smileDetectedRef.current = false;

    setStep("System Reset");
    setInstruction("Look straight for calibration");
    setVerified(false);
  };

  const initCamera = async () => {

    await startWebcam(videoRef);

    const faceMesh = createFaceMesh(onResults);

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) {
          await faceMesh.send({ image: videoRef.current });
        }
      },
      width: CAMERA_WIDTH,
      height: CAMERA_HEIGHT,
    });

    camera.start();
    cameraRef.current = camera;
  };

  const onResults = (results) => {

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, CAMERA_WIDTH, CAMERA_HEIGHT);

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      setStep("No Face Detected");
      setInstruction("Show your face");
      setVerified(false);
      return;
    }

    // -------- CLOSEST FACE DETECTION --------

    let largestFace = null;
    let largestArea = 0;
    let largestBox = null;

    results.multiFaceLandmarks.forEach((landmarks) => {

      const box = getBoundingBox(landmarks, CAMERA_WIDTH, CAMERA_HEIGHT);
      const area = box.w * box.h;

      if (area > largestArea) {
        largestArea = area;
        largestFace = landmarks;
        largestBox = box;
      }
    });

    const landmarks = largestFace;
    const box = largestBox;

    drawBox(ctx, box);

    const faceArea = box.w * box.h;

    const minArea = CAMERA_WIDTH * CAMERA_HEIGHT * 0.15;

    if (faceArea < minArea) {
      setStep("Face Too Far");
      setInstruction("Move closer to the camera");
      return;
    }

    const avgEAR =
      (calculateEAR(landmarks, LEFT_EYE_POINTS) +
        calculateEAR(landmarks, RIGHT_EYE_POINTS)) / 2;

    const nose = landmarks[1];

    const mouthWidth = Math.abs(landmarks[291].x - landmarks[61].x);

    if (calibrationFramesRef.current < CALIBRATION_TARGET) {

      calibrationFramesRef.current++;

      setStep("Calibration");
      setInstruction("Look straight with eyes open");

      return;
    }

    // Blink Detection
    if (avgEAR < EYE_CLOSED_THRESHOLD) {
      blinkDetectedRef.current = true;
    }

    const noseMovement = nose.x - 0.5;

    // Head Left
    if (noseMovement < -HEAD_TURN_THRESHOLD) {
      turnedLeftRef.current = true;
    }

    // Head Right
    if (noseMovement > HEAD_TURN_THRESHOLD) {
      turnedRightRef.current = true;
    }

    // Smile Detection
    if (mouthWidth > SMILE_THRESHOLD) {
      smileDetectedRef.current = true;
    }

    if (!blinkDetectedRef.current) {
      setStep("Blink");
      setInstruction("Please blink");
      return;
    }

    if (!turnedLeftRef.current) {
      setStep("Turn Left");
      setInstruction("Turn your face left");
      return;
    }

    if (!turnedRightRef.current) {
      setStep("Turn Right");
      setInstruction("Turn your face right");
      return;
    }

    if (!smileDetectedRef.current) {
      setStep("Smile");
      setInstruction("Please smile");
      return;
    }

    setStep("Face Verified");
    setInstruction("Verification Completed");
    setVerified(true);
  };

  return (
    <div className="cameraWrapper">

      <h2>Professional Liveness Check</h2>

      <h3>{step}</h3>
      <p>{instruction}</p>

      <p>
        Status:
        <strong style={{ color: verified ? "lime" : "red" }}>
          {verified ? " VERIFIED" : " NOT VERIFIED"}
        </strong>
      </p>

      <button onClick={resetSystem}>Reset</button>

      <div style={{ position: "relative" }}>

        <video
          ref={videoRef}
          style={{ display: "none" }}
          width={CAMERA_WIDTH}
          height={CAMERA_HEIGHT}
        />

        <canvas
          ref={canvasRef}
          width={CAMERA_WIDTH}
          height={CAMERA_HEIGHT}
          style={{ borderRadius: "12px" }}
        />

      </div>

    </div>
  );
}