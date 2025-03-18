export type TechCompany =
  | "Google"
  | "Facebook"
  | "Twitter"
  | "Microsoft"
  | "Apple"
  | "Amazon"
  | "Netflix"
  | "Tesla"
  | "Uber"
  | "Airbnb";

export interface Player {
  id: string;
  name: TechCompany;
  health: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  kills: number;
  deaths: number;
}

export interface GameState {
  players: Record<string, Player>;
  projectiles: Projectile[];
}

export interface Projectile {
  id: string;
  playerId: string;
  position: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  createdAt: number;
}

export interface GameSettings {
  maxHealth: number;
  shootsToKill: number;
  respawnTime: number;
  recoilForce: number;
  projectileSpeed: number;
}
