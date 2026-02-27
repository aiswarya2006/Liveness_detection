import { FaceMesh } from "@mediapipe/face_mesh";
// import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";
// import { FACEMESH_TESSELATION } from "@mediapipe/face_mesh";
export const createFaceMesh = (onResults) => {
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

  faceMesh.onResults(onResults);

  return faceMesh;
};