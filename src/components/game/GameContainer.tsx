"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { GameEngine } from "@/game/engine";
import { GameSettings, Player, TechCompany } from "@/game/types";

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

  const startGame = () => {
    if (!canvasRef.current) return;

    // Create the game engine
    const engine = new GameEngine(canvasRef.current);
    engineRef.current = engine;

    // Create the cyberpunk map
    engine.createCyberpunkMap();

    // Try to enable physics (may require importing cannon.js separately)
    try {
      engine.enablePhysics();
    } catch (error) {
      console.error("Failed to enable physics:", error);
    }

    // Create a local player
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
    // These would be replaced with real networked players in a full implementation
    const dummyPlayers = generateDummyPlayers(3, localPlayer.name);
    dummyPlayers.forEach((player) => {
      engine.updatePlayer(player);
    });

    // Enable debug layer if debug mode is on
    if (isDebugMode) {
      engine.enableDebugLayer();
    }

    setIsPlaying(true);
  };

  const stopGame = () => {
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
    setIsPlaying(false);
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
      {!isPlaying ? (
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

          <Button
            onClick={startGame}
            size="lg"
            className="px-8 py-6 text-lg bg-rose-600 hover:bg-rose-700"
          >
            Start Game
          </Button>
        </div>
      ) : (
        <div className="relative w-full h-full">
          <canvas ref={canvasRef} className="w-full h-full bg-black" />

          <div className="absolute top-4 right-4">
            <Button onClick={stopGame} variant="destructive">
              Exit Game
            </Button>
          </div>

          <div className="absolute bottom-4 left-4 px-4 py-2 bg-black/50 rounded text-white">
            Playing as: {playerName}
          </div>
        </div>
      )}
    </div>
  );
}
