// This script can be used during deployment to initialize map objects
// Example usage: node scripts/initialize-map.js https://your-deployed-site.vercel.app

const fetch = require("node-fetch");

async function initializeMap() {
  const baseUrl = process.argv[2] || "http://localhost:3000";
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
