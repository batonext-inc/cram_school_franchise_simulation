export class FinanceGraph {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
  }

  render(entries = []) {
    if (!this.ctx) {
      return;
    }

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#edf2fb";
    ctx.fillRect(0, 0, width, height);

    if (!entries.length) {
      ctx.fillStyle = "#4a5568";
      ctx.font = "16px sans-serif";
      ctx.fillText("データなし", width / 2 - 40, height / 2);
      return;
    }

    const padding = 30;
    const recentEntries = entries.slice(-12);
    const values = recentEntries.flatMap((e) => [e.revenue, e.cost]);
    const maxValue = Math.max(...values, 1);

    const scaleY = (value) => {
      const normalized = value / maxValue;
      return height - padding - normalized * (height - padding * 2);
    };
    const stepX = recentEntries.length > 1 ? (width - padding * 2) / (recentEntries.length - 1) : 0;

    this.drawLine(recentEntries, {
      ctx,
      stepX,
      padding,
      color: "#1d3557",
      valueKey: "revenue",
      scaleY,
    });

    this.drawLine(recentEntries, {
      ctx,
      stepX,
      padding,
      color: "#e63946",
      valueKey: "cost",
      dash: [4, 3],
      scaleY,
    });

    ctx.fillStyle = "#1f2933";
    ctx.font = "12px sans-serif";
    recentEntries.forEach((entry, index) => {
      const x = padding + stepX * index;
      const label = `X${entry.year}/${entry.month}`;
      ctx.fillText(label, x - 16, height - 8);
    });

    ctx.strokeStyle = "#ccd6f6";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    ctx.fillStyle = "#1d3557";
    ctx.fillRect(width - 130, padding - 18, 12, 3);
    ctx.fillStyle = "#1f1f27";
    ctx.fillText("売上", width - 110, padding - 10);
    ctx.strokeStyle = "#e63946";
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(width - 60, padding - 16);
    ctx.lineTo(width - 48, padding - 16);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#1f1f27";
    ctx.fillText("コスト", width - 40, padding - 10);
  }

  drawLine(entries, { ctx, stepX, padding, color, valueKey, dash = [], scaleY }) {
    if (!entries.length) {
      return;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(dash);
    ctx.beginPath();

    entries.forEach((entry, index) => {
      const x = padding + stepX * index;
      const y = scaleY(entry[valueKey]);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
    ctx.setLineDash([]);
  }
}
