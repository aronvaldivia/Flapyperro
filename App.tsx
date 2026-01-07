
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameStatus, Pipe } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, BIRD_SIZE, DEFAULT_SETTINGS, HITBOX_MARGIN, SHAKE_INTENSITY, SHAKE_DURATION } from './constants';
import { generateDeathRoast } from './services/geminiService';

const ASSETS = {
  birdNeutral: "https://mcusercontent.com/17635adc15e4488859eb5650d/images/3dea103d-2032-6fb4-d066-ce533bda3d96.png",
  birdJump: "https://mcusercontent.com/17635adc15e4488859eb5650d/images/4c920652-fcc0-70b3-fd5f-382d0ffdcace.png",
  birdShoot: "https://mcusercontent.com/17635adc15e4488859eb5650d/images/b1b6c65a-9b17-0c4a-72be-7384c1979f0e.png",
  birdHit: "https://mcusercontent.com/17635adc15e4488859eb5650d/images/99f9b0ff-54fd-c80b-2655-ee8c65074d5c.png",
  pipe: "https://mcusercontent.com/17635adc15e4488859eb5650d/images/29baa4f1-d166-cf53-ee0e-9d0b81766eae.png",
  crate: "https://mcusercontent.com/17635adc15e4488859eb5650d/images/8720b6a8-c420-6e43-6981-d7e5a38155e8.png",
  bg: "https://mcusercontent.com/17635adc15e4488859eb5650d/images/a8c1d554-45f7-e8c3-9f83-fbb535abb8be.png"
};

interface Projectile {
  x: number;
  y: number;
  speed: number;
  active: boolean;
}

interface Crate {
  x: number;
  y: number;
  size: number;
  active: boolean;
}

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>(GameStatus.START);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [roast, setRoast] = useState<string>("");
  const [isRoasting, setIsRoasting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [screenShake, setScreenShake] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const images = useRef<Record<string, HTMLImageElement>>({});
  
  const birdY = useRef(CANVAS_HEIGHT / 2);
  const birdVelocity = useRef(0);
  const pipes = useRef<Pipe[]>([]);
  const projectiles = useRef<Projectile[]>([]);
  const crates = useRef<Crate[]>([]);
  const frameId = useRef<number>(0);
  const lastPipeSpawn = useRef<number>(0);
  const shootTimer = useRef<number>(0);
  const isDead = useRef<boolean>(false);

  useEffect(() => {
    let loadedCount = 0;
    const entries = Object.entries(ASSETS);
    entries.forEach(([key, url]) => {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        loadedCount++;
        images.current[key] = img;
        if (loadedCount === entries.length) setLoading(false);
      };
    });
  }, []);

  const triggerScreenShake = () => {
    const startTime = Date.now();
    const shake = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed < SHAKE_DURATION) {
        setScreenShake({
          x: (Math.random() - 0.5) * SHAKE_INTENSITY,
          y: (Math.random() - 0.5) * SHAKE_INTENSITY
        });
        requestAnimationFrame(shake);
      } else {
        setScreenShake({ x: 0, y: 0 });
      }
    };
    shake();
  };

  const handleGameOver = useCallback(async (finalScore: number) => {
    if (isDead.current) return;
    isDead.current = true;
    triggerScreenShake();
    
    setTimeout(async () => {
      setStatus(GameStatus.GAME_OVER);
      if (finalScore > highScore) setHighScore(finalScore);
      setIsRoasting(true);
      const aiRoast = await generateDeathRoast(finalScore);
      setRoast(aiRoast);
      setIsRoasting(false);
    }, 400);
  }, [highScore]);

  const runCountdown = useCallback(() => {
    birdY.current = CANVAS_HEIGHT / 2;
    birdVelocity.current = 0;
    pipes.current = [];
    projectiles.current = [];
    crates.current = [];
    isDead.current = false;
    
    setCountdown(3);
    setStatus(GameStatus.START);
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev === 1) {
          clearInterval(timer);
          setCountdown(null);
          initGame();
          return null;
        }
        return prev ? prev - 1 : null;
      });
    }, 800);
  }, []);

  const initGame = () => {
    birdY.current = CANVAS_HEIGHT / 2;
    birdVelocity.current = 0;
    pipes.current = [];
    projectiles.current = [];
    crates.current = [];
    shootTimer.current = 0;
    isDead.current = false;
    setScore(0);
    setRoast("");
    setStatus(GameStatus.PLAYING);
    lastPipeSpawn.current = performance.now();
  };

  const jump = useCallback(() => {
    if (status === GameStatus.START && countdown === null) {
      runCountdown();
    } else if (status === GameStatus.PLAYING) {
      birdVelocity.current = DEFAULT_SETTINGS.jumpStrength;
    }
  }, [status, countdown, runCountdown]);

  const shoot = useCallback(() => {
    if (status === GameStatus.PLAYING) {
      projectiles.current.push({
        x: 50 + BIRD_SIZE,
        y: birdY.current + BIRD_SIZE / 2,
        speed: 12,
        active: true
      });
      // shootTimer reduced to make animation snappier
      shootTimer.current = 8; 
    }
  }, [status]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); jump(); }
      if (e.code === 'KeyF') { e.preventDefault(); shoot(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [jump, shoot]);

  const update = useCallback((timestamp: number) => {
    if (status !== GameStatus.PLAYING) return;

    if (shootTimer.current > 0) shootTimer.current--;

    birdVelocity.current += DEFAULT_SETTINGS.gravity;
    birdY.current += birdVelocity.current;

    if (birdY.current < 0 || birdY.current + BIRD_SIZE > CANVAS_HEIGHT) {
      handleGameOver(score);
      return;
    }

    if (timestamp - lastPipeSpawn.current > DEFAULT_SETTINGS.pipeSpawnRate) {
      const minPipeH = 60;
      const gap = DEFAULT_SETTINGS.gapSize;
      const topHeight = Math.floor(Math.random() * (CANVAS_HEIGHT - gap - 2 * minPipeH)) + minPipeH;
      
      pipes.current.push({ x: CANVAS_WIDTH, topHeight, bottomY: topHeight + gap, width: 70, passed: false });

      if (Math.random() > 0.4) {
        const crateSize = 40;
        const yOffset = Math.random() > 0.5 ? 10 : gap - crateSize - 10;
        crates.current.push({ x: CANVAS_WIDTH + 100, y: topHeight + yOffset, size: crateSize, active: true });
      }
      lastPipeSpawn.current = timestamp;
    }

    const checkCollision = (r1: any, r2: any) => {
      const p1 = (1 - HITBOX_MARGIN) / 2;
      const p2 = (1 - HITBOX_MARGIN) / 2;
      const b1 = { l: r1.x + r1.w * p1, r: r1.x + r1.w * (1 - p1), t: r1.y + r1.h * p1, b: r1.y + r1.h * (1 - p1) };
      const b2 = { l: r2.x + r2.w * p2, r: r2.x + r2.w * (1 - p2), t: r2.y + r2.h * p2, b: r2.y + r2.h * (1 - p2) };
      return !(b1.l > b2.r || b1.r < b2.l || b1.t > b2.b || b1.b < b2.t);
    };

    const birdRect = { x: 50, y: birdY.current, w: BIRD_SIZE, h: BIRD_SIZE };

    // Update Projectiles with better collision for crates
    projectiles.current = projectiles.current.filter(p => {
      if (!p.active) return false;
      p.x += p.speed;
      
      let hit = false;
      crates.current.forEach(c => {
        if (c.active && p.x >= c.x && p.x <= c.x + c.size && p.y >= c.y && p.y <= c.y + c.size) {
          c.active = false;
          setScore(s => s + 5);
          hit = true;
          p.active = false;
        }
      });
      
      return p.active && p.x < CANVAS_WIDTH;
    });

    crates.current = crates.current.filter(c => {
      c.x -= DEFAULT_SETTINGS.pipeSpeed;
      if (c.active && checkCollision(birdRect, { x: c.x, y: c.y, w: c.size, h: c.size })) handleGameOver(score);
      return c.x + c.size > 0;
    });

    pipes.current = pipes.current.filter(p => {
      p.x -= DEFAULT_SETTINGS.pipeSpeed;
      if (!p.passed && p.x + p.width < 50) { p.passed = true; setScore(s => s + 1); }
      if (checkCollision(birdRect, { x: p.x, y: 0, w: p.width, h: p.topHeight })) handleGameOver(score);
      if (checkCollision(birdRect, { x: p.x, y: p.bottomY, w: p.width, h: CANVAS_HEIGHT - p.bottomY })) handleGameOver(score);
      return p.x + p.width > 0;
    });
  }, [status, score, handleGameOver]);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || loading) return;

    ctx.save();
    ctx.translate(screenShake.x, screenShake.y);

    if (images.current.bg) ctx.drawImage(images.current.bg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    else { ctx.fillStyle = '#70c5ce'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); }

    pipes.current.forEach(p => {
      if (images.current.pipe) {
        ctx.save();
        ctx.translate(p.x + p.width / 2, p.topHeight / 2);
        ctx.scale(1, -1);
        ctx.drawImage(images.current.pipe, -p.width / 2, -p.topHeight / 2, p.width, p.topHeight);
        ctx.restore();
        ctx.drawImage(images.current.pipe, p.x, p.bottomY, p.width, CANVAS_HEIGHT - p.bottomY);
      }
    });

    crates.current.forEach(c => {
      if (c.active && images.current.crate) ctx.drawImage(images.current.crate, c.x, c.y, c.size, c.size);
    });

    // Draw Bullets with a glow effect
    projectiles.current.forEach(p => { 
      if (!p.active) return;
      ctx.fillStyle = '#fef08a';
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'yellow';
      ctx.beginPath(); 
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); 
      ctx.fill(); 
      ctx.shadowBlur = 0;
    });

    // REFINED ANIMATION LOGIC: Priority based but visually distinct
    let birdImg = images.current.birdNeutral;
    if (isDead.current) {
      birdImg = images.current.birdHit;
    } else if (shootTimer.current > 0) {
      // Shooting has priority for action feedback
      birdImg = images.current.birdShoot;
    } else if (birdVelocity.current < 0) {
      // Ascending (Jumping)
      birdImg = images.current.birdJump;
    }

    if (birdImg) ctx.drawImage(birdImg, 50, birdY.current, BIRD_SIZE, BIRD_SIZE);

    if (status === GameStatus.PLAYING) {
      ctx.fillStyle = 'white';
      ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 5;
      ctx.strokeText(score.toString(), CANVAS_WIDTH / 2, 60);
      ctx.fillText(score.toString(), CANVAS_WIDTH / 2, 60);
    }
    ctx.restore();
  }, [status, score, loading, screenShake]);

  const loop = useCallback((timestamp: number) => {
    update(timestamp);
    draw();
    frameId.current = requestAnimationFrame(loop);
  }, [update, draw]);

  useEffect(() => {
    frameId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId.current);
  }, [loop]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 p-4">
      <div className="relative shadow-[0_0_50px_rgba(0,0,0,0.5)] border-4 border-gray-800 rounded-2xl overflow-hidden bg-black"
           style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
           onClick={jump}>
        
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white font-bold italic animate-pulse">
            CARGANDO ASSETS...
          </div>
        )}

        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none z-50">
            <span key={countdown} className="text-white text-9xl font-black italic drop-shadow-[0_10px_10px_rgba(0,0,0,0.8)] animate-[ping_0.8s_ease-in-out_infinite]">
              {countdown}
            </span>
          </div>
        )}

        {status === GameStatus.START && countdown === null && (
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white text-center p-8 backdrop-blur-[2px]">
            <h1 className="text-5xl font-black mb-6 tracking-tighter text-yellow-400 drop-shadow-lg uppercase italic">Flappy Strike</h1>
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-white/10 p-3 rounded-lg border border-white/20">
                <p className="text-xs uppercase font-bold opacity-70 mb-1">Volar</p>
                <p className="text-sm font-bold">ESPACIO</p>
              </div>
              <div className="bg-white/10 p-3 rounded-lg border border-white/20">
                <p className="text-xs uppercase font-bold opacity-70 mb-1">Disparar</p>
                <p className="text-sm font-bold">TECLA F</p>
              </div>
            </div>
            <p className="text-xl animate-bounce font-bold">¡HAZ CLICK PARA EMPEZAR!</p>
          </div>
        )}

        {status === GameStatus.GAME_OVER && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-white text-center p-8 backdrop-blur-xl animate-in fade-in zoom-in duration-300">
            <h2 className="text-6xl font-black mb-2 text-red-600 drop-shadow-[0_4px_0_rgba(0,0,0,1)]">GAMEOVER</h2>
            <div className="flex gap-10 my-6">
              <div>
                <p className="text-xs uppercase font-bold opacity-50">Score</p>
                <p className="text-4xl font-black text-yellow-400">{score}</p>
              </div>
              <div>
                <p className="text-xs uppercase font-bold opacity-50">Best</p>
                <p className="text-4xl font-black text-blue-400">{highScore}</p>
              </div>
            </div>

            <div className="bg-gray-800/50 p-6 rounded-2xl italic text-lg mb-8 min-h-[120px] flex items-center justify-center border border-white/10 w-full relative">
              <span className="absolute -top-3 left-4 bg-red-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase">AI Roast</span>
              {isRoasting ? (
                <div className="flex gap-2"><div className="w-2 h-2 bg-white rounded-full animate-bounce"/><div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:0.2s]"/><div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:0.4s]"/></div>
              ) : `"${roast}"`}
            </div>

            <button 
              onClick={(e) => { e.stopPropagation(); runCountdown(); }}
              className="group relative bg-yellow-400 hover:bg-yellow-300 text-black font-black py-4 px-12 rounded-full transition-all shadow-[0_0_30px_rgba(234,179,8,0.4)] hover:scale-110 active:scale-95"
            >
              REINTENTAR
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
              </span>
            </button>
          </div>
        )}
      </div>
      <p className="mt-4 text-gray-500 text-[10px] font-mono tracking-widest uppercase">Precision Combat v2.1 • Hitbox: {HITBOX_MARGIN * 100}%</p>
    </div>
  );
};

export default App;
