// Small SVG/canvas chart primitives shared by the interactive figures.
import React, { useRef, useEffect, useState, useMemo } from "react";

export const COLORS = ["#2a78d6", "#1baf7a", "#eda100", "#4a3aa7", "#e34948"];
export const INK = { primary: "#0b0b0b", secondary: "#52514e", muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7" };

export function scaleLinear([d0, d1], [r0, r1]) {
  const k = (r1 - r0) / (d1 - d0 || 1);
  const f = (v) => r0 + (v - d0) * k;
  f.invert = (p) => d0 + (p - r0) / k;
  return f;
}

export function niceTicks([a, b], count = 5) {
  const span = b - a || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = (span / count) / step;
  const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  const s = step * mult;
  const t = [];
  for (let v = Math.ceil(a / s) * s; v <= b + 1e-9; v += s) t.push(+v.toFixed(10));
  return t;
}

// Axes + gridlines for a cartesian plot area.
export function Frame({ x, y, w, h, xd, yd, xLabel, yLabel, xTicks, yTicks, fmt = (v) => v }) {
  const sx = scaleLinear(xd, [x, x + w]);
  const sy = scaleLinear(yd, [y + h, y]);
  const tx = xTicks || niceTicks(xd);
  const ty = yTicks || niceTicks(yd);
  return (
    <g className="chart-frame">
      {ty.map((t) => (
        <line key={"gy" + t} x1={x} x2={x + w} y1={sy(t)} y2={sy(t)} stroke={INK.grid} strokeWidth="1" />
      ))}
      <line x1={x} x2={x + w} y1={y + h} y2={y + h} stroke={INK.axis} strokeWidth="1" />
      {tx.map((t) => (
        <text key={"tx" + t} x={sx(t)} y={y + h + 16} fontSize="11" fill={INK.muted} textAnchor="middle">{fmt(t)}</text>
      ))}
      {ty.map((t) => (
        <text key={"ty" + t} x={x - 8} y={sy(t) + 3.5} fontSize="11" fill={INK.muted} textAnchor="end">{fmt(t)}</text>
      ))}
      {xLabel && <text x={x + w / 2} y={y + h + 34} fontSize="11.5" fill={INK.secondary} textAnchor="middle">{xLabel}</text>}
      {yLabel && (
        <text x={x - 40} y={y + h / 2} fontSize="11.5" fill={INK.secondary} textAnchor="middle"
          transform={`rotate(-90 ${x - 40} ${y + h / 2})`}>{yLabel}</text>
      )}
    </g>
  );
}

// Decision-boundary plot: canvas paints class regions, SVG overlays points + axes.
export function BoundaryPlot({ predict, points, xd, yd, xLabel, yLabel, colors, names, width = 440, height = 380, grid = 130 }) {
  const canvasRef = useRef(null);
  const [hover, setHover] = useState(null);
  const M = { l: 52, r: 12, t: 10, b: 44 };
  const w = width - M.l - M.r, h = height - M.t - M.b;
  const sx = scaleLinear(xd, [M.l, M.l + w]);
  const sy = scaleLinear(yd, [M.t + h, M.t]);

  useEffect(() => {
    const cv = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    const cw = w / grid, ch = h / grid;
    for (let i = 0; i < grid; i++) {
      for (let j = 0; j < grid; j++) {
        const vx = xd[0] + ((i + 0.5) / grid) * (xd[1] - xd[0]);
        const vy = yd[0] + ((j + 0.5) / grid) * (yd[1] - yd[0]);
        ctx.fillStyle = colors[predict([vx, vy])] + "2e"; // ~18% alpha region tint
        ctx.fillRect(i * cw, h - (j + 1) * ch, cw + 0.6, ch + 0.6);
      }
    }
  }, [predict, grid, w, h, xd[0], xd[1], yd[0], yd[1], colors]);

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const py = ((e.clientY - rect.top) / rect.height) * height;
    let best = null;
    for (const p of points) {
      const d = (sx(p.x) - px) ** 2 + (sy(p.y) - py) ** 2;
      if (!best || d < best.d) best = { ...p, d };
    }
    setHover(best && best.d < 400 ? best : null);
  };

  return (
    <div className="plot-wrap" style={{ maxWidth: width }}>
      <div style={{ position: "relative", width: "100%" }}>
        <canvas ref={canvasRef}
          style={{ position: "absolute", left: `${(M.l / width) * 100}%`, top: `${(M.t / height) * 100}%`, width: `${(w / width) * 100}%`, height: `${(h / height) * 100}%` }} />
        <svg viewBox={`0 0 ${width} ${height}`} style={{ position: "relative", display: "block", width: "100%" }}
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <Frame x={M.l} y={M.t} w={w} h={h} xd={xd} yd={yd} xLabel={xLabel} yLabel={yLabel} />
          {points.map((p, i) => (
            <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={hover && hover.x === p.x && hover.y === p.y ? 6 : 4}
              fill={colors[p.c]} stroke="#fcfcfb" strokeWidth="1.4" />
          ))}
          {hover && (
            <g pointerEvents="none">
              <rect x={Math.min(sx(hover.x) + 10, width - 168)} y={Math.max(sy(hover.y) - 44, 4)} width="158" height="38" rx="5"
                fill="#0b0b0b" opacity="0.88" />
              <text x={Math.min(sx(hover.x) + 18, width - 160)} y={Math.max(sy(hover.y) - 28, 20)} fontSize="11" fill="#fff">
                {names[hover.c]}
              </text>
              <text x={Math.min(sx(hover.x) + 18, width - 160)} y={Math.max(sy(hover.y) - 13, 35)} fontSize="10.5" fill="#c3c2b7">
                ({hover.x}, {hover.y}) {hover.extra || ""}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

// Recursive CART tree diagram.
export function TreeDiagram({ tree, featureAbbr, classNames, colors, width = 900 }) {
  const layout = useMemo(() => {
    let leafX = 0;
    let maxDepth = 0;
    const nodes = [], links = [];
    const walk = (node) => {
      maxDepth = Math.max(maxDepth, node.depth);
      if (!node.left) {
        const n = { node, x: leafX++, y: node.depth };
        nodes.push(n);
        return n;
      }
      const l = walk(node.left);
      const r = walk(node.right);
      const n = { node, x: (l.x + r.x) / 2, y: node.depth };
      nodes.push(n);
      links.push([n, l, "≤"], [n, r, ">"]);
      return n;
    };
    walk(tree);
    return { nodes, links, leaves: leafX, maxDepth };
  }, [tree]);

  const H = 70 * (layout.maxDepth + 1) + 40;
  const sx = scaleLinear([-0.5, layout.leaves - 0.5], [30, width - 30]);
  const sy = (d) => 34 + d * 70;

  return (
    <svg viewBox={`0 0 ${width} ${H}`} style={{ width: "100%", display: "block" }} role="img" aria-label="决策树结构图">
      {layout.links.map(([a, b], i) => (
        <path key={i} d={`M${sx(a.x)},${sy(a.y) + 14} C${sx(a.x)},${sy(a.y) + 42} ${sx(b.x)},${sy(b.y) - 40} ${sx(b.x)},${sy(b.y) - 14}`}
          fill="none" stroke={INK.axis} strokeWidth="1.3" />
      ))}
      {layout.nodes.map((n, i) => {
        const isLeaf = !n.node.left;
        const total = n.node.counts.reduce((a, b) => a + b, 0);
        return (
          <g key={i} transform={`translate(${sx(n.x)},${sy(n.y)})`}>
            {isLeaf ? (
              <>
                <circle r="13" fill={colors[n.node.pred] + "22"} stroke={colors[n.node.pred]} strokeWidth="1.6" />
                <text y="3.5" fontSize="9.5" textAnchor="middle" fill={INK.primary}>{total}</text>
                <text y="27" fontSize="9.5" textAnchor="middle" fill={INK.secondary}>{classNames[n.node.pred]}</text>
              </>
            ) : (
              <>
                <rect x="-44" y="-13" width="88" height="26" rx="5" fill="#fcfcfb" stroke={INK.axis} strokeWidth="1.2" />
                <text y="-1" fontSize="10" textAnchor="middle" fill={INK.primary}>
                  {featureAbbr[n.node.feature]} ≤ {n.node.thr.toFixed(2)}
                </text>
                <text y="10" fontSize="8.5" textAnchor="middle" fill={INK.muted}>
                  gini {n.node.gini.toFixed(2)} · n={total}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Generic multi-series line chart with crosshair tooltip (dataviz: line ⇒ crosshair).
export function LineChart({ series, xd, yd, xLabel, yLabel, width = 520, height = 300, fmt = (v) => v, fmtY, ann }) {
  const [hx, setHx] = useState(null);
  const M = { l: 56, r: 14, t: 12, b: 46 };
  const w = width - M.l - M.r, h = height - M.t - M.b;
  const sx = scaleLinear(xd, [M.l, M.l + w]);
  const sy = scaleLinear(yd, [M.t + h, M.t]);
  const fy = fmtY || ((v) => (Math.abs(v) < 10 ? v.toFixed(2) : Math.round(v)));

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const v = Math.round(sx.invert(px));
    setHx(v >= xd[0] && v <= xd[1] ? v : null);
  };

  return (
    <div className="plot-wrap" style={{ maxWidth: width }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", display: "block" }}
        onMouseMove={onMove} onMouseLeave={() => setHx(null)}>
        <Frame x={M.l} y={M.t} w={w} h={h} xd={xd} yd={yd} xLabel={xLabel} yLabel={yLabel} fmt={fmt} />
        {series.map((s, si) => (
          <path key={si} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round"
            strokeDasharray={s.dash || "none"}
            d={s.pts.map((p, i) => `${i ? "L" : "M"}${sx(p[0])},${sy(Math.min(Math.max(p[1], yd[0]), yd[1]))}`).join("")} />
        ))}
        {series.map((s, si) => {
          const last = s.pts[s.pts.length - 1];
          return (
            <text key={"lb" + si} x={sx(last[0]) - 4} y={sy(Math.min(Math.max(last[1], yd[0]), yd[1])) - 7}
              fontSize="10.5" fill={s.color} textAnchor="end" fontWeight="600">{s.name}</text>
          );
        })}
        {ann}
        {hx != null && (
          <g pointerEvents="none">
            <line x1={sx(hx)} x2={sx(hx)} y1={M.t} y2={M.t + h} stroke={INK.muted} strokeWidth="1" strokeDasharray="3 3" />
            <rect x={Math.min(sx(hx) + 8, width - 150)} y={M.t + 4} width="142" height={16 + series.length * 15} rx="5" fill="#0b0b0b" opacity="0.88" />
            <text x={Math.min(sx(hx) + 16, width - 142)} y={M.t + 18} fontSize="10.5" fill="#c3c2b7">{xLabel ? `${xLabel.split("（")[0]} = ${fmt(hx)}` : fmt(hx)}</text>
            {series.map((s, si) => {
              const p = s.pts.find((q) => q[0] === hx) || s.pts.reduce((a, b) => (Math.abs(b[0] - hx) < Math.abs(a[0] - hx) ? b : a));
              return (
                <text key={si} x={Math.min(sx(hx) + 16, width - 142)} y={M.t + 33 + si * 15} fontSize="10.5" fill="#fff">
                  <tspan fill={s.color}>●</tspan> {s.name}：{fy(p[1])}
                </text>
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
}
