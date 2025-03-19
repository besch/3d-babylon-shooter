"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { GameSettings, Player, TechCompany, MapObject } from "@/game/types";
// Import the GameEngine type but import the actual engine dynamically
import type { GameEngine } from "@/game/engine";
import {
  getSupabaseClient,
  listenForPlayerUpdates,
  sendPlayerUpdate,
  getMapObjects,
  listenForMapObjectUpdates,
  sendMapObject,
  listenForProjectiles,
} from "@/lib/supabase/client";

const TECH_COMPANIES: TechCompany[] = [
  "Google",
  "Facebook",
  "Twitter",
  "Microsoft",
  "Apple",
  "Amazon",
  "Netflix",
  "Tesla",
  "Uber",
  "Airbnb",
];

export function GameContainer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [playerName, setPlayerName] = useState<TechCompany>("Google");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [debug, setDebug] = useState<string[]>([]);
  const [otherPlayers, setOtherPlayers] = useState<Player[]>([]);
  const [localPlayer, setLocalPlayer] = useState<Player | null>(null);
  const supabaseRef = useRef<any>(null);
  const [mapObjects, setMapObjects] = useState<MapObject[]>([]);
  // Add state for player stats UI
  const [playerHealth, setPlayerHealth] = useState(100);
  const [playerKills, setPlayerKills] = useState(0);
  const [playerDeaths, setPlayerDeaths] = useState(0);

  // Add a debug message
  const addDebugMessage = (message: string) => {
    console.log(message);
    setDebug((prev) => [...prev.slice(-9), message]);
  };

  // Initialize the game engine when the component mounts
  useEffect(() => {
    // Cleanup function
    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, []);

  // Use a separate useEffect to make sure the canvas is properly mounted
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      // Just ensure the canvas is correctly sized
      const resizeCanvas = () => {
        if (canvas) {
          canvas.width = canvas.clientWidth;
          canvas.height = canvas.clientHeight;
          addDebugMessage(`Canvas resized: ${canvas.width}x${canvas.height}`);
        }
      };

      window.addEventListener("resize", resizeCanvas);
      resizeCanvas();

      return () => {
        window.removeEventListener("resize", resizeCanvas);
      };
    }
  }, []);

  // Initialize Supabase client
  useEffect(() => {
    if (typeof window !== "undefined") {
      supabaseRef.current = getSupabaseClient();
    }
  }, []);

  // Set up realtime subscription
  useEffect(() => {
    if (!supabaseRef.current) return;

    // Track the last state for each player to prevent duplicate updates
    const playerLastStates = new Map<
      string,
      {
        isJumping: boolean;
        isCrouching: boolean;
        x: number;
        y: number;
        z: number;
        health: number;
        lastUpdateTime: number;
      }
    >();

    let subscription: any;
    listenForPlayerUpdates((payload) => {
      // Handle DELETE events
      if (payload.eventType === "DELETE") {
        if (payload.old && payload.old.id) {
          setOtherPlayers((prev) =>
            prev.filter((p) => p.id !== payload.old.id)
          );
          playerLastStates.delete(payload.old.id);
          // Remove player from the game engine if it's initialized
          if (engineRef.current) {
            engineRef.current.removePlayer(payload.old.id);
          }
        }
        return;
      }

      // Handle player updates
      if (payload.new && payload.new.id !== localPlayer?.id) {
        // Skip inactive players
        if (payload.new.is_active === false) {
          // If player became inactive, remove them
          if (payload.old?.is_active === true) {
            console.log(
              `Player ${payload.new.id} became inactive, removing from view`
            );
            setOtherPlayers((prev) =>
              prev.filter((p) => p.id !== payload.new.id)
            );
            playerLastStates.delete(payload.new.id);
            if (engineRef.current) {
              engineRef.current.removePlayer(payload.new.id);
            }
          }
          return;
        }

        const now = Date.now();
        const lastState = playerLastStates.get(payload.new.id);
        const minTimeBetweenUpdates = 50; // ms

        // Check if this is a meaningful update we should process
        const isSignificantUpdate =
          !lastState ||
          // Significant position change
          Math.abs(lastState.x - payload.new.position_x) > 0.1 ||
          Math.abs(lastState.y - payload.new.position_y) > 0.1 ||
          Math.abs(lastState.z - payload.new.position_z) > 0.1 ||
          // State change
          lastState.isJumping !== payload.new.is_jumping ||
          lastState.isCrouching !== payload.new.is_crouching ||
          // Health change
          lastState.health !== payload.new.health ||
          // Timeout - process update regardless if it's been a while
          now - lastState.lastUpdateTime > 500;

        // Skip if not significant and we received the update too quickly
        if (
          lastState &&
          !isSignificantUpdate &&
          now - lastState.lastUpdateTime < minTimeBetweenUpdates
        ) {
          return;
        }

        // Log only real jumping or crouching state changes
        if (
          lastState &&
          (lastState.isJumping !== payload.new.is_jumping ||
            lastState.isCrouching !== payload.new.is_crouching)
        ) {
          console.log(
            `Player ${payload.new.id} state change: jumping=${payload.new.is_jumping}, crouching=${payload.new.is_crouching}`
          );
        }

        const player: Player = {
          id: payload.new.id,
          name: payload.new.name,
          health: payload.new.health,
          position: {
            x: payload.new.position_x,
            y: payload.new.position_y,
            z: payload.new.position_z,
          },
          rotation: {
            x: payload.new.rotation_x,
            y: payload.new.rotation_y,
            z: payload.new.rotation_z,
          },
          velocity: {
            x: payload.new.velocity_x,
            y: payload.new.velocity_y,
            z: payload.new.velocity_z,
          },
          isJumping: payload.new.is_jumping,
          isCrouching: payload.new.is_crouching,
          playerClass: payload.new.player_class,
          kills: payload.new.kills,
          deaths: payload.new.deaths,
          lastUpdated: new Date(payload.new.last_updated).getTime(),
        };

        // Update our tracking of the player's last state
        playerLastStates.set(payload.new.id, {
          isJumping: payload.new.is_jumping,
          isCrouching: payload.new.is_crouching,
          x: payload.new.position_x,
          y: payload.new.position_y,
          z: payload.new.position_z,
          health: payload.new.health,
          lastUpdateTime: now,
        });

        // Immediately update the player in the game engine
        if (engineRef.current) {
          engineRef.current.updatePlayer(player);
        }

        // Update player in state
        setOtherPlayers((prev) => {
          const filtered = prev.filter((p) => p.id !== player.id);
          return [...filtered, player];
        });
      }
    }).then((sub) => {
      subscription = sub;
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [localPlayer?.id, engineRef.current]);

  // Setup subscription for projectiles from other players
  useEffect(() => {
    if (!supabaseRef.current || !engineRef.current || !isPlaying) return;

    let subscription: any;
    listenForProjectiles((payload) => {
      if (payload.new && payload.new.player_id !== localPlayer?.id) {
        // Create projectile from another player
        console.log("Received projectile from server:", payload.new.id);
        engineRef.current?.createRemoteProjectile({
          id: payload.new.id,
          playerId: payload.new.player_id,
          position: {
            x: payload.new.position_x,
            y: payload.new.position_y,
            z: payload.new.position_z,
          },
          direction: {
            x: payload.new.direction_x,
            y: payload.new.direction_y,
            z: payload.new.direction_z,
          },
        });
      }
    }).then((sub) => {
      subscription = sub;
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [localPlayer?.id, engineRef.current, isPlaying]);

  // Set up realtime subscription for map objects
  useEffect(() => {
    if (!supabaseRef.current) return;

    let subscription: any;

    // First, get all existing map objects
    getMapObjects().then((response) => {
      if (response.data) {
        const objects: MapObject[] = response.data.map((item: any) => ({
          id: item.id,
          type: item.type,
          position: {
            x: item.position_x,
            y: item.position_y,
            z: item.position_z,
          },
          rotation: {
            x: item.rotation_x,
            y: item.rotation_y,
            z: item.rotation_z,
          },
          scaling: {
            x: item.scaling_x,
            y: item.scaling_y,
            z: item.scaling_z,
          },
          color: item.color,
          lastUpdated: new Date(item.last_updated).getTime(),
        }));
        setMapObjects(objects);
      }
    });

    // Listen for updates
    listenForMapObjectUpdates((payload) => {
      if (payload.new) {
        const mapObject: MapObject = {
          id: payload.new.id,
          type: payload.new.type,
          position: {
            x: payload.new.position_x,
            y: payload.new.position_y,
            z: payload.new.position_z,
          },
          rotation: {
            x: payload.new.rotation_x,
            y: payload.new.rotation_y,
            z: payload.new.rotation_z,
          },
          scaling: {
            x: payload.new.scaling_x,
            y: payload.new.scaling_y,
            z: payload.new.scaling_z,
          },
          color: payload.new.color,
          lastUpdated: new Date(payload.new.last_updated).getTime(),
        };

        setMapObjects((prev) => {
          const filtered = prev.filter((o) => o.id !== mapObject.id);
          return [...filtered, mapObject];
        });
      }
    }).then((sub) => {
      subscription = sub;
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Update player position periodically
  useEffect(() => {
    if (!isPlaying || !localPlayer || !engineRef.current) return;

    let lastPositionUpdate = {
      x: 0,
      y: 0,
      z: 0,
      time: 0,
    };

    const minMovementThreshold = 0.05; // Minimum movement before sending update
    const minUpdateInterval = 200; // Minimum time between updates in ms

    const interval = setInterval(() => {
      if (engineRef.current) {
        const camera = engineRef.current.getCamera();
        if (camera) {
          const now = Date.now();

          // Calculate distance moved since last update
          const distMoved = Math.sqrt(
            Math.pow(camera.position.x - lastPositionUpdate.x, 2) +
              Math.pow(camera.position.z - lastPositionUpdate.z, 2)
          );

          // Only update if moved enough or enough time has passed
          const shouldUpdate =
            distMoved > minMovementThreshold ||
            now - lastPositionUpdate.time > 1000; // Force update after 1 second

          if (shouldUpdate && !localPlayer.isJumping) {
            // Update local player state with current position
            const updatedPlayer = {
              ...localPlayer,
              position: {
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z,
              },
              rotation: {
                x: camera.rotation.x,
                y: camera.rotation.y,
                z: camera.rotation.z,
              },
              lastUpdated: now,
            };

            // Update local state
            setLocalPlayer(updatedPlayer);

            // Only if enough time has passed since last network update
            if (now - lastPositionUpdate.time >= minUpdateInterval) {
              // Send to server but only during regular movement, not during jumps
              // (jumps are handled directly in the engine.ts with more frequent updates)
              sendPlayerUpdate(updatedPlayer);

              // Remember this position and time
              lastPositionUpdate = {
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z,
                time: now,
              };
            }
          }
        }
      }
    }, 100); // Check position every 100ms

    return () => clearInterval(interval);
  }, [isPlaying, localPlayer]);

  // Update other players in the game engine
  useEffect(() => {
    if (!engineRef.current) return;

    otherPlayers.forEach((player) => {
      engineRef.current?.updatePlayer(player);
    });
  }, [otherPlayers]);

  // Update map objects in the game engine
  useEffect(() => {
    if (!engineRef.current) return;

    mapObjects.forEach((object) => {
      engineRef.current?.updateMapObject(object);
    });
  }, [mapObjects]);

  // Delete player from the database when the game is stopped
  useEffect(() => {
    // When the game stops, clean up player data
    return () => {
      if (localPlayer) {
        deletePlayerOnExit(localPlayer.id).catch(console.error);
      }
    };
  }, [localPlayer?.id]);

  // Clean up player when they close the window/tab
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (localPlayer) {
        // Using navigator.sendBeacon for more reliable cleanup on page close
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (supabaseUrl && supabaseKey) {
          const url = `${supabaseUrl}/rest/v1/players?id=eq.${localPlayer.id}`;
          const headers = {
            "Content-Type": "application/json",
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            Prefer: "return=minimal",
          };

          navigator.sendBeacon(
            url,
            JSON.stringify({
              headers,
              method: "DELETE",
            })
          );
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [localPlayer]);

  // Add a new effect to update player stats for UI
  useEffect(() => {
    if (!isPlaying || !localPlayer) return;

    // Initial update of UI stats from local player state
    setPlayerHealth(localPlayer.health);
    setPlayerKills(localPlayer.kills);
    setPlayerDeaths(localPlayer.deaths);

    // Setup an interval to keep checking for health/stats changes
    const statsInterval = setInterval(() => {
      if (engineRef.current && localPlayer) {
        // Check if local player state needs updating by querying the engine's internal state
        const currentPlayer = engineRef.current.getLocalPlayer();

        if (currentPlayer) {
          // Always update UI values to match the actual player state in the engine
          if (currentPlayer.health !== playerHealth) {
            console.log(
              `Health UI update: ${playerHealth} -> ${currentPlayer.health}`
            );
            setPlayerHealth(currentPlayer.health);
          }

          if (currentPlayer.kills !== playerKills) {
            console.log(
              `Kills UI update: ${playerKills} -> ${currentPlayer.kills}`
            );
            setPlayerKills(currentPlayer.kills);
          }

          if (currentPlayer.deaths !== playerDeaths) {
            console.log(
              `Deaths UI update: ${playerDeaths} -> ${currentPlayer.deaths}`
            );
            setPlayerDeaths(currentPlayer.deaths);
          }
        }
      }
    }, 100); // Check more frequently (every 100ms instead of 250ms)

    return () => {
      clearInterval(statsInterval);

      // Reset stats when game stops
      setPlayerHealth(100);
      setPlayerKills(0);
      setPlayerDeaths(0);
    };
  }, [isPlaying, localPlayer]);

  const startGame = async () => {
    if (!canvasRef.current) {
      setError("Canvas not available");
      return;
    }

    // Reset states
    setError(null);
    setIsLoading(true);
    setDebug([]);
    setPlayerHealth(100);
    setPlayerKills(0);
    setPlayerDeaths(0);

    try {
      addDebugMessage("Starting game initialization");
      addDebugMessage("Canvas ready: " + (canvasRef.current !== null));

      // Make sure the canvas is the right size
      const canvas = canvasRef.current;
      canvas.width = canvas.clientWidth || 800;
      canvas.height = canvas.clientHeight || 600;

      addDebugMessage(`Canvas size: ${canvas.width}x${canvas.height}`);

      // Dynamically import the game engine (client-side only)
      addDebugMessage("Importing game engine module");
      const gameEngineModule = await import("@/game/engine");
      addDebugMessage("Game engine module imported");

      // Create the game engine
      addDebugMessage("Creating game engine instance");
      const engine = new gameEngineModule.GameEngine(canvas);
      engineRef.current = engine;

      // Initialize the engine
      addDebugMessage("Initializing engine");
      const initialized = await engine.initialize();

      if (!initialized) {
        addDebugMessage("Failed to initialize game engine");
        setError("Failed to initialize game engine");
        setIsLoading(false);
        return;
      }

      addDebugMessage("Engine initialized successfully");

      // Create the cyberpunk map
      addDebugMessage("Creating map");
      engine.createCyberpunkMap();

      // Try to enable physics (simplified now)
      addDebugMessage("Setting up physics");
      engine.enablePhysics();

      // Create a local player
      addDebugMessage("Creating local player");
      const newPlayer: Player = {
        id: uuidv4(),
        name: playerName,
        health: 100,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        isJumping: false,
        isCrouching: false,
        playerClass: "Soldier",
        kills: 0,
        deaths: 0,
        lastUpdated: Date.now(),
      };

      // Set the local player in the component state
      setLocalPlayer(newPlayer);

      // Set the local player in the game engine
      engine.setLocalPlayer(newPlayer);

      // Register health update callback for direct UI updates
      engine.onLocalPlayerHit((newHealth) => {
        console.log("Local player health update:", newHealth);
        setPlayerHealth(newHealth);

        // Update the local player state with the new health value
        setLocalPlayer((current) => {
          if (!current) return current;
          return { ...current, health: newHealth };
        });
      });

      // Add a new callback to handle kill and death count updates
      engine.onPlayerStatsUpdate = (stats) => {
        console.log("Player stats update:", stats);

        // Update kills and deaths counters in the UI
        if (stats.kills !== undefined) {
          setPlayerKills(stats.kills);
        }

        if (stats.deaths !== undefined) {
          setPlayerDeaths(stats.deaths);
        }

        // Update the local player state to stay in sync
        setLocalPlayer((current) => {
          if (!current) return current;
          return {
            ...current,
            kills: stats.kills !== undefined ? stats.kills : current.kills,
            deaths: stats.deaths !== undefined ? stats.deaths : current.deaths,
          };
        });
      };

      // Register initial player position with Supabase
      addDebugMessage("Registering player with server");
      try {
        await sendPlayerUpdate(newPlayer);
        addDebugMessage("Player registered successfully");
      } catch (err) {
        addDebugMessage("Warning: Failed to register player with server");
        console.warn("Failed to register player:", err);
      }

      // Skip creating dummy players in multiplayer mode
      // as we'll get real players from Supabase

      // Enable debug layer if debug mode is on
      if (isDebugMode) {
        addDebugMessage("Enabling debug layer");
        engine.enableDebugLayer();
      }

      addDebugMessage("Game started successfully");
      setIsPlaying(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      addDebugMessage(`Error starting game: ${errorMessage}`);
      console.error("Error starting game:", err);
      setError(`Failed to start game: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const stopGame = () => {
    if (localPlayer) {
      // Delete the player from the database when stopping the game
      deletePlayerOnExit(localPlayer.id).catch(console.error);
    }

    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }

    setIsPlaying(false);
    setDebug([]);
    setLocalPlayer(null); // Clear the local player when stopping the game
    setOtherPlayers([]); // Clear other players

    // Reset player stats
    setPlayerHealth(100);
    setPlayerKills(0);
    setPlayerDeaths(0);
  };

  const generateDummyPlayers = (
    count: number,
    excludeName: TechCompany
  ): Player[] => {
    const players: Player[] = [];
    const availableNames = TECH_COMPANIES.filter(
      (name) => name !== excludeName
    );

    for (let i = 0; i < count; i++) {
      const nameIndex = Math.floor(Math.random() * availableNames.length);
      const name = availableNames[nameIndex];
      availableNames.splice(nameIndex, 1); // Remove used name

      players.push({
        id: uuidv4(),
        name,
        health: 100,
        position: {
          x: (Math.random() - 0.5) * 20,
          y: 0,
          z: (Math.random() - 0.5) * 20 + 10,
        },
        rotation: {
          x: 0,
          y: Math.random() * Math.PI * 2,
          z: 0,
        },
        velocity: { x: 0, y: 0, z: 0 },
        isJumping: false,
        isCrouching: false,
        playerClass: "Soldier",
        kills: 0,
        deaths: 0,
        lastUpdated: Date.now(),
      });
    }

    return players;
  };

  const changePlayerName = () => {
    const availableNames = TECH_COMPANIES.filter((name) => name !== playerName);
    const randomIndex = Math.floor(Math.random() * availableNames.length);
    setPlayerName(availableNames[randomIndex]);
  };

  // Clean up function to delete the player when leaving the game
  const deletePlayerOnExit = async (playerId: string) => {
    if (!supabaseRef.current) return;
    try {
      console.log("Deleting player on exit:", playerId);

      // Use the new proper deletePlayer function
      const { deletePlayer } = await import("@/lib/supabase/client");
      await deletePlayer(playerId);
    } catch (error) {
      console.error("Error deleting player on exit:", error);
    }
  };

  // Helper function to get health color based on current health
  const getHealthColor = (health: number) => {
    if (health > 70) return "bg-green-500";
    if (health > 30) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-black">
      {/* Always render the canvas, but hidden when not playing */}
      <div
        className={`absolute w-full h-full ${isPlaying ? "block" : "hidden"}`}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full bg-black"
          id="gameCanvas"
        />

        {isPlaying && (
          <>
            {/* Game stats UI - positioned in top left */}
            <div className="absolute top-4 left-4 flex flex-col space-y-2 p-3 bg-black/70 backdrop-blur-sm rounded-lg border border-gray-700 text-white font-mono max-w-48 z-10">
              {/* Player health bar */}
              <div className="flex flex-col">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold">HEALTH</span>
                  <span className="text-xs">{playerHealth}/100</span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getHealthColor(
                      playerHealth
                    )} transition-all duration-300`}
                    style={{ width: `${playerHealth}%` }}
                  ></div>
                </div>
              </div>

              {/* Score stats */}
              <div className="flex justify-between items-center pt-1 border-t border-gray-700">
                <div className="flex flex-col items-center">
                  <span className="text-xs text-gray-400">KILLS</span>
                  <span className="text-lg font-bold text-green-400">
                    {playerKills}
                  </span>
                </div>
                <div className="text-xl font-bold text-gray-500 mx-2">:</div>
                <div className="flex flex-col items-center">
                  <span className="text-xs text-gray-400">DEATHS</span>
                  <span className="text-lg font-bold text-red-400">
                    {playerDeaths}
                  </span>
                </div>
              </div>
            </div>

            <div className="absolute top-4 right-4">
              <Button onClick={stopGame} variant="destructive">
                Exit Game
              </Button>
            </div>

            <div className="absolute bottom-4 left-4 px-4 py-2 bg-black/50 rounded text-white">
              Playing as: {playerName}
            </div>
          </>
        )}
      </div>

      {/* Show menu when not playing */}
      {!isPlaying && (
        <div className="flex flex-col items-center justify-center space-y-4 p-6 bg-slate-900 rounded-lg">
          <h1 className="text-3xl font-bold mb-6 text-white">
            Awesome Shooter
          </h1>

          {/* <div className="mb-4 flex items-center">
            <p className="text-white mr-4">Playing as:</p>
            <div className="flex items-center space-x-2">
              <Button onClick={changePlayerName} variant="outline">
                {playerName}
              </Button>
            </div>
          </div>

          <div className="flex items-center space-x-4 mb-6">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="debugMode"
                checked={isDebugMode}
                onChange={(e) => setIsDebugMode(e.target.checked)}
                className="rounded text-primary-500 focus:ring-primary-500"
              />
              <label htmlFor="debugMode" className="text-white">
                Debug Mode
              </label>
            </div>
          </div> */}

          {error && (
            <div className="p-3 mb-4 text-red-500 bg-red-100 rounded-md border border-red-300 w-full">
              {error}
            </div>
          )}

          {debug.length > 0 && (
            <div className="p-3 mb-4 text-xs text-gray-300 bg-gray-800 rounded-md border border-gray-700 font-mono w-full max-h-32 overflow-y-auto">
              {debug.map((msg, i) => (
                <div key={i}>{msg}</div>
              ))}
            </div>
          )}

          <Button
            onClick={startGame}
            size="lg"
            className="px-8 py-6 text-lg bg-rose-600 hover:bg-rose-700"
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Start Game"}
          </Button>
        </div>
      )}
    </div>
  );
}
