"use client";

import { useEffect, useState } from "react";

export function MapInitializer() {
  const [initStatus, setInitStatus] = useState<string>("pending");

  useEffect(() => {
    // Initialize map objects on component mount
    async function initializeMapObjects() {
      try {
        console.log("Initializing map objects...");
        setInitStatus("loading");

        const response = await fetch("/api/map-objects/init");
        const data = await response.json();

        console.log("Map initialization result:", data);
        setInitStatus(data.success ? "success" : "error");
      } catch (error) {
        console.error("Failed to initialize map objects:", error);
        setInitStatus("error");
      }
    }

    initializeMapObjects();
  }, []);

  // This component doesn't render anything visible
  return null;
}
