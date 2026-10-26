export const backgrounds = [
  ["plain", "纯色"],
  ["dots", "圆点"],
  ["grid", "网格"],
  ["aurora", "柔光极光"],
  ["grain", "磨砂颗粒"],
  ["contour", "地形等高线"],
  ["rays", "侧光光束"],
  ["silk", "丝绸流线"],
  ["stars", "星尘粒子"],
  ["radar", "雷达波纹"],
  ["matrix", "字符矩阵"],
  ["metal", "液态虹彩"],
] as const;
export type BackgroundKind = (typeof backgrounds)[number][0];
export function Background({ kind }: { kind: BackgroundKind }) {
  return (
    <div className="lane-pattern" data-pattern={kind} aria-hidden="true">
      {(kind === "contour" || kind === "silk") && (
        <svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 24 }, (_, i) =>
            kind === "contour" ? (
              <path
                key={i}
                d={`M ${-120 + i * 17} -40 C ${430 + i * 13} 130, ${-230 + i * 20} 300, ${60 + i * 19} 470 S ${480 + i * 9} 650, ${100 + i * 18} 860`}
              />
            ) : (
              <path
                key={i}
                d={`M -30 ${80 + i * 17} C 140 ${-80 + i * 12}, 220 ${640 - i * 9}, 430 ${330 + i * 15}`}
              />
            ),
          )}
        </svg>
      )}
      {kind === "stars" && (
        <svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 95 }, (_, i) => (
            <circle
              key={i}
              cx={(i * 137.51) % 400}
              cy={(i * 231.17) % 800}
              r={i % 5 === 0 ? 1.7 : 0.7}
              opacity={0.2 + (i % 4) * 0.15}
            />
          ))}
        </svg>
      )}
      {kind === "matrix" && (
        <svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 180 }, (_, i) => (
            <text
              key={i}
              x={(i % 12) * 36}
              y={Math.floor(i / 12) * 58 + 20}
              opacity={0.13 + (i % 3) * 0.08}
            >
              {["0", "1", "·", "+", "01", "10"][(i * 7) % 6]}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}
