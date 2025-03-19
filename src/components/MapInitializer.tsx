"use client";

import { useEffect } from "react";

export function MapInitializer() {
  useEffect(() => {
    // Initialize map objects on component mount
    async function initializeMapObjects() {
      try {
        console.log("Initializing map objects...");

        const response = await fetch("/api/map-objects/init");
        const data = await response.json();

        console.log("Map initialization result:", data);
      } catch (error) {
        console.error("Failed to initialize map objects:", error);
      }
    }

    initializeMapObjects();
  }, []);

  // This component doesn't render anything visible
  return null;
}
