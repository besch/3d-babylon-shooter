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

// Add type for Player data structure used in Supabase
export type PlayerData = {
  id: string;
  name: string;
  position_x: number;
  position_y: number;
  position_z: number;
  rotation_x: number;
  rotation_y: number;
  rotation_z: number;
  velocity_x: number;
  velocity_y: number;
  velocity_z: number;
  is_jumping: boolean;
  is_crouching: boolean;
  player_class?: string;
  health: number;
  kills: number;
  deaths: number;
  is_active?: boolean;
  last_updated: string;
};

// Add type for MapObject data structure used in Supabase
export type MapObjectData = {
  id: string;
  type: "platform" | "building" | "light";
  position_x: number;
  position_y: number;
  position_z: number;
  rotation_x: number;
  rotation_y: number;
  rotation_z: number;
  scaling_x: number;
  scaling_y: number;
  scaling_z: number;
  color: string;
  last_updated: string;
};

// Add type for Projectile data structure used in Supabase
export type ProjectileData = {
  id: string;
  player_id: string;
  position_x: number;
  position_y: number;
  position_z: number;
  direction_x: number;
  direction_y: number;
  direction_z: number;
  created_at: string;
};

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

export async function sendPlayerUpdate(player: {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  isJumping: boolean;
  isCrouching: boolean;
  playerClass?: string;
  health: number;
  kills: number;
  deaths: number;
  lastUpdated: number;
}) {
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

export async function sendProjectile(projectile: {
  id: string;
  player_id: string;
  position_x: number;
  position_y: number;
  position_z: number;
  direction_x: number;
  direction_y: number;
  direction_z: number;
  created_at?: string;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    // Make sure we're sending the data in the format expected by the database
    const projectileData = {
      id: projectile.id,
      player_id: projectile.player_id,
      position_x: projectile.position_x,
      position_y: projectile.position_y,
      position_z: projectile.position_z,
      direction_x: projectile.direction_x,
      direction_y: projectile.direction_y,
      direction_z: projectile.direction_z,
      created_at: projectile.created_at || new Date().toISOString(),
    };

    console.log("Sending projectile to Supabase:", projectileData);

    // Insert the projectile data
    const { data, error } = await supabase
      .from("projectiles")
      .insert(projectileData);

    if (error) {
      console.error("Error saving projectile:", error);
    }

    return { data, error };
  } catch (err) {
    console.error("Exception saving projectile:", err);
    return { data: null, error: err };
  }
}

export async function getActivePlayers() {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: [] };

  // Only get players that have updated in the last minute
  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  return supabase.from("players").select("*").gt("last_updated", oneMinuteAgo);
}

export async function listenForPlayerUpdates(
  callback: (payload: {
    eventType: string;
    new: PlayerData;
    old?: Partial<PlayerData>;
  }) => void
) {
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

export async function listenForProjectiles(
  callback: (payload: {
    eventType: string;
    new: ProjectileData;
    old?: Partial<ProjectileData>;
  }) => void
) {
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

export async function sendMapObject(mapObject: {
  id: string;
  type: "platform" | "building" | "light";
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scaling: { x: number; y: number; z: number };
  color: string;
  lastUpdated: number;
}) {
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
  callback: (payload: {
    eventType: string;
    new: MapObjectData;
    old?: Partial<MapObjectData>;
  }) => void
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

  try {
    // Ensure health is an integer as required by the database schema
    const healthValue = Math.round(newHealth);
    console.log(
      `Updating player ${playerId} health to ${healthValue} (rounded from ${newHealth})`
    );

    // Format data strictly according to the database schema
    const updateData = {
      health: healthValue,
      last_updated: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("players")
      .update(updateData)
      .eq("id", playerId);

    if (error) {
      console.error("Error updating player health:", error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    console.error("Exception updating player health:", err);
    return { data: null, error: err };
  }
}

/**
 * Update player deaths count
 */
export async function incrementPlayerDeaths(playerId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: "Supabase client not available" };

  try {
    // First get current deaths count
    const { data, error } = await supabase
      .from("players")
      .select("deaths")
      .eq("id", playerId)
      .single();

    if (error) {
      console.error("Error fetching player deaths:", error);
      return { data: null, error };
    }

    if (!data) {
      console.error("Player not found:", playerId);
      return { data: null, error: "Player not found" };
    }

    // Increment deaths count
    const updateResult = await supabase
      .from("players")
      .update({
        deaths: (data.deaths || 0) + 1,
        last_updated: new Date().toISOString(),
      })
      .eq("id", playerId);

    if (updateResult.error) {
      console.error("Error incrementing deaths:", updateResult.error);
    }

    return updateResult;
  } catch (err) {
    console.error("Exception incrementing deaths:", err);
    return { data: null, error: err };
  }
}

/**
 * Update player kills count
 */
export async function incrementPlayerKills(playerId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return { data: null, error: "Supabase client not available" };

  try {
    // First get current kills count
    const { data, error } = await supabase
      .from("players")
      .select("kills")
      .eq("id", playerId)
      .single();

    if (error) {
      console.error("Error fetching player kills:", error);
      return { data: null, error };
    }

    if (!data) {
      console.error("Player not found:", playerId);
      return { data: null, error: "Player not found" };
    }

    // Increment kills count
    const updateResult = await supabase
      .from("players")
      .update({
        kills: (data.kills || 0) + 1,
        last_updated: new Date().toISOString(),
      })
      .eq("id", playerId);

    if (updateResult.error) {
      console.error("Error incrementing kills:", updateResult.error);
    }

    return updateResult;
  } catch (err) {
    console.error("Exception incrementing kills:", err);
    return { data: null, error: err };
  }
}

// Add a function to properly delete a player
export async function deletePlayer(playerId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase client not available" };

  console.log(`Deleting player ${playerId} from database`);

  try {
    // First check if the player exists
    const { error: checkError } = await supabase
      .from("players")
      .select("id")
      .eq("id", playerId)
      .single();

    if (checkError) {
      console.warn(
        `Player ${playerId} not found or error checking existence:`,
        checkError
      );
      return { error: checkError };
    }

    // First delete all projectiles that reference this player to avoid FK constraint violations
    try {
      console.log(`Deleting all projectiles for player ${playerId}`);

      const { error: deleteProjectilesError } = await supabase
        .from("projectiles")
        .delete()
        .eq("player_id", playerId);

      if (deleteProjectilesError) {
        console.warn(
          `Warning: Could not delete projectiles for player ${playerId}:`,
          deleteProjectilesError
        );
        // Continue anyway, we'll try marking as inactive as fallback
      } else {
        console.log(`Successfully deleted projectiles for player ${playerId}`);
      }
    } catch (projectilesError) {
      console.warn("Error cleaning up projectiles:", projectilesError);
      // Continue with player deletion/inactivation regardless
    }

    // Now try to delete the player
    const { error } = await supabase
      .from("players")
      .delete()
      .eq("id", playerId);

    if (error) {
      console.error(`Error deleting player ${playerId}:`, error);

      // If we still get a conflict error after projectile cleanup, mark as inactive
      if (error.code === "409" || error.code === "23503") {
        console.log(
          "Conflict error - trying to mark player as inactive instead"
        );

        // Use PATCH instead of UPDATE to avoid additional validation issues
        const { error: updateError } = await supabase
          .from("players")
          .update({
            is_active: false,
            health: 0,
            last_updated: new Date().toISOString(),
          })
          .eq("id", playerId);

        if (updateError) {
          console.error("Failed to mark player as inactive:", updateError);
          return { error: updateError };
        } else {
          console.log(`Player ${playerId} marked as inactive`);
          return { success: true, wasMarkedInactive: true };
        }
      }

      return { error };
    }

    console.log(`Player ${playerId} deleted successfully`);
    return { success: true };
  } catch (err) {
    console.error(`Exception deleting player ${playerId}:`, err);
    return { error: err };
  }
}
