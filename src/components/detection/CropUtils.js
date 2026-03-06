export const getBoundingBox = (landmarks, width, height) => {
  let minX = 1,
    minY = 1,
    maxX = 0,
    maxY = 0;

  landmarks.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });

  return {
    x: minX * width,
    y: minY * height,
    w: (maxX - minX) * width,
    h: (maxY - minY) * height,
  };
};