import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  component: Game,
});

// ---------- Audio (Web Audio API) ----------
type SFXCtx = { ctx: AudioContext | null };
const audio: SFXCtx = { ctx: null };

function getCtx() {
  if (!audio.ctx) {
    const AC =
      (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
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
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function sweep(f1: number, f2: number, dur = 0.3, type: OscillatorType = "sawtooth", vol = 0.25, delay = 0) {
  const ctx = getCtx();
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f1, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur = 0.3, vol = 0.35, lowpass = 1200, delay = 0) {
  const ctx = getCtx();
  const t0 = ctx.currentTime + delay;
  const bufSize = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = lowpass;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

const SFX = {
  explosion() {
    noise(0.5, 0.55, 800);
    sweep(220, 50, 0.45, "sawtooth", 0.45);
    tone(90, 0.35, "square", 0.25, 0.05);
    tone(55, 0.6, "triangle", 0.3, 0.08);
  },
  miss() {
    tone(180, 0.2, "triangle", 0.18);
    noise(0.18, 0.15, 600, 0.05);
  },
  reveal() {
    tone(523, 0.1, "triangle", 0.2);
    tone(659, 0.1, "triangle", 0.2, 0.1);
    tone(784, 0.18, "triangle", 0.22, 0.2);
  },
  close() {
    tone(440, 0.08, "sine", 0.18);
    tone(330, 0.12, "sine", 0.18, 0.08);
  },
  click() {
    tone(700, 0.05, "square", 0.15);
  },
  blip() {
    tone(900, 0.04, "sine", 0.1);
  },
  spinTick() {
    tone(1200, 0.03, "square", 0.1);
  },
  spinEnd() {
    tone(523, 0.12, "triangle", 0.25);
    tone(659, 0.12, "triangle", 0.25, 0.12);
    tone(784, 0.12, "triangle", 0.25, 0.24);
    tone(1047, 0.25, "triangle", 0.28, 0.36);
  },
  start() {
    tone(523, 0.12, "triangle", 0.22);
    tone(659, 0.12, "triangle", 0.22, 0.12);
    tone(784, 0.2, "triangle", 0.25, 0.24);
  },
};

// ---------- Game ----------
const TEAMS = [
  { name: "Team 1", color: "#ef4444" },
  { name: "Team 2", color: "#3b82f6" },
  { name: "Team 3", color: "#22c55e" },
  { name: "Team 4", color: "#eab308" },
  { name: "Team 5", color: "#a855f7" },
  { name: "Team 6", color: "#f97316" },
];

const GRID_COLS = 8;
const GRID_ROWS = 6;

type CellState = "intact" | "hit";

function makeGrid(): CellState[] {
  return Array.from({ length: GRID_COLS * GRID_ROWS }, () => "intact");
}

type Explosion = { id: number; x: number; y: number };

function Game() {
  const [grids, setGrids] = useState<CellState[][]>(() => TEAMS.map(() => makeGrid()));
  const [explosions, setExplosions] = useState<Explosion[]>([]);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupImg, setPopupImg] = useState<string | null>(null);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelResult, setWheelResult] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [wheelAngle, setWheelAngle] = useState(0);
  const startedRef = useRef(false);
  const explosionIdRef = useRef(0);

  const ensureStarted = useCallback(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      SFX.start();
    }
  }, []);

  const handleCellClick = useCallback(
    (teamIdx: number, cellIdx: number, e: React.MouseEvent<HTMLButtonElement>) => {
      ensureStarted();
      setGrids((prev) => {
        const next = prev.map((g) => g.slice());
        if (next[teamIdx][cellIdx] === "hit") {
          SFX.miss();
          return prev;
        }
        next[teamIdx][cellIdx] = "hit";
        return next;
      });
      // Explosion burst at click position
      const rect = (e.currentTarget.closest(".board") as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = ++explosionIdRef.current;
      setExplosions((ex) => [...ex, { id, x, y }]);
      SFX.explosion();
      window.setTimeout(() => {
        setExplosions((ex) => ex.filter((ee) => ee.id !== id));
      }, 900);
    },
    [ensureStarted],
  );

  const openQuestion = useCallback(() => {
    ensureStarted();
    const n = Math.floor(Math.random() * 20) + 1;
    setPopupImg(`questions/${n}.png`);
    setPopupOpen(true);
    setWheelOpen(false);
    setWheelResult(null);
    window.setTimeout(() => SFX.reveal(), 120);
  }, [ensureStarted]);

  const closePopup = useCallback(() => {
    SFX.close();
    setPopupOpen(false);
    setWheelOpen(false);
    setWheelResult(null);
  }, []);

  const openWheel = useCallback(() => {
    SFX.click();
    setWheelOpen(true);
    setWheelResult(null);
  }, []);

  const spinWheel = useCallback(() => {
    if (spinning) return;
    SFX.click();
    setSpinning(true);
    setWheelResult(null);
    const result = Math.floor(Math.random() * 5) + 1; // 1..5
    // wheel has 5 segments, each 72deg. Segment i center angle = i*72 + 36
    // We want the pointer (top, 0deg) to point at the chosen segment center.
    const segCenter = (result - 1) * 72 + 36;
    const spins = 6;
    const finalAngle = 360 * spins + (360 - segCenter);
    const duration = 3200;
    const start = performance.now();
    const from = wheelAngle % 360;
    const to = from + (finalAngle - from);
    let lastTick = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const a = from + (to - from) * eased;
      setWheelAngle(a);
      if (now - lastTick > 90) {
        SFX.spinTick();
        lastTick = now;
      }
      if (t < 1) requestAnimationFrame(step);
      else {
        setSpinning(false);
        setWheelResult(result);
        SFX.spinEnd();
      }
    };
    requestAnimationFrame(step);
  }, [spinning, wheelAngle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && popupOpen) closePopup();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popupOpen, closePopup]);

  return (
    <div className="min-h-screen bg-[#0f2a3a] text-white">
      <header className="text-center py-3">
        <h1 className="text-2xl font-bold tracking-wide">🍉 Fruit Missile Game 🚀</h1>
        <p className="text-sm opacity-80">Click an enemy tile to strike. Hit the question box for a bonus!</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
        {TEAMS.map((team, tIdx) => (
          <div
            key={team.name}
            className="board relative rounded-lg overflow-hidden shadow-lg border border-white/10"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <div
              className="flex items-center justify-between px-3 py-2 text-sm font-semibold"
              style={{ background: team.color }}
            >
              <span>{team.name}</span>
              <span className="opacity-80 text-xs">
                {grids[tIdx].filter((c) => c === "hit").length}/{GRID_COLS * GRID_ROWS}
              </span>
            </div>
            <div
              className="grid gap-[3px] p-2"
              style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0,1fr))` }}
            >
              {grids[tIdx].map((cell, i) => (
                <button
                  key={i}
                  onClick={(e) => handleCellClick(tIdx, i, e)}
                  onMouseEnter={() => SFX.blip()}
                  className={`aspect-square rounded-sm transition-transform ${
                    cell === "hit"
                      ? "bg-black/70 animate-[shake_0.4s_ease]"
                      : "bg-white/15 hover:bg-white/30 hover:scale-110"
                  }`}
                  aria-label={cell === "hit" ? "hit tile" : "intact tile"}
                />
              ))}
            </div>

            {/* Explosions layer */}
            <div className="pointer-events-none absolute inset-0">
              {explosions.map((ex) => (
                <div
                  key={ex.id}
                  className="absolute"
                  style={{ left: ex.x, top: ex.y, transform: "translate(-50%, -50%)" }}
                >
                  <div className="explosion" />
                  <div className="explosion-ring" />
                  <div className="explosion-text">💥 BOOM!</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center pb-6">
        <button
          onClick={openQuestion}
          className="px-6 py-3 rounded-full font-bold text-black bg-yellow-400 hover:bg-yellow-300 shadow-lg hover:scale-105 transition"
        >
          🎯 Draw a Question
        </button>
      </div>

      {/* Question Popup */}
      {popupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-[fadeIn_0.2s_ease]"
          onClick={closePopup}
        >
          <div
            className="bg-[#14384d] rounded-xl p-5 max-w-[90vw] max-h-[90vh] shadow-2xl border border-white/10 animate-[scaleIn_0.25s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            {!wheelOpen ? (
              <>
                <img
                  src={popupImg ?? ""}
                  alt="Question"
                  className="max-w-[70vw] max-h-[60vh] rounded"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                <div className="flex gap-3 justify-center mt-4">
                  <button
                    onClick={openWheel}
                    className="px-5 py-2 rounded-full font-bold bg-emerald-500 hover:bg-emerald-400 text-black shadow hover:scale-105 transition"
                  >
                    🎡 Spin the Wheel
                  </button>
                  <button
                    onClick={closePopup}
                    className="px-5 py-2 rounded-full font-semibold bg-white/10 hover:bg-white/20 transition"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <h2 className="text-xl font-bold">Spin for your hits!</h2>
                <div className="relative w-[280px] h-[280px]">
                  {/* Pointer */}
                  <div
                    className="absolute left-1/2 -top-2 -translate-x-1/2 z-10"
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: "14px solid transparent",
                      borderRight: "14px solid transparent",
                      borderTop: "24px solid #ef4444",
                      filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.5))",
                    }}
                  />
                  <div
                    className="w-full h-full rounded-full border-4 border-white shadow-2xl"
                    style={{
                      transform: `rotate(${wheelAngle}deg)`,
                      transition: spinning ? "none" : "transform 0.2s",
                      background: `conic-gradient(
                        #ef4444 0deg 72deg,
                        #3b82f6 72deg 144deg,
                        #22c55e 144deg 216deg,
                        #eab308 216deg 288deg,
                        #a855f7 288deg 360deg
                      )`,
                    }}
                  >
                    {[1, 2, 3, 4, 5].map((n) => {
                      const angle = (n - 1) * 72 + 36;
                      return (
                        <div
                          key={n}
                          className="absolute left-1/2 top-1/2 text-white font-black text-2xl drop-shadow"
                          style={{
                            transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-95px) rotate(${-angle}deg)`,
                          }}
                        >
                          {n}
                        </div>
                      );
                    })}
                  </div>
                  {/* Center hub */}
                  <div className="absolute left-1/2 top-1/2 w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-gray-400" />
                </div>

                {wheelResult !== null && !spinning && (
                  <div className="text-center animate-[scaleIn_0.3s_ease]">
                    <div className="text-lg">You get</div>
                    <div className="text-5xl font-black text-yellow-300 drop-shadow">
                      {wheelResult}
                    </div>
                    <div className="text-sm opacity-80">
                      hit{wheelResult > 1 ? "s" : ""} on other teams!
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    disabled={spinning}
                    onClick={spinWheel}
                    className="px-5 py-2 rounded-full font-bold bg-yellow-400 hover:bg-yellow-300 text-black shadow disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition"
                  >
                    {wheelResult === null ? "🎯 Spin!" : "🔁 Spin Again"}
                  </button>
                  <button
                    onClick={closePopup}
                    className="px-5 py-2 rounded-full font-semibold bg-white/10 hover:bg-white/20 transition"
                  >
                    Done
                  </button>
                </div>
              </div>
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
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes scaleIn { from{transform:scale(.85);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes boom {
          0%{transform:scale(.2);opacity:1}
          60%{transform:scale(1.4);opacity:.9}
          100%{transform:scale(2);opacity:0}
        }
        @keyframes ring {
          0%{transform:scale(.3);opacity:.8;border-width:8px}
          100%{transform:scale(2.6);opacity:0;border-width:1px}
        }
        @keyframes boomText {
          0%{transform:translate(-50%,-50%) scale(.4);opacity:0}
          30%{transform:translate(-50%,-90%) scale(1.2);opacity:1}
          100%{transform:translate(-50%,-160%) scale(.9);opacity:0}
        }
        .explosion{
          width:80px;height:80px;border-radius:50%;
          background: radial-gradient(circle, #fff 0%, #ffeb3b 25%, #ff9800 55%, #f44336 80%, transparent 100%);
          animation: boom .9s ease-out forwards;
          filter: blur(1px);
          box-shadow: 0 0 40px 10px rgba(255,152,0,.6);
        }
        .explosion-ring{
          position:absolute;left:50%;top:50%;width:80px;height:80px;
          margin-left:-40px;margin-top:-40px;
          border:4px solid #fff; border-radius:50%;
          animation: ring .9s ease-out forwards;
        }
        .explosion-text{
          position:absolute;left:50%;top:50%;
          font-weight:900;font-size:20px;color:#fff;
          text-shadow: 0 0 8px #f44336, 0 2px 0 #000;
          animation: boomText .9s ease-out forwards;
          white-space:nowrap;
        }
      `}</style>
    </div>
  );
}
