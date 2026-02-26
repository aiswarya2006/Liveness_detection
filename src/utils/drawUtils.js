export const drawBox = (ctx, box) => {
  ctx.strokeStyle = "lime";
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
};