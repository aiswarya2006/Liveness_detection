import React, { useEffect, useRef, useState } from "react";
import { Camera } from "@mediapipe/camera_utils";

import { startWebcam } from "../../hooks/useCamera";
import { createFaceMesh } from "../detection/FaceMeshDetector";
import { getBoundingBox } from "../detection/CropUtils";
import { drawBox } from "../../utils/drawUtils";
import { CAMERA_WIDTH, CAMERA_HEIGHT } from "../../utils/constants";

import CameraCanvas from "./CameraCanvas";
import "./CameraStyles.css";

export default function FaceCamera() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const lastProcessTime = useRef(0);//by ais
const stableFrameCount = useRef(0);//ais
  // ⭐ PROFESSIONAL OUTPUT STATES
  const [step, setStep] = useState("Starting Camera...");
  const [instruction, setInstruction] = useState("Please allow camera access");
  const [verified, setVerified] = useState(false);

  // useEffect(() => {
  //   initCamera();
  // }, []);
//by ais
useEffect(() => {
  initCamera();

  return () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
  };
}, []);


  const initCamera = async () => {
    await startWebcam(videoRef);

    setStep("Step 1: Align Face");
    setInstruction("Place your face inside the frame");

    const faceMesh = createFaceMesh(onResults);

    const camera = new Camera(videoRef.current, {
      // onFrame: async () => {
      //   if (videoRef.current) {
      //     await faceMesh.send({ image: videoRef.current });
      //   }
      // },
      onFrame: async () => {
  const now = Date.now();

  // Limit processing to ~15 FPS (66ms interval)
  if (now - lastProcessTime.current < 66) return;

  lastProcessTime.current = now;

  if (videoRef.current) {
    await faceMesh.send({ image: videoRef.current });
  }
},
      width: CAMERA_WIDTH,
      height: CAMERA_HEIGHT,
    });

    camera.start();
  };

  // ⭐ MAIN LOGIC
  const onResults = (results) => {
  const canvas = canvasRef.current;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(
    results.image,
    0,
    0,
    CAMERA_WIDTH,
    CAMERA_HEIGHT
  );

  // ❌ No face detected
  if (!results.multiFaceLandmarks) {
    stableFrameCount.current = 0;
    setStep("No Face Detected ❌");
    setInstruction("Show your clear face to camera");
    setVerified(false);
    return;
  }

  // Increase stable counter
  stableFrameCount.current = Math.min(
    stableFrameCount.current + 1,
    10
  );

  // Wait for 5 stable frames
  if (stableFrameCount.current < 5) {
    return;
  }

  const landmarks = results.multiFaceLandmarks[0];

  const box = getBoundingBox(
    landmarks,
    CAMERA_WIDTH,
    CAMERA_HEIGHT
  );

  const faceArea = box.w * box.h;
  const totalArea = CAMERA_WIDTH * CAMERA_HEIGHT;
  const minArea = totalArea * 0.30;

  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;

  const isCentered =
    centerX > CAMERA_WIDTH * 0.3 &&
    centerX < CAMERA_WIDTH * 0.7 &&
    centerY > CAMERA_HEIGHT * 0.3 &&
    centerY < CAMERA_HEIGHT * 0.7;

  // 🚨 Invalid face condition
  if (faceArea < minArea || !isCentered) {
    setStep("Face Not Clear ⚠️");
    setInstruction("Move closer and align face properly");
    setVerified(false);
    return; // IMPORTANT
  }

  // ✅ Only draw box when valid
  drawBox(ctx, box);

  setStep("Face Detected ✅");
  setInstruction("Hold steady for verification...");
  setVerified(true);
};

  return (
    <div className="cameraWrapper">
      <h2>Professional Liveness Check</h2>

      {/* ⭐ STATUS PANEL */}
      <div style={{ marginBottom: "10px" }}>
        <h3>{step}</h3>
        <p>{instruction}</p>
        <p>
          Status:{" "}
          <strong style={{ color: verified ? "lime" : "red" }}>
            {verified ? "VERIFIED" : "NOT VERIFIED"}
          </strong>
        </p>
      </div>

      <video ref={videoRef} style={{ display: "none" }} />

      <CameraCanvas canvasRef={canvasRef} />
    </div>
  );
}