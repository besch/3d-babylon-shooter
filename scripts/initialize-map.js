// This script can be used during deployment to initialize map objects
// Example usage: node scripts/initialize-map.js https://your-deployed-site.vercel.app

const fetch = require("node-fetch");

async function initializeMap() {
  // Skip initialization during Vercel build process
  if (
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.SKIP_MAP_INIT === "true"
  ) {
    console.log("Skipping map initialization during Vercel build process");
    console.log("Map objects will be initialized on first API request");
    return;
  }

  let baseUrl = process.argv[2];

  // During Vercel deployment, try to use the NEXT_PUBLIC_SITE_URL environment variable
  if (!baseUrl && process.env.NEXT_PUBLIC_SITE_URL) {
    baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  }

  // If we still don't have a base URL, default to localhost in development
  if (!baseUrl) {
    baseUrl = "http://localhost:3000";
  }

  // Ensure URL has a protocol
  if (!baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }

  const apiUrl = `${baseUrl}/api/map-objects/init`;

  console.log(`Initializing map objects at: ${apiUrl}`);

  try {
    const response = await fetch(apiUrl);
    const data = await response.json();

    console.log("Map initialization result:", data);

    if (data.success) {
      console.log("✅ Map objects initialized successfully");
    } else {
      console.error(
        "❌ Failed to initialize map objects:",
        data.error || "Unknown error"
      );
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error initializing map objects:", error.message);
    process.exit(1);
  }
}

initializeMap();
