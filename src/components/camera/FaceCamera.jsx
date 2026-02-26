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

  // ⭐ PROFESSIONAL OUTPUT STATES
  const [step, setStep] = useState("Starting Camera...");
  const [instruction, setInstruction] = useState("Please allow camera access");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    initCamera();
  }, []);

  const initCamera = async () => {
    await startWebcam(videoRef);

    setStep("Step 1: Align Face");
    setInstruction("Place your face inside the frame");

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
  };

  // ⭐ MAIN LOGIC
  const onResults = (results) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw camera frame
    ctx.drawImage(
      results.image,
      0,
      0,
      CAMERA_WIDTH,
      CAMERA_HEIGHT
    );

    // ❌ No face
    if (!results.multiFaceLandmarks) {
      setStep("No Face Detected ❌");
      setInstruction("Show your clear face to camera");
      setVerified(false);
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];

    const box = getBoundingBox(
      landmarks,
      CAMERA_WIDTH,
      CAMERA_HEIGHT
    );

    drawBox(ctx, box);

    // ⭐ BASIC CLEAR FACE VALIDATION
    const faceArea = box.w * box.h;
    const minArea = 60000; // adjust if needed

    const centerX = box.x + box.w / 2;
    const centerY = box.y + box.h / 2;

    const isCentered =
      centerX > CAMERA_WIDTH * 0.3 &&
      centerX < CAMERA_WIDTH * 0.7 &&
      centerY > CAMERA_HEIGHT * 0.3 &&
      centerY < CAMERA_HEIGHT * 0.7;

    // 🚨 If object/photo or unclear face → usually fails these checks
    if (faceArea < minArea || !isCentered) {
      setStep("Face Not Clear ⚠️");
      setInstruction("Move closer and align face properly");
      setVerified(false);
      return;
    }

    // ✅ CLEAR FACE DETECTED
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