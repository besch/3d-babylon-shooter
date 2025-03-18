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

export type PlayerClass =
  | "Scout"
  | "Soldier"
  | "Pyro"
  | "Demoman"
  | "Heavy"
  | "Engineer"
  | "Medic"
  | "Sniper"
  | "Spy";

export interface Player {
  id: string;
  name: TechCompany;
  health: number;
  position: Vector3;
  rotation: Vector3;
  velocity: Vector3;
  isJumping: boolean;
  isCrouching: boolean;
  playerClass: PlayerClass;
  kills: number;
  deaths: number;
  lastUpdated: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface GameState {
  players: Record<string, Player>;
  projectiles: Projectile[];
}

export interface Projectile {
  id: string;
  playerId: string;
  position: Vector3;
  direction: Vector3;
  createdAt: number;
}

export interface GameSettings {
  maxHealth: number;
  shootsToKill: number;
  respawnTime: number;
  recoilForce: number;
  projectileSpeed: number;
  jumpForce: number;
  gravity: number;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  realtimeChannel: string;
}
