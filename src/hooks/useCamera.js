// src/hooks/useCamera.js

export const startWebcam = async (videoRef) => {
  if (!videoRef.current) return;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: 640,
      height: 480,
    },
    audio: false,
  });

  videoRef.current.srcObject = stream;
  await videoRef.current.play();
};

export const stopWebcam = (videoRef) => {
  if (videoRef.current?.srcObject) {
    videoRef.current.srcObject.getTracks().forEach((track) => {
      track.stop();
    });
  }
};