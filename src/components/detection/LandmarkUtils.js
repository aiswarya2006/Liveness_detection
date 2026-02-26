export const getFaceCenter = (landmarks, width, height) => {
  const nose = landmarks[1];
  return {
    x: nose.x * width,
    y: nose.y * height,
  };
};