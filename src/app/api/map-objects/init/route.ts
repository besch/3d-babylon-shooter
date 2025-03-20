import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";

export const runtime = "edge";

// Create default map objects when none exist on the server
function createDefaultMapObjects() {
  const objects = [];

  // Create platform objects
  const platformPositions = [
    { x: 10, y: 2, z: 10 },
    { x: -15, y: 4, z: 15 },
    { x: 20, y: 6, z: -10 },
    { x: -25, y: 8, z: -20 },
    { x: 30, y: 10, z: 25 },
    { x: 15, y: 5, z: 30 },
    { x: -30, y: 7, z: -15 },
    { x: 0, y: 12, z: 40 },
    { x: 0, y: 8, z: -40 },
    { x: -40, y: 6, z: 0 },
    { x: 40, y: 4, z: 0 },
  ];

  // Platform colors
  const platformColors = [
    "#ff3366", // Pink
    "#33ccff", // Cyan
    "#cc33ff", // Purple
    "#ffcc33", // Yellow
    "#33ff99", // Green
  ];

  // Create platforms
  platformPositions.forEach((pos, index) => {
    objects.push({
      id: uuidv4(),
      type: "platform",
      position_x: pos.x,
      position_y: pos.y,
      position_z: pos.z,
      rotation_x: 0,
      rotation_y: 0,
      rotation_z: 0,
      scaling_x: 1,
      scaling_y: 1,
      scaling_z: 1,
      color: platformColors[index % platformColors.length],
      last_updated: new Date().toISOString(),
    });
  });

  // Create building objects
  for (let i = 0; i < 20; i++) {
    const height = 5 + Math.random() * 15;
    const width = 3 + Math.random() * 7;
    const depth = 3 + Math.random() * 7;

    const posX = (Math.random() - 0.5) * 160;
    const posZ = (Math.random() - 0.5) * 160;

    // Don't create buildings too close to the spawn area
    if (Math.abs(posX) < 20 && Math.abs(posZ) < 20) continue;

    // Building colors
    const buildingColors = [
      "#336699", // Blue
      "#993366", // Purple
      "#669933", // Green
      "#996633", // Orange
    ];

    objects.push({
      id: uuidv4(),
      type: "building",
      position_x: posX,
      position_y: height / 2,
      position_z: posZ,
      rotation_x: 0,
      rotation_y: Math.random() * Math.PI * 2,
      rotation_z: 0,
      scaling_x: width / 4,
      scaling_y: height / 10,
      scaling_z: depth / 4,
      color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
      last_updated: new Date().toISOString(),
    });
  }

  // Create light objects
  const colors = [
    "#ff3366", // Pink
    "#33ccff", // Cyan
    "#cc33ff", // Purple
    "#ffcc33", // Yellow
    "#33ff99", // Green
  ];

  for (let i = 0; i < 50; i++) {
    const posX = (Math.random() - 0.5) * 160;
    const posY = 0.5 + Math.random() * 20;
    const posZ = (Math.random() - 0.5) * 160;

    objects.push({
      id: uuidv4(),
      type: "light",
      position_x: posX,
      position_y: posY,
      position_z: posZ,
      rotation_x: 0,
      rotation_y: 0,
      rotation_z: 0,
      scaling_x: 1,
      scaling_y: 1,
      scaling_z: 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      last_updated: new Date().toISOString(),
    });
  }

  return objects;
}

export async function GET() {
  try {
    console.log("API: Starting map objects initialization");

    // Create a Supabase client directly
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    console.log("API: Supabase client created");

    // Check if map objects already exist
    const { data: existingObjects, error: fetchError } = await supabase
      .from("map_objects")
      .select("id")
      .limit(1);

    if (fetchError) {
      console.error(
        "API: Error checking for existing map objects:",
        fetchError
      );
      return NextResponse.json(
        { error: "Failed to check existing objects" },
        { status: 500 }
      );
    }

    // If no objects exist, create them
    if (!existingObjects || existingObjects.length === 0) {
      console.log("No map objects found, creating defaults");
      const defaultObjects = createDefaultMapObjects();

      // Insert objects in batches to avoid payload size limits
      const batchSize = 25;
      for (let i = 0; i < defaultObjects.length; i += batchSize) {
        const batch = defaultObjects.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from("map_objects")
          .insert(batch);

        if (insertError) {
          console.error("Error inserting map objects:", insertError);
          return NextResponse.json(
            { error: "Failed to insert objects" },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({
        success: true,
        message: `Created ${defaultObjects.length} map objects`,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Map objects already exist, no action needed",
    });
  } catch (error) {
    console.error("Unexpected error initializing map objects:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
