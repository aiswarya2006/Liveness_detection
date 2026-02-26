export const getBoundingBox = (landmarks, width, height) => {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;

  landmarks.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });

  return {
    x: minX * width,
    y: minY * height,
    w: (maxX - minX) * width,
    h: (maxY - minY) * height,
  };
};