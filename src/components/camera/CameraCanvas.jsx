import React from "react";

export default function CameraCanvas({
  canvasRef,
  width = 640,
  height = 480,
  className = "",
}) {
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
    />
  );
}
