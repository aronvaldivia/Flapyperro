
export enum GameStatus {
  START = 'START',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export interface Pipe {
  x: number;
  topHeight: number;
  bottomY: number;
  width: number;
  passed: boolean;
}

export interface GameSettings {
  gravity: number;
  jumpStrength: number;
  pipeSpeed: number;
  pipeSpawnRate: number;
  gapSize: number;
}
