
import { GameSettings } from './types';

export const CANVAS_WIDTH = 400;
export const CANVAS_HEIGHT = 600;
export const BIRD_SIZE = 40;

// NEW: Hitbox scaling (0.8 means 80% of the visual size)
export const HITBOX_MARGIN = 0.8; 
export const SHAKE_INTENSITY = 10;
export const SHAKE_DURATION = 300; // ms

export const DEFAULT_SETTINGS: GameSettings = {
  gravity: 0.25,
  jumpStrength: -6,
  pipeSpeed: 3,
  pipeSpawnRate: 1500, // ms
  gapSize: 170 // Increased slightly for fair play
};

export const COLORS = {
  SKY: '#70c5ce',
  BIRD: '#f3e100',
  PIPE: '#73bf2e',
  PIPE_BORDER: '#000000',
};
