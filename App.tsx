
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameStatus, Pipe } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, BIRD_SIZE, DEFAULT_SETTINGS, HITBOX_MARGIN, SHAKE_INTENSITY, SHAKE_DURATION } from './constants';
import { generateDeathRoast } from './services/geminiService';

// Assets con mejor compatibilidad CORS para producción en Netlify
const ASSETS = {
  bird: "https://raw.githubusercontent.com/samuelcust/flappy-bird-assets/master/sprites/yellowbird-midflap.png",
  pipe: "https://raw.githubusercontent.com/samuelcust/flappy-bird-assets/master/sprites/pipe-green.png",
  bg: "https://raw.githubusercontent.com/samuelcust/flappy-bird-assets/master/sprites/background-day.png"
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

const FIRE_RATE = 150; 

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
  const lastFiredTime = useRef<number>(0);
  const isDead = useRef<boolean>(false);
  
  const keysPressed = useRef<Record<string, boolean>>({});

  useEffect(() => {
    let loadedCount = 0;
    const entries = Object.entries(ASSETS);
    
    const timeout = setTimeout(() => {
      if (loading) setLoading(false);
    }, 2000);

    entries.forEach(([key, url]) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      img.onload = () => {
        loadedCount++;
        images.current[key] = img;
        if (loadedCount === entries.length) {
          clearTimeout(timeout);
          setLoading(false);
        }
      };
      img.onerror = () => {
        loadedCount++;
        if (loadedCount === entries.length) setLoading(false);
      };
    });
    return () => clearTimeout(timeout);
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
    keysPressed.current = {}; 
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
    lastFiredTime.current = 0;
    isDead.current = false;
    keysPressed.current = {};
    setScore(0);
    setRoast("");
    setStatus(GameStatus.PLAYING);
    lastPipeSpawn.current = performance.now();
  };

  const jump = useCallback(() => {
    if (status === GameStatus.START && countdown === null) runCountdown();
    else if (status === GameStatus.PLAYING) birdVelocity.current = DEFAULT_SETTINGS.jumpStrength;
  }, [status, countdown, runCountdown]);

  const fireSingleProjectile = useCallback(() => {
    projectiles.current.push({
      x: 70,
      y: birdY.current + BIRD_SIZE / 2,
      speed: 12,
      active: true
    });
    shootTimer.current = 6; 
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); jump(); }
      keysPressed.current[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => { keysPressed.current[e.code] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [jump]);

  const update = useCallback((timestamp: number) => {
    if (status !== GameStatus.PLAYING) return;
    if (keysPressed.current['KeyF'] && timestamp - lastFiredTime.current > FIRE_RATE) {
      fireSingleProjectile();
      lastFiredTime.current = timestamp;
    }
    if (shootTimer.current > 0) shootTimer.current--;

    birdVelocity.current += DEFAULT_SETTINGS.gravity;
    birdY.current += birdVelocity.current;

    if (birdY.current < -50 || birdY.current > CANVAS_HEIGHT + 50) {
      handleGameOver(score);
      return;
    }

    if (timestamp - lastPipeSpawn.current > DEFAULT_SETTINGS.pipeSpawnRate) {
      const minPipeH = 100;
      const gap = DEFAULT_SETTINGS.gapSize;
      const topHeight = Math.floor(Math.random() * (CANVAS_HEIGHT - gap - 2 * minPipeH)) + minPipeH;
      pipes.current.push({ x: CANVAS_WIDTH, topHeight, bottomY: topHeight + gap, width: 70, passed: false });
      
      if (Math.random() > 0.4) {
        crates.current.push({ x: CANVAS_WIDTH + 150, y: topHeight + gap/2 - 20, size: 40, active: true });
      }
      lastPipeSpawn.current = timestamp;
    }

    const margin = (1 - HITBOX_MARGIN) / 2;
    const bHit = { 
      l: 50 + BIRD_SIZE * margin, 
      r: 50 + BIRD_SIZE * (1 - margin), 
      t: birdY.current + BIRD_SIZE * margin, 
      b: birdY.current + BIRD_SIZE * (1 - margin) 
    };

    projectiles.current = projectiles.current.filter(p => {
      p.x += p.speed;
      crates.current.forEach(c => {
        if (c.active && p.x > c.x && p.x < c.x + c.size && p.y > c.y && p.y < c.y + c.size) {
          c.active = false; setScore(s => s + 5); p.active = false;
        }
      });
      return p.active && p.x < CANVAS_WIDTH;
    });

    crates.current = crates.current.filter(c => {
      c.x -= DEFAULT_SETTINGS.pipeSpeed;
      if (c.active && !(bHit.l > c.x + c.size || bHit.r < c.x || bHit.t > c.y + c.size || bHit.b < c.y)) handleGameOver(score);
      return c.x + c.size > 0;
    });

    pipes.current = pipes.current.filter(p => {
      p.x -= DEFAULT_SETTINGS.pipeSpeed;
      if (!p.passed && p.x < 50) { p.passed = true; setScore(s => s + 1); }
      const topCol = !(bHit.l > p.x + p.width || bHit.r < p.x || bHit.t > p.topHeight || bHit.b < 0);
      const botCol = !(bHit.l > p.x + p.width || bHit.r < p.x || bHit.t > CANVAS_HEIGHT || bHit.b < p.bottomY);
      if (topCol || botCol) handleGameOver(score);
      return p.x + p.width > 0;
    });
  }, [status, score, handleGameOver, fireSingleProjectile]);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.translate(screenShake.x, screenShake.y);

    // Fondo: Imagen o color sólido de respaldo
    if (images.current.bg && images.current.bg.complete && images.current.bg.naturalWidth > 0) {
      ctx.drawImage(images.current.bg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
      ctx.fillStyle = '#70c5ce';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Tuberías: Imagen o dibujo procedural
    pipes.current.forEach(p => {
      if (images.current.pipe && images.current.pipe.complete && images.current.pipe.naturalWidth > 0) {
        // Top pipe (invertida)
        ctx.save();
        ctx.translate(p.x + p.width/2, p.topHeight/2);
        ctx.scale(1, -1);
        ctx.drawImage(images.current.pipe, -p.width/2, -p.topHeight/2, p.width, p.topHeight);
        ctx.restore();
        // Bottom pipe
        ctx.drawImage(images.current.pipe, p.x, p.bottomY, p.width, CANVAS_HEIGHT - p.bottomY);
      } else {
        ctx.fillStyle = '#73bf2e';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.fillRect(p.x, 0, p.width, p.topHeight);
        ctx.strokeRect(p.x, 0, p.width, p.topHeight);
        ctx.fillRect(p.x, p.bottomY, p.width, CANVAS_HEIGHT - p.bottomY);
        ctx.strokeRect(p.x, p.bottomY, p.width, CANVAS_HEIGHT - p.bottomY);
      }
    });

    // Cajas
    crates.current.forEach(c => {
      if (c.active) {
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(c.x, c.y, c.size, c.size);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(c.x + 5, c.y + 5, c.size - 10, c.size - 10);
      }
    });

    // Proyectiles
    projectiles.current.forEach(p => {
      if (!p.active) return;
      ctx.fillStyle = '#ffff00';
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'yellow';
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Pájaro
    ctx.save();
    ctx.translate(50 + BIRD_SIZE/2, birdY.current + BIRD_SIZE/2);
    ctx.rotate(Math.min(Math.PI/4, Math.max(-Math.PI/4, birdVelocity.current * 0.1)));
    
    if (images.current.bird && images.current.bird.complete && images.current.bird.naturalWidth > 0) {
      ctx.drawImage(images.current.bird, -BIRD_SIZE/2, -BIRD_SIZE/2, BIRD_SIZE, BIRD_SIZE);
    } else {
      ctx.fillStyle = isDead.current ? '#ff4444' : '#f3e100';
      ctx.fillRect(-BIRD_SIZE/2, -BIRD_SIZE/2, BIRD_SIZE, BIRD_SIZE);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(-BIRD_SIZE/2, -BIRD_SIZE/2, BIRD_SIZE, BIRD_SIZE);
    }
    ctx.restore();

    // UI Score
    if (status === GameStatus.PLAYING) {
      ctx.fillStyle = 'white'; ctx.font = 'bold 48px Arial'; ctx.textAlign = 'center';
      ctx.strokeStyle = 'black'; ctx.lineWidth = 6;
      ctx.strokeText(score.toString(), CANVAS_WIDTH/2, 80);
      ctx.fillText(score.toString(), CANVAS_WIDTH/2, 80);
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#030712', padding: '1rem', color: 'white', fontFamily: 'sans-serif' }}>
      <div style={{ position: 'relative', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', borderRadius: '1.5rem', overflow: 'hidden', border: '8px solid #1f2937', width: CANVAS_WIDTH, height: CANVAS_HEIGHT, cursor: 'pointer' }}
           onClick={jump}>
        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
        
        {status === GameStatus.START && countdown === null && (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2rem', backdropFilter: 'blur(4px)' }}>
            <h1 style={{ fontSize: '3.75rem', fontWeight: 900, marginBottom: '1rem', color: '#facc15', fontStyle: 'italic', textShadow: '0 10px 15px rgba(0,0,0,0.5)' }}>FLAPPY<br/>STRIKE</h1>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '1rem', marginBottom: '2rem', border: '1px solid rgba(255,255,255,0.2)' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.7 }}>Controles</p>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <span style={{ padding: '0.25rem 0.75rem', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '0.25rem', fontSize: '0.75rem' }}>SPACE - SALTO</span>
                <span style={{ padding: '0.25rem 0.75rem', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '0.25rem', fontSize: '0.75rem' }}>F - FUEGO</span>
              </div>
            </div>
            <p style={{ fontSize: '1.5rem', fontWeight: 900, animation: 'pulse 2s infinite' }}>CLICK PARA EMPEZAR</p>
          </div>
        )}

        {countdown !== null && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '8rem', fontWeight: 900, fontStyle: 'italic', animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite' }}>{countdown}</span>
          </div>
        )}

        {status === GameStatus.GAME_OVER && (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(69, 10, 10, 0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <h2 style={{ fontSize: '4rem', fontWeight: 900, marginBottom: '1rem', fontStyle: 'italic' }}>FALLASTE</h2>
            <div style={{ display: 'flex', gap: '3rem', marginBottom: '2rem' }}>
              <div style={{ textAlign: 'center' }}><p style={{ fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.6 }}>Score</p><p style={{ fontSize: '3rem', fontWeight: 900, color: '#facc15' }}>{score}</p></div>
              <div style={{ textAlign: 'center' }}><p style={{ fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.6 }}>Record</p><p style={{ fontSize: '3rem', fontWeight: 900, color: '#60a5fa' }}>{highScore}</p></div>
            </div>
            <div style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: '1.5rem', borderRadius: '1rem', fontStyle: 'italic', fontSize: '1.125rem', marginBottom: '2rem', width: '100%', border: '1px solid rgba(255,255,255,0.1)', position: 'relative', textAlign: 'center', minHeight: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ position: 'absolute', top: '-0.75rem', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#dc2626', fontSize: '10px', fontWeight: 'bold', padding: '0.25rem 0.75rem', borderRadius: '9999px', textTransform: 'uppercase' }}>AI ROAST</span>
              {isRoasting ? "Pensando un insulto..." : `"${roast}"`}
            </div>
            <button onClick={(e) => { e.stopPropagation(); runCountdown(); }} style={{ backgroundColor: '#facc15', border: 'none', color: 'black', fontWeight: 900, padding: '1.25rem 3rem', borderRadius: '9999px', fontSize: '1.25rem', cursor: 'pointer', transition: 'transform 0.2s' }}>REINTENTAR</button>
          </div>
        )}
      </div>
      <p style={{ marginTop: '1.5rem', color: '#4b5563', fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        Netlify Production Build • Fixed Graphics • AI Enabled
      </p>
    </div>
  );
};

export default App;
