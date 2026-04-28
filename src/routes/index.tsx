import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  component: Game,
});

/* ---------------- Audio (Web Audio API) ---------------- */
const audio: { ctx: AudioContext | null } = { ctx: null };
function getCtx() {
  if (!audio.ctx) {
    const AC =
      (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio.ctx = new AC();
  }
  if (audio.ctx.state === "suspended") void audio.ctx.resume();
  return audio.ctx;
}
function tone(freq: number, dur = 0.2, type: OscillatorType = "sine", vol = 0.25, delay = 0) {
  const ctx = getCtx();
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}
function sweep(f1: number, f2: number, dur = 0.3, type: OscillatorType = "sawtooth", vol = 0.25, delay = 0) {
  const ctx = getCtx();
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f1, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}
function noise(dur = 0.3, vol = 0.35, lowpass = 1200, delay = 0) {
  const ctx = getCtx();
  const t0 = ctx.currentTime + delay;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "lowpass"; f.frequency.value = lowpass;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0); src.stop(t0 + dur + 0.05);
}
const SFX = {
  explosion() { noise(0.5, 0.55, 800); sweep(220, 50, 0.45, "sawtooth", 0.45); tone(90, 0.35, "square", 0.25, 0.05); tone(55, 0.6, "triangle", 0.3, 0.08); },
  miss() { tone(180, 0.15, "triangle", 0.18); noise(0.15, 0.12, 600, 0.03); },
  whoosh() { sweep(900, 200, 0.25, "sine", 0.2); },
  click() { tone(700, 0.05, "square", 0.15); },
  blip() { tone(900, 0.04, "sine", 0.08); },
  reveal() { tone(523, 0.09, "triangle", 0.2); tone(659, 0.09, "triangle", 0.2, 0.09); tone(784, 0.16, "triangle", 0.22, 0.18); },
  spinTick() { tone(1200, 0.025, "square", 0.09); },
  spinEnd() { tone(523, 0.1, "triangle", 0.25); tone(659, 0.1, "triangle", 0.25, 0.1); tone(784, 0.1, "triangle", 0.25, 0.2); tone(1047, 0.22, "triangle", 0.28, 0.3); },
};

/* ---------------- Config ---------------- */
const QUADRANT_COLS = 5;
const QUADRANT_ROWS = 5;
const HOUSES_PER_QUADRANT = 6;
const QUADRANTS = 6;

const QUAD_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22"];
const TEAM_NAMES = ["TEAM 1", "TEAM 2", "TEAM 3", "TEAM 4", "TEAM 5", "TEAM 6"];
const FRUITS = ["🍎", "🍌", "🍇", "🍓", "🍊", "🍋", "🍉", "🍑", "🍒", "🍍"];

type Cell = { hit: boolean; house: boolean; revealed: boolean; fruit: string };

function makeQuadrant(): Cell[] {
  const total = QUADRANT_COLS * QUADRANT_ROWS;
  const cells: Cell[] = Array.from({ length: total }, () => ({
    hit: false,
    house: false,
    revealed: false,
    fruit: FRUITS[Math.floor(Math.random() * FRUITS.length)],
  }));
  const idxs = new Set<number>();
  while (idxs.size < HOUSES_PER_QUADRANT) idxs.add(Math.floor(Math.random() * total));
  idxs.forEach((i) => (cells[i].house = true));
  return cells;
}

type Burst = { id: number; x: number; y: number };

function Game() {
  const [quads, setQuads] = useState<Cell[][]>(() => Array.from({ length: QUADRANTS }, () => []));
  useEffect(() => {
    setQuads(Array.from({ length: QUADRANTS }, () => makeQuadrant()));
  }, []);
  const [bursts, setBursts] = useState<Burst[][]>(() => Array.from({ length: QUADRANTS }, () => []));
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupImg, setPopupImg] = useState<string | null>(null);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelAngle, setWheelAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [wheelResult, setWheelResult] = useState<number | null>(null);

  const burstIdRef = useRef(0);
  const startedRef = useRef(false);
  const ensureStarted = useCallback(() => {
    if (!startedRef.current) { startedRef.current = true; SFX.click(); }
  }, []);

  const images = useMemo(
    () => Array.from({ length: 15 }, (_, i) => `q${i + 1}`),
    [],
  );

  const addBurst = (qIdx: number, x: number, y: number) => {
    const id = ++burstIdRef.current;
    setBursts((prev) => {
      const next = prev.map((a) => a.slice());
      next[qIdx] = [...next[qIdx], { id, x, y }];
      return next;
    });
    window.setTimeout(() => {
      setBursts((prev) => {
        const next = prev.map((a) => a.slice());
        next[qIdx] = next[qIdx].filter((b) => b.id !== id);
        return next;
      });
    }, 950);
  };

  const handleCellClick = (qIdx: number, cIdx: number, e: React.MouseEvent<HTMLDivElement>) => {
    ensureStarted();
    const board = (e.currentTarget.closest(".quadrant") as HTMLElement | null);
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const current = quads[qIdx]?.[cIdx];
    if (!current || current.hit) return;
    const isHouse = current.house;

    setQuads((prev) => {
      const next = prev.map((g) => g.map((c) => ({ ...c })));
      const cell = next[qIdx][cIdx];
      cell.hit = true;
      if (cell.house) cell.revealed = true;
      return next;
    });

    if (isHouse) {
      addBurst(qIdx, x, y);
      SFX.explosion();
    } else {
      SFX.miss();
    }
  };

  const openQuestion = () => {
    ensureStarted();
    SFX.click();
    const name = images[Math.floor(Math.random() * images.length)];
    setPopupImg(`/questions/${name}.png`);
    setWheelOpen(false);
    setWheelResult(null);
    setPopupOpen(true);
    window.setTimeout(() => { SFX.whoosh(); SFX.reveal(); }, 120);
  };

  const closePopup = () => {
    SFX.click();
    setPopupOpen(false);
    setWheelOpen(false);
    setWheelResult(null);
  };

  const openWheel = () => { SFX.click(); setWheelOpen(true); setWheelResult(null); };

  const spinWheel = () => {
    if (spinning) return;
    SFX.click();
    setSpinning(true);
    setWheelResult(null);
    const result = Math.floor(Math.random() * 5) + 1;
    const segCenter = (result - 1) * 72 + 36;
    const spins = 6;
    const finalAngle = 360 * spins + (360 - segCenter);
    const duration = 1800; // faster
    const start = performance.now();
    const from = wheelAngle % 360;
    const to = from + (finalAngle - from);
    let lastTick = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const a = from + (to - from) * eased;
      setWheelAngle(a);
      if (now - lastTick > 60) { SFX.spinTick(); lastTick = now; }
      if (t < 1) requestAnimationFrame(step);
      else { setSpinning(false); setWheelResult(result); SFX.spinEnd(); }
    };
    requestAnimationFrame(step);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && popupOpen) closePopup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popupOpen]);

  return (
    <div style={{ fontFamily: "Arial, sans-serif", margin: 0, background: "#0f2a3a", color: "white", minHeight: "100vh" }}>
      <div style={{ textAlign: "center", padding: 10, fontSize: 20, fontWeight: 700 }}>
        🍉 Fruit Missile Game 🚀
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          height: "85vh",
          gap: 4,
          padding: 4,
        }}
      >
        {quads.map((cells, qIdx) => (
          <div
            key={qIdx}
            className="quadrant"
            style={{
              position: "relative",
              background: "#143447",
              border: `3px solid ${QUAD_COLORS[qIdx]}`,
              borderRadius: 8,
              overflow: "hidden",
              padding: 6,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                textAlign: "center",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: 1,
                padding: "2px 0 4px",
                color: "#fff",
              }}
            >
              {TEAM_NAMES[qIdx]}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${QUADRANT_COLS}, 1fr)`,
                gridTemplateRows: `repeat(${QUADRANT_ROWS}, 1fr)`,
                gap: 3,
                width: "100%",
                flex: 1,
              }}
            >
              {cells.map((cell, cIdx) => (
                <div
                  key={cIdx}
                  onClick={(e) => handleCellClick(qIdx, cIdx, e)}
                  onMouseEnter={() => SFX.blip()}
                  style={{
                    position: "relative",
                    background: cell.revealed
                      ? "#e74c3c"
                      : cell.hit
                        ? "#2c3e50"
                        : "#2d6b8a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 3,
                    cursor: cell.hit ? "default" : "pointer",
                    transition: "background 0.15s, transform 0.1s",
                    animation: cell.revealed ? "shake 0.4s ease" : undefined,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "clamp(14px, 2.2vw, 22px)",
                    userSelect: "none",
                  }}
                  onMouseDown={(e) => {
                    if (!cell.hit) (e.currentTarget as HTMLDivElement).style.transform = "scale(0.92)";
                  }}
                  onMouseUp={(e) => {
                    (e.currentTarget as HTMLDivElement).style.transform = "scale(1)";
                  }}
                >
                  {cell.revealed ? (
                    <span>💥🏠</span>
                  ) : cell.hit ? (
                    <span style={{ color: "#e74c3c", fontWeight: 900 }}>❌</span>
                  ) : (
                    <>
                      <span style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif', lineHeight: 1 }}>{cell.fruit}</span>
                      <span
                        style={{
                          position: "absolute",
                          bottom: 1,
                          right: 3,
                          fontSize: "clamp(8px, 1vw, 11px)",
                          color: "rgba(255,255,255,0.85)",
                          fontWeight: 600,
                        }}
                      >
                        {cIdx + 1}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Burst overlay */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {bursts[qIdx].map((b) => (
                <div key={b.id} style={{ position: "absolute", left: b.x, top: b.y, transform: "translate(-50%,-50%)" }}>
                  <div className="boom-core" />
                  <div className="boom-ring" />
                  <div className="boom-text">💥 BOOM!</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center", padding: 10 }}>
        <button
          onClick={openQuestion}
          style={{
            background: "#f1c40f",
            color: "#000",
            border: "none",
            padding: "10px 22px",
            borderRadius: 24,
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          🎯 Question
        </button>
      </div>

      {popupOpen && (
        <div
          onClick={closePopup}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 50, animation: "fadeIn 0.2s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#14384d", padding: 20, borderRadius: 12,
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
              maxWidth: "90vw", maxHeight: "90vh",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
              animation: "scaleIn 0.25s ease",
            }}
          >
            {!wheelOpen ? (
              <>
                <div style={{ position: "relative", display: "inline-block" }}>
                  <img
                    src={popupImg ?? ""}
                    alt="question"
                    style={{ maxWidth: "70vw", maxHeight: "60vh", borderRadius: 6, display: "block" }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <button
                    onClick={openWheel}
                    style={{
                      position: "absolute",
                      bottom: 10,
                      right: 10,
                      background: "#2ecc71",
                      color: "#000",
                      border: "none",
                      padding: "8px 14px",
                      borderRadius: 20,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                    }}
                  >
                    🎡 Spin the Wheel
                  </button>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={closePopup} style={btnGhost}>Close</button>
                </div>
              </>
            ) : (
              <>
                <h2 style={{ margin: 0, fontSize: 20 }}>Spin for your hits!</h2>
                <div style={{ position: "relative", width: 260, height: 260 }}>
                  <div
                    style={{
                      position: "absolute", left: "50%", top: -6, transform: "translateX(-50%)",
                      width: 0, height: 0,
                      borderLeft: "12px solid transparent",
                      borderRight: "12px solid transparent",
                      borderTop: "22px solid #e74c3c",
                      filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.5))",
                      zIndex: 2,
                    }}
                  />
                  <div
                    style={{
                      width: "100%", height: "100%", borderRadius: "50%",
                      border: "4px solid white", boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
                      transform: `rotate(${wheelAngle}deg)`,
                      transition: spinning ? "none" : "transform 0.15s",
                      background:
                        "conic-gradient(#e74c3c 0deg 72deg,#3498db 72deg 144deg,#2ecc71 144deg 216deg,#f1c40f 216deg 288deg,#9b59b6 288deg 360deg)",
                      position: "relative",
                    }}
                  >
                    {[1, 2, 3, 4, 5].map((n) => {
                      const angle = (n - 1) * 72 + 36;
                      return (
                        <div
                          key={n}
                          style={{
                            position: "absolute", left: "50%", top: "50%",
                            color: "white", fontWeight: 900, fontSize: 22,
                            textShadow: "0 2px 2px rgba(0,0,0,0.5)",
                            transform: `translate(-50%,-50%) rotate(${angle}deg) translateY(-88px) rotate(${-angle}deg)`,
                          }}
                        >
                          {n}
                        </div>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      position: "absolute", left: "50%", top: "50%",
                      width: 22, height: 22, borderRadius: "50%",
                      background: "white", border: "2px solid #888",
                      transform: "translate(-50%,-50%)",
                    }}
                  />
                </div>

                {wheelResult !== null && !spinning && (
                  <div style={{ textAlign: "center", animation: "scaleIn 0.3s ease" }}>
                    <div>You get</div>
                    <div style={{ fontSize: 44, fontWeight: 900, color: "#f1c40f" }}>{wheelResult}</div>
                    <div style={{ fontSize: 13, opacity: 0.85 }}>
                      hit{wheelResult > 1 ? "s" : ""} on other teams!
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={spinWheel} disabled={spinning} style={{ ...btnYellow, opacity: spinning ? 0.6 : 1, cursor: spinning ? "not-allowed" : "pointer" }}>
                    {wheelResult === null ? "🎯 Spin!" : "🔁 Spin Again"}
                  </button>
                  <button onClick={closePopup} style={btnGhost}>Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes shake {
          0%,100%{transform:translate(0,0)}
          20%{transform:translate(-2px,1px)}
          40%{transform:translate(2px,-1px)}
          60%{transform:translate(-1px,2px)}
          80%{transform:translate(1px,-2px)}
        }
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes scaleIn{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
        @keyframes boomCore{
          0%{transform:scale(.2);opacity:1}
          60%{transform:scale(1.4);opacity:.9}
          100%{transform:scale(2.2);opacity:0}
        }
        @keyframes boomRing{
          0%{transform:scale(.3);opacity:.8;border-width:8px}
          100%{transform:scale(2.8);opacity:0;border-width:1px}
        }
        @keyframes boomText{
          0%{transform:translate(-50%,-50%) scale(.4);opacity:0}
          30%{transform:translate(-50%,-90%) scale(1.2);opacity:1}
          100%{transform:translate(-50%,-160%) scale(.9);opacity:0}
        }
        .boom-core{
          width:70px;height:70px;border-radius:50%;
          background:radial-gradient(circle,#fff 0%,#ffeb3b 25%,#ff9800 55%,#f44336 80%,transparent 100%);
          animation:boomCore .9s ease-out forwards;
          filter:blur(1px);
          box-shadow:0 0 35px 8px rgba(255,152,0,.6);
        }
        .boom-ring{
          position:absolute;left:50%;top:50%;width:70px;height:70px;
          margin-left:-35px;margin-top:-35px;
          border:4px solid #fff;border-radius:50%;
          animation:boomRing .9s ease-out forwards;
        }
        .boom-text{
          position:absolute;left:50%;top:50%;
          font-weight:900;font-size:18px;color:#fff;
          text-shadow:0 0 8px #f44336,0 2px 0 #000;
          animation:boomText .9s ease-out forwards;
          white-space:nowrap;
        }
      `}</style>
    </div>
  );
}

const btnBase: React.CSSProperties = {
  border: "none", padding: "10px 18px", borderRadius: 22,
  fontWeight: 700, cursor: "pointer", fontSize: 14,
  boxShadow: "0 3px 10px rgba(0,0,0,0.3)",
};
const btnGreen: React.CSSProperties = { ...btnBase, background: "#2ecc71", color: "#000" };
const btnYellow: React.CSSProperties = { ...btnBase, background: "#f1c40f", color: "#000" };
const btnGhost: React.CSSProperties = { ...btnBase, background: "rgba(255,255,255,0.12)", color: "#fff" };
