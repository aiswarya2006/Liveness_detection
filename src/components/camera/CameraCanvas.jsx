import React from "react";

export default function CameraCanvas({ canvasRef }) {
  return <canvas ref={canvasRef} width="640" height="480" />;
}