"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { GameSettings, Player, TechCompany } from "@/game/types";
// Import the GameEngine type but import the actual engine dynamically
import type { GameEngine } from "@/game/engine";

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

  const startGame = async () => {
    if (!canvasRef.current) {
      setError("Canvas not available");
      return;
    }

    // Reset states
    setError(null);
    setIsLoading(true);
    setDebug([]);

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
      const localPlayer: Player = {
        id: uuidv4(),
        name: playerName,
        health: 100,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        kills: 0,
        deaths: 0,
      };

      engine.setLocalPlayer(localPlayer);

      // Create some dummy players for now
      addDebugMessage("Creating dummy players");
      const dummyPlayers = generateDummyPlayers(3, localPlayer.name);
      dummyPlayers.forEach((player) => {
        engine.updatePlayer(player);
      });

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
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
    setIsPlaying(false);
    setDebug([]);
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
          z: (Math.random() - 0.5) * 20 + 10, // Position players ahead of the local player
        },
        rotation: {
          x: 0,
          y: Math.random() * Math.PI * 2,
          z: 0,
        },
        kills: 0,
        deaths: 0,
      });
    }

    return players;
  };

  const changePlayerName = () => {
    const availableNames = TECH_COMPANIES.filter((name) => name !== playerName);
    const randomIndex = Math.floor(Math.random() * availableNames.length);
    setPlayerName(availableNames[randomIndex]);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
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
          <h1 className="text-3xl font-bold mb-6 text-white">Tech Wars: FPS</h1>

          <div className="mb-4 flex items-center">
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
          </div>

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
