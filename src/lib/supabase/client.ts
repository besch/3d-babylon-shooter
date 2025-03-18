import { createBrowserClient } from "@supabase/ssr";
import { SupabaseConfig } from "@/game/types";

// Default Supabase configuration
const defaultConfig: SupabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  realtimeChannel: "tech-fps-game",
};

// Create a singleton Supabase client
let supabaseClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseClient(config: Partial<SupabaseConfig> = {}) {
  // Only create the client on the client-side
  if (typeof window === "undefined") {
    return null;
  }

  // If we've already created the client, return it
  if (supabaseClient) {
    return supabaseClient;
  }

  // Merge default config with provided config
  const finalConfig = { ...defaultConfig, ...config };

  // Create the client
  supabaseClient = createBrowserClient(finalConfig.url, finalConfig.anonKey);

  return supabaseClient;
}

// Helper functions for realtime game state

export async function joinGameChannel(
  channel: string = defaultConfig.realtimeChannel
) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  return supabase.channel(channel);
}

export async function sendPlayerUpdate(player: any) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  return supabase.from("players").upsert({
    id: player.id,
    name: player.name,
    position_x: player.position.x,
    position_y: player.position.y,
    position_z: player.position.z,
    rotation_x: player.rotation.x,
    rotation_y: player.rotation.y,
    rotation_z: player.rotation.z,
    velocity_x: player.velocity.x,
    velocity_y: player.velocity.y,
    velocity_z: player.velocity.z,
    is_jumping: player.isJumping,
    is_crouching: player.isCrouching,
    player_class: player.playerClass,
    health: player.health,
    kills: player.kills,
    deaths: player.deaths,
    last_updated: new Date().toISOString(),
  });
}

export async function sendProjectile(projectile: any) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  return supabase.from("projectiles").insert({
    id: projectile.id,
    player_id: projectile.playerId,
    position_x: projectile.position.x,
    position_y: projectile.position.y,
    position_z: projectile.position.z,
    direction_x: projectile.direction.x,
    direction_y: projectile.direction.y,
    direction_z: projectile.direction.z,
    created_at: new Date().toISOString(),
  });
}

export async function getActivePlayers() {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: [] };

  // Only get players that have updated in the last minute
  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  return supabase.from("players").select("*").gt("last_updated", oneMinuteAgo);
}

export async function listenForPlayerUpdates(callback: (payload: any) => void) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  return supabase
    .channel("players-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "players" },
      callback
    )
    .subscribe();
}

export async function listenForProjectiles(callback: (payload: any) => void) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  return supabase
    .channel("projectiles-changes")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "projectiles" },
      callback
    )
    .subscribe();
}

export async function sendMapObject(mapObject: any) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  return supabase.from("map_objects").upsert({
    id: mapObject.id,
    type: mapObject.type,
    position_x: mapObject.position.x,
    position_y: mapObject.position.y,
    position_z: mapObject.position.z,
    rotation_x: mapObject.rotation.x,
    rotation_y: mapObject.rotation.y,
    rotation_z: mapObject.rotation.z,
    scaling_x: mapObject.scaling.x,
    scaling_y: mapObject.scaling.y,
    scaling_z: mapObject.scaling.z,
    color: mapObject.color,
    last_updated: new Date().toISOString(),
  });
}

export async function getMapObjects() {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: [] };

  return supabase.from("map_objects").select("*");
}

export async function listenForMapObjectUpdates(
  callback: (payload: any) => void
) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  return supabase
    .channel("map-objects-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "map_objects" },
      callback
    )
    .subscribe();
}

/**
 * Send player damage update to the server
 */
export async function updatePlayerHealth(playerId: string, newHealth: number) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  return supabase
    .from("players")
    .update({
      health: newHealth,
      last_updated: new Date().toISOString(),
    })
    .eq("id", playerId);
}

/**
 * Update player deaths count
 */
export async function incrementPlayerDeaths(playerId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  // First get current deaths count
  const { data } = await supabase
    .from("players")
    .select("deaths")
    .eq("id", playerId)
    .single();

  if (data) {
    // Increment deaths count
    return supabase
      .from("players")
      .update({
        deaths: data.deaths + 1,
        last_updated: new Date().toISOString(),
      })
      .eq("id", playerId);
  }
}

/**
 * Update player kills count
 */
export async function incrementPlayerKills(playerId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  // First get current kills count
  const { data } = await supabase
    .from("players")
    .select("kills")
    .eq("id", playerId)
    .single();

  if (data) {
    // Increment kills count
    return supabase
      .from("players")
      .update({
        kills: data.kills + 1,
        last_updated: new Date().toISOString(),
      })
      .eq("id", playerId);
  }
}
