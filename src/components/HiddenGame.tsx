import React, { useEffect, useRef, useState } from 'react';

// "Main brain game frame": a tiny one-button jumper drawn on BMO's screen.
// Jump over the monsters with the red button (or Space). The speed goes up over time.

interface HiddenGameProps {
  color: string;        // Drawing colour (BMO's face colour)
  best: number;         // Best score so far
  jumps: number;        // Increments on every jump press
  playId: number;       // Changes to start a new round
  onGameOver: (score: number) => void;
}

// Game world size (scaled to fit the screen)
const W = 160;
const H = 120;
const GROUND = 100;
const PLAYER_X = 24;
const PLAYER_SIZE = 12;
const GRAVITY = 0.45;
const JUMP_VELOCITY = -6.2;
const START_SPEED = 1.6;
const SPEED_UP = 0.0009;       // Speed added per frame
const MIN_GAP = 55;            // Minimum distance between monsters
const COUNTDOWN_MS = 1200;

interface Monster { x: number; w: number; h: number; passed: boolean }

export const HiddenGame: React.FC<HiddenGameProps> = ({ color, best, jumps, playId, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [starting, setStarting] = useState(true);
  const stateRef = useRef({ y: GROUND - PLAYER_SIZE, vy: 0, monsters: [] as Monster[], speed: START_SPEED, score: 0, running: false });
  const onGameOverRef = useRef(onGameOver);
  onGameOverRef.current = onGameOver;

  // Jump when the red button is pressed (only on the ground)
  useEffect(() => {
    const st = stateRef.current;
    if (st.running && st.y >= GROUND - PLAYER_SIZE - 0.5) st.vy = JUMP_VELOCITY;
  }, [jumps]);

  // Run one round
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    stateRef.current = { y: GROUND - PLAYER_SIZE, vy: 0, monsters: [], speed: START_SPEED, score: 0, running: false };
    setScore(0);
    setOver(false);
    setStarting(true);

    let rafId = 0;
    const startTimer = window.setTimeout(() => {
      stateRef.current.running = true;
      setStarting(false);
    }, COUNTDOWN_MS);

    const drawPlayer = (y: number) => {
      // A tiny BMO: body, screen, two dot eyes
      ctx.fillStyle = color;
      ctx.fillRect(PLAYER_X, y, PLAYER_SIZE, PLAYER_SIZE);
      ctx.clearRect(PLAYER_X + 2, y + 2, PLAYER_SIZE - 4, 6);
      ctx.fillRect(PLAYER_X + 4, y + 4, 1.5, 1.5);
      ctx.fillRect(PLAYER_X + 7, y + 4, 1.5, 1.5);
    };

    const drawMonster = (m: Monster) => {
      // A little spiky monster with angry eyes
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(m.x, GROUND);
      ctx.lineTo(m.x + m.w / 2, GROUND - m.h);
      ctx.lineTo(m.x + m.w, GROUND);
      ctx.fill();
      ctx.clearRect(m.x + m.w / 2 - 2.5, GROUND - m.h / 2, 1.5, 1.5);
      ctx.clearRect(m.x + m.w / 2 + 1, GROUND - m.h / 2, 1.5, 1.5);
    };

    const frame = () => {
      const st = stateRef.current;
      if (st.running) {
        // Physics
        st.vy += GRAVITY;
        st.y = Math.min(GROUND - PLAYER_SIZE, st.y + st.vy);
        if (st.y === GROUND - PLAYER_SIZE) st.vy = 0;
        st.speed += SPEED_UP;

        // Monsters
        const last = st.monsters[st.monsters.length - 1];
        if (!last || last.x < W - MIN_GAP - Math.random() * 60) {
          st.monsters.push({ x: W + Math.random() * 20, w: 8 + Math.random() * 6, h: 8 + Math.random() * 8, passed: false });
        }
        for (const m of st.monsters) {
          m.x -= st.speed;
          if (!m.passed && m.x + m.w < PLAYER_X) {
            m.passed = true;
            st.score++;
            setScore(st.score);
          }
        }
        st.monsters = st.monsters.filter(m => m.x + m.w > -5);

        // Collision (a little forgiving)
        const hit = st.monsters.some(m =>
          m.x + 2 < PLAYER_X + PLAYER_SIZE && m.x + m.w - 2 > PLAYER_X && st.y + PLAYER_SIZE > GROUND - m.h + 3
        );
        if (hit) {
          st.running = false;
          setOver(true);
          onGameOverRef.current(st.score);
        }
      }

      // Draw
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = color;
      ctx.fillRect(0, GROUND, W, 2);
      st.monsters.forEach(drawMonster);
      drawPlayer(st.y);

      rafId = requestAnimationFrame(frame);  // Keeps drawing the final scene after game over too
    };
    frame();

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(startTimer);
    };
  }, [playId, color]);  // A new playId starts a new round

  return (
    <div className="absolute inset-0 flex flex-col" style={{ color }}>
      <div className="flex justify-between px-[5%] pt-[3%] text-[clamp(10px,3vw,12px)] font-bold">
        <span>SCORE {score}</span>
        <span>BEST {Math.max(best, score)}</span>
      </div>
      {/* object-contain keeps the game's shape instead of stretching it to the screen */}
      <canvas ref={canvasRef} width={W} height={H} className="flex-1 min-h-0 w-full object-contain" style={{ imageRendering: 'pixelated' }} />
      {(starting || over) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-1 font-bold" aria-live="polite">
          {starting && <span className="text-[clamp(14px,4.5vw,18px)]">GET READY!</span>}
          {starting && <span className="text-[clamp(10px,3vw,12px)] opacity-80">● red to jump</span>}
          {over && <span className="text-[clamp(16px,5vw,22px)]">GAME OVER</span>}
          {over && <span className="text-[clamp(10px,3vw,12px)] opacity-80">▲ play again · ● red to leave</span>}
        </div>
      )}
    </div>
  );
};
