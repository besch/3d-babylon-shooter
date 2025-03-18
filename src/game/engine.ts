// Use conditional imports to avoid document issues during SSR
import { Player, GameSettings, MapObject } from "./types";
import {
  updatePlayerHealth,
  incrementPlayerKills,
  incrementPlayerDeaths,
  sendPlayerUpdate,
  sendProjectile,
} from "@/lib/supabase/client";

// Define types to avoid missing BABYLON reference
let BABYLON: any = null;
let GUI: any = null;
let cannonModule: any = null;

// Add a debounce implementation to prevent too many API calls
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: any;
  return function (this: any, ...args: Parameters<T>) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Debounced update functions
const debouncedUpdateHealth = debounce((playerId: string, health: number) => {
  updatePlayerHealth(playerId, health).catch((err) =>
    console.error("Failed to update player health:", err)
  );
}, 300);

const debouncedIncrementKills = debounce((playerId: string) => {
  incrementPlayerKills(playerId).catch((err) =>
    console.error("Failed to increment kills:", err)
  );
}, 300);

const debouncedSendProjectile = debounce((projectileData: any) => {
  sendProjectile(projectileData).catch((err) =>
    console.error("Failed to send projectile:", err)
  );
}, 100);

// Add debounced function for sending player updates with better throttling
const debouncedSendPlayerUpdate = (() => {
  let timeout: any;
  let lastUpdateTime = 0;
  const minTimeBetweenUpdates = 300; // ms

  return (player: Player) => {
    const now = Date.now();

    // Clear existing timeout
    clearTimeout(timeout);

    // If it's been too soon since last update, wait longer
    const timeToWait =
      now - lastUpdateTime < minTimeBetweenUpdates ? minTimeBetweenUpdates : 50; // Quick update for first in sequence

    timeout = setTimeout(() => {
      // Only send essential fields to reduce payload size
      const minimalPlayer = {
        ...player,
        lastUpdated: Date.now(), // Always use current time
      };

      sendPlayerUpdate(minimalPlayer).catch((err) =>
        console.error("Failed to update player stats:", err)
      );

      lastUpdateTime = Date.now();
    }, timeToWait);
  };
})();

// Only initialize on client side
async function loadBabylonModules() {
  if (typeof window !== "undefined" && !BABYLON) {
    try {
      // Use dynamic import instead of require
      const core = await import("@babylonjs/core");
      console.log("Babylon.js core loaded successfully");
      BABYLON = core;

      // Load GUI module separately
      try {
        const gui = await import("@babylonjs/gui");
        console.log("Babylon.js GUI loaded successfully");
        GUI = gui;
      } catch (guiError) {
        console.error("Failed to load GUI module:", guiError);
      }

      // Load cannon physics module separately
      try {
        const cannon = await import("cannon");
        console.log("Cannon.js physics loaded successfully");
        cannonModule = cannon;

        // Make cannon globally available for Babylon's CannonJSPlugin
        (window as any).CANNON = cannon;
      } catch (cannonError) {
        console.error("Failed to load Cannon physics module:", cannonError);
      }

      return true;
    } catch (error) {
      console.error("Failed to load Babylon.js modules:", error);
      return false;
    }
  }
  return !!BABYLON;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  maxHealth: 100,
  shootsToKill: 3,
  respawnTime: 3000, // 3 seconds
  recoilForce: 0.5,
  projectileSpeed: 100,
  jumpForce: 5,
  gravity: 9.81,
};

export class GameEngine {
  private canvas!: HTMLCanvasElement;
  private engine: any;
  private scene: any;
  private camera: any;
  private light: any;
  private settings!: GameSettings;
  private localPlayer: Player | null = null;
  private players: Map<string, any> = new Map();
  private weapons: Map<string, any> = new Map();
  private ground: any;
  private recoilAnimation: any;
  private isRecoiling: boolean = false;
  private initialized: boolean = false;
  private walls: any[] = [];
  private crosshair: any;
  private mapObjects: Map<string, any> = new Map();

  constructor(
    canvas: HTMLCanvasElement,
    settings: GameSettings = DEFAULT_GAME_SETTINGS
  ) {
    console.log("GameEngine constructor called");
    this.canvas = canvas;
    this.settings = settings;
  }

  async initialize(): Promise<boolean> {
    // Exit early if not in browser
    if (typeof window === "undefined") {
      console.warn(
        "Cannot initialize GameEngine outside of browser environment"
      );
      return false;
    }

    console.log("Initializing game engine...");

    // Load Babylon modules if not loaded
    const modulesLoaded = await loadBabylonModules();

    if (!modulesLoaded || !BABYLON) {
      console.error("Failed to load Babylon.js modules");
      return false;
    }

    try {
      console.log("Creating Babylon.js engine and scene");
      this.engine = new BABYLON.Engine(this.canvas, true);
      this.scene = new BABYLON.Scene(this.engine);

      // Camera setup
      console.log("Setting up camera");
      this.camera = new BABYLON.FreeCamera(
        "playerCamera",
        new BABYLON.Vector3(0, 1.8, 0),
        this.scene
      );
      this.camera.setTarget(new BABYLON.Vector3(0, 1.8, 1));
      this.camera.attachControl(this.canvas, false); // Set false to enable rotation without clicking
      this.camera.applyGravity = false; // We'll handle gravity manually to fix jumping issues
      this.camera.checkCollisions = true;
      this.camera.ellipsoid = new BABYLON.Vector3(0.5, 0.9, 0.5);
      this.camera.minZ = 0.1;
      this.camera.inertia = 0.3; // Lower inertia for smoother movement
      this.camera.angularSensibility = 500; // Adjust sensitivity for camera rotation
      this.camera.speed = 0.75; // Adjust movement speed

      // Add a gravity force to keep player on the ground
      const gravity = new BABYLON.Vector3(0, -this.settings.gravity, 0);

      // Add a custom before render function to apply gravity
      this.scene.registerBeforeRender(() => {
        try {
          if (this.localPlayer && !this.localPlayer.isJumping) {
            // Cast ray downward to check ground distance
            const ray = new BABYLON.Ray(
              this.camera.position,
              new BABYLON.Vector3(0, -1, 0),
              1.9 // Check distance to ground
            );

            const hit = this.scene.pickWithRay(ray);

            // If not on ground, apply gravity
            if (!hit.hit && this.camera.position.y > 1.8) {
              this.camera.position.y -= 0.1; // Move toward ground
              if (this.camera.position.y < 1.8) {
                this.camera.position.y = 1.8; // Don't go below ground level
              }
            } else if (hit.hit && hit.distance < 1.8) {
              // If too close to ground, push up
              this.camera.position.y = hit.pickedPoint.y + 1.8;
            }
          }
        } catch (error) {
          // Silent error handling to prevent crashes
        }
      });

      // Controls
      this.camera.keysUp.push(87); // W
      this.camera.keysDown.push(83); // S
      this.camera.keysLeft.push(65); // A
      this.camera.keysRight.push(68); // D

      // Add crosshair
      this.createCrosshair();

      // Light setup
      console.log("Setting up lighting");
      this.light = new BABYLON.HemisphericLight(
        "light",
        new BABYLON.Vector3(0, 1, 0),
        this.scene
      );
      this.light.intensity = 0.7;

      // Ground setup
      console.log("Creating ground");
      this.ground = BABYLON.MeshBuilder.CreateGround(
        "ground",
        { width: 100, height: 100 },
        this.scene
      );
      this.ground.checkCollisions = true;

      const groundMaterial = new BABYLON.StandardMaterial(
        "groundMaterial",
        this.scene
      );
      groundMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.3);
      groundMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
      this.ground.material = groundMaterial;

      // Create boundaries
      this.createBoundaries();

      // Recoil animation
      console.log("Setting up weapon animations");
      this.recoilAnimation = new BABYLON.Animation(
        "recoilAnimation",
        "rotation.x",
        30,
        BABYLON.Animation.ANIMATIONTYPE_FLOAT,
        BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE
      );

      // Create the key frames for the recoil animation
      const keyFrames = [];
      keyFrames.push({ frame: 0, value: 0 });
      keyFrames.push({ frame: 5, value: this.settings.recoilForce });
      keyFrames.push({ frame: 15, value: 0 });
      this.recoilAnimation.setKeys(keyFrames);

      // Register render loop
      console.log("Starting render loop");
      this.engine.runRenderLoop(() => {
        this.scene.render();
      });

      // Resize event handler
      window.addEventListener("resize", () => {
        this.engine.resize();
      });

      // Input handling
      this.setupInputHandling();

      console.log("Game engine initialization complete");
      this.initialized = true;
      return true;
    } catch (error) {
      console.error("Error during game engine initialization:", error);
      return false;
    }
  }

  private createCrosshair(): void {
    if (!BABYLON || !this.scene || !GUI) {
      console.warn("Cannot create crosshair - GUI module not available");
      return;
    }

    try {
      // Create a simple crosshair using DOM instead of Babylon GUI
      const crosshairHTML = document.createElement("div");
      crosshairHTML.id = "crosshair";
      crosshairHTML.style.position = "absolute";
      crosshairHTML.style.top = "50%";
      crosshairHTML.style.left = "50%";
      crosshairHTML.style.width = "20px";
      crosshairHTML.style.height = "20px";
      crosshairHTML.style.transform = "translate(-50%, -50%)";
      crosshairHTML.style.pointerEvents = "none";
      crosshairHTML.innerHTML = `
        <style>
          #crosshair::before, #crosshair::after {
            content: "";
            position: absolute;
            background-color: white;
          }
          #crosshair::before {
            top: 50%;
            left: 0;
            right: 0;
            height: 2px;
            transform: translateY(-50%);
          }
          #crosshair::after {
            left: 50%;
            top: 0;
            bottom: 0;
            width: 2px;
            transform: translateX(-50%);
          }
        </style>
      `;

      document.body.appendChild(crosshairHTML);

      this.crosshair = crosshairHTML;
    } catch (error) {
      console.error("Failed to create crosshair:", error);
    }
  }

  private createBoundaries(): void {
    if (!BABYLON || !this.scene) return;

    const wallHeight = 10;
    const mapSize = 200; // Match the larger ground size
    const wallThickness = 2;

    // Create materials with lighter colors
    const wallMaterial = new BABYLON.StandardMaterial(
      "wallMaterial",
      this.scene
    );
    wallMaterial.diffuseColor = new BABYLON.Color3(0.6, 0.6, 0.8); // Light lavender
    wallMaterial.emissiveColor = new BABYLON.Color3(0.2, 0.2, 0.3); // Subtle glow

    // Create a wall texture programmatically
    const wallTexture = new BABYLON.DynamicTexture(
      "wallTexture",
      { width: 512, height: 512 },
      this.scene
    );
    const ctx = wallTexture.getContext();

    // Fill with a light color
    ctx.fillStyle = "rgb(180, 180, 220)"; // Light purple background
    ctx.fillRect(0, 0, 512, 512);

    // Add some pattern to the walls
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgb(140, 140, 200)";

    // Grid pattern
    const cellSize = 64;
    for (let x = 0; x <= 512; x += cellSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }

    for (let y = 0; y <= 512; y += cellSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    // Add some random squares for variety
    ctx.fillStyle = "rgba(160, 160, 230, 0.5)";
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(Math.random() * 448);
      const y = Math.floor(Math.random() * 448);
      const size = 16 + Math.floor(Math.random() * 48);
      ctx.fillRect(x, y, size, size);
    }

    wallTexture.update();
    wallMaterial.diffuseTexture = wallTexture;

    // Set texture scaling for the walls
    if (wallMaterial.diffuseTexture) {
      wallMaterial.diffuseTexture.uScale = 10;
      wallMaterial.diffuseTexture.vScale = 2;
    }

    // Create four walls
    // North wall
    const northWall = BABYLON.MeshBuilder.CreateBox(
      "northWall",
      {
        width: mapSize + wallThickness * 2,
        height: wallHeight,
        depth: wallThickness,
      },
      this.scene
    );
    northWall.position = new BABYLON.Vector3(
      0,
      wallHeight / 2,
      mapSize / 2 + wallThickness / 2
    );
    northWall.material = wallMaterial;
    northWall.checkCollisions = true;
    this.walls.push(northWall);

    // South wall
    const southWall = BABYLON.MeshBuilder.CreateBox(
      "southWall",
      {
        width: mapSize + wallThickness * 2,
        height: wallHeight,
        depth: wallThickness,
      },
      this.scene
    );
    southWall.position = new BABYLON.Vector3(
      0,
      wallHeight / 2,
      -mapSize / 2 - wallThickness / 2
    );
    southWall.material = wallMaterial;
    southWall.checkCollisions = true;
    this.walls.push(southWall);

    // East wall
    const eastWall = BABYLON.MeshBuilder.CreateBox(
      "eastWall",
      { width: wallThickness, height: wallHeight, depth: mapSize },
      this.scene
    );
    eastWall.position = new BABYLON.Vector3(
      mapSize / 2 + wallThickness / 2,
      wallHeight / 2,
      0
    );
    eastWall.material = wallMaterial;
    eastWall.checkCollisions = true;
    this.walls.push(eastWall);

    // West wall
    const westWall = BABYLON.MeshBuilder.CreateBox(
      "westWall",
      { width: wallThickness, height: wallHeight, depth: mapSize },
      this.scene
    );
    westWall.position = new BABYLON.Vector3(
      -mapSize / 2 - wallThickness / 2,
      wallHeight / 2,
      0
    );
    westWall.material = wallMaterial;
    westWall.checkCollisions = true;
    this.walls.push(westWall);
  }

  private setupInputHandling(): void {
    if (!this.scene) return;

    // Handle shooting with mouse down, not just clicks
    let isMouseDown = false;
    let shootingInterval: any = null;

    // Mouse down event for continuous shooting
    this.scene.onPointerDown = (evt: any) => {
      try {
        if (evt.button === 0) {
          // Left button
          isMouseDown = true;
          this.shoot(); // Shoot immediately when pressed

          // Set interval for continuous shooting
          if (!shootingInterval) {
            shootingInterval = setInterval(() => {
              if (isMouseDown) {
                this.shoot();
              }
            }, 200); // Shoot every 200ms
          }
        }
      } catch (error) {
        console.error("Error in onPointerDown:", error);
      }
    };

    // Mouse up event to stop shooting
    this.scene.onPointerUp = (evt: any) => {
      try {
        if (evt.button === 0) {
          // Left button
          isMouseDown = false;

          // Clear shooting interval
          if (shootingInterval) {
            clearInterval(shootingInterval);
            shootingInterval = null;
          }
        }
      } catch (error) {
        console.error("Error in onPointerUp:", error);
      }
    };

    // Handle jumping and crouching
    this.scene.onKeyboardObservable.add((kbInfo: any) => {
      try {
        if (!this.localPlayer) return;

        switch (kbInfo.type) {
          case BABYLON.KeyboardEventTypes.KEYDOWN:
            if (kbInfo.event.key === " " && !this.localPlayer.isJumping) {
              this.jump();
            } else if (kbInfo.event.key === "Shift") {
              this.crouch(true);
            }
            break;
          case BABYLON.KeyboardEventTypes.KEYUP:
            if (kbInfo.event.key === "Shift") {
              this.crouch(false);
            }
            break;
        }
      } catch (error) {
        console.error("Error in keyboard handling:", error);
      }
    });

    // Lock the pointer when clicking in the canvas with better error handling
    this.canvas.addEventListener("click", () => {
      try {
        if (!this.scene.isPointerLock) {
          this.canvas.requestPointerLock =
            this.canvas.requestPointerLock ||
            (this.canvas as any).mozRequestPointerLock ||
            (this.canvas as any).webkitRequestPointerLock;

          if (this.canvas.requestPointerLock) {
            this.canvas.requestPointerLock();
          }
        }
      } catch (error) {
        console.error("Error requesting pointer lock:", error);
      }
    });

    // Safer handling of pointer lock changes
    const pointerlockChangeHandler = () => {
      try {
        if (document.pointerLockElement !== this.canvas) {
          // Pointer lock was lost, clear shooting interval
          isMouseDown = false;
          if (shootingInterval) {
            clearInterval(shootingInterval);
            shootingInterval = null;
          }
        }
      } catch (error) {
        console.error("Error handling pointerlockchange:", error);
      }
    };

    document.addEventListener("pointerlockchange", pointerlockChangeHandler);
    document.addEventListener("mozpointerlockchange", pointerlockChangeHandler);
    document.addEventListener(
      "webkitpointerlockchange",
      pointerlockChangeHandler
    );
  }

  private shoot(): void {
    if (this.isRecoiling || !this.scene) return;

    // Play recoil animation
    this.isRecoiling = true;
    const weapon = this.getOrCreateWeapon();

    this.scene.beginAnimation(weapon, 0, 15, false, 1, () => {
      this.isRecoiling = false;
    });

    // Create projectile
    this.createProjectile();
  }

  private getOrCreateWeapon(): any {
    if (!this.localPlayer || !BABYLON || !this.scene) return {};

    let weapon = this.weapons.get(this.localPlayer.id);

    if (!weapon) {
      weapon = BABYLON.MeshBuilder.CreateBox(
        "weapon",
        { width: 0.1, height: 0.1, depth: 0.5 },
        this.scene
      );
      const weaponMaterial = new BABYLON.StandardMaterial(
        "weaponMaterial",
        this.scene
      );
      weaponMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
      weapon.material = weaponMaterial;
      weapon.parent = this.camera;
      weapon.position = new BABYLON.Vector3(0.3, -0.3, 0.5);
      weapon.animations.push(this.recoilAnimation);
      this.weapons.set(this.localPlayer.id, weapon);
    }

    return weapon;
  }

  private createProjectile(): void {
    if (!this.localPlayer || !BABYLON || !this.scene || !this.camera) return;

    try {
      // Generate a proper UUID for the projectile
      const { v4: uuidv4 } = require("uuid");
      const projectileId = uuidv4();

      // Create a smaller projectile
      const projectile = BABYLON.MeshBuilder.CreateSphere(
        projectileId,
        { diameter: 0.15 }, // Smaller diameter for better visibility
        this.scene
      );

      // Create a glow layer for projectiles if it doesn't exist yet
      let glowLayer = this.scene.getGlowLayerByName("projectileGlow");
      if (!glowLayer) {
        glowLayer = new BABYLON.GlowLayer("projectileGlow", this.scene);
        glowLayer.intensity = 0.8;
      }

      const projectileMaterial = new BABYLON.StandardMaterial(
        `projectileMaterial-${projectileId}`,
        this.scene
      );
      projectileMaterial.diffuseColor = new BABYLON.Color3(1, 0.3, 0.3);
      projectileMaterial.emissiveColor = new BABYLON.Color3(1, 0.3, 0.3); // Bright red glow
      projectileMaterial.specularColor = new BABYLON.Color3(1, 1, 1);
      projectile.material = projectileMaterial;

      // Add the projectile to the glow layer
      glowLayer.addIncludedOnlyMesh(projectile);

      // Get the exact direction where the camera is looking
      const direction = this.getForwardDirection();

      // Position the projectile directly in front of the camera (centered with the crosshair)
      projectile.position = new BABYLON.Vector3(
        this.camera.position.x,
        this.camera.position.y,
        this.camera.position.z
      ).add(direction.scale(1)); // Start 1 unit in front of camera

      // Add a trail effect to make projectile more visible
      const trail = new BABYLON.TrailMesh(
        "trail" + projectileId,
        projectile,
        this.scene,
        0.05, // Smaller trail width
        15, // Shorter trail
        true
      );
      const trailMaterial = new BABYLON.StandardMaterial(
        "trailMaterial" + projectileId,
        this.scene
      );
      trailMaterial.emissiveColor = new BABYLON.Color3(1, 0.3, 0.3);
      trailMaterial.diffuseColor = new BABYLON.Color3(1, 0.05, 0.05);
      trailMaterial.alpha = 0.7;
      trail.material = trailMaterial;

      // Simple projectile motion
      const speed = this.settings.projectileSpeed;
      const velocity = direction.scale(speed);

      // Calculate integer damage value
      const damageValue = Math.floor(
        this.settings.maxHealth / this.settings.shootsToKill
      );

      // Store the shooter ID for hit detection
      projectile.metadata = {
        shooterId: this.localPlayer.id,
        damage: damageValue,
        velocity: velocity,
      };

      // Always use simple motion as the more reliable approach
      const useSimpleMotion = true;

      // Update function for projectile movement and tracking
      const updateFunction = () => {
        try {
          if (useSimpleMotion && !projectile.isDisposed()) {
            // Simple manual motion
            if (projectile.metadata?.velocity) {
              projectile.position.addInPlace(
                projectile.metadata.velocity.scale(0.016) // Scale by time delta
              );
            }

            // Simple collision detection with other players
            this.players.forEach((playerMesh, id) => {
              if (id !== this.localPlayer?.id && !projectile.isDisposed()) {
                const distance = BABYLON.Vector3.Distance(
                  projectile.position,
                  playerMesh.position.add(new BABYLON.Vector3(0, 1, 0))
                );

                if (distance < 1.0) {
                  // Hit detected
                  this.damagePlayer(id, projectile.metadata.damage);

                  // Dispose of the projectile
                  this.scene.unregisterBeforeRender(updateFunction);
                  if (!projectile.isDisposed()) projectile.dispose();
                  if (trail && !trail.isDisposed()) trail.dispose();
                }
              }
            });
          }

          // Check if projectile is too far away and dispose if needed
          if (
            !projectile.isDisposed() &&
            projectile.position.subtract(this.camera.position).length() > 100
          ) {
            this.scene.unregisterBeforeRender(updateFunction);
            if (trail && !trail.isDisposed()) trail.dispose();
            if (!projectile.isDisposed()) projectile.dispose();
          }
        } catch (error) {
          console.error("Error in projectile update:", error);
          // Clean up on error
          this.scene.unregisterBeforeRender(updateFunction);
          if (!projectile.isDisposed()) projectile.dispose();
          if (trail && !trail.isDisposed()) trail.dispose();
        }
      };

      // Register the update function
      this.scene.registerBeforeRender(updateFunction);

      // Destroy projectile after 3 seconds as a backup
      setTimeout(() => {
        try {
          this.scene.unregisterBeforeRender(updateFunction);
          if (trail && !trail.isDisposed()) trail.dispose();
          if (projectile && !projectile.isDisposed()) projectile.dispose();
        } catch (error) {
          console.error("Error disposing projectile:", error);
        }
      }, 3000);

      // Send projectile to other players via network
      this.sendProjectileUpdate(projectileId, direction);
    } catch (error) {
      console.error("Critical error creating projectile:", error);
    }
  }

  private async sendProjectileUpdate(
    projectileId: string,
    direction: any
  ): Promise<void> {
    if (!this.localPlayer || !this.camera) return;

    try {
      // Format the data according to the expected schema
      const projectileData = {
        id: projectileId,
        player_id: this.localPlayer.id,
        position_x: this.camera.position.x,
        position_y: this.camera.position.y,
        position_z: this.camera.position.z,
        direction_x: direction.x,
        direction_y: direction.y,
        direction_z: direction.z,
        created_at: new Date().toISOString(),
      };

      // Use the debounced function to send projectile data
      debouncedSendProjectile(projectileData);
    } catch (err) {
      console.error("Failed to send projectile data:", err);
    }
  }

  /**
   * Apply damage to a player
   */
  private damagePlayer(playerId: string, damage: number): void {
    // Validate player ID
    if (!playerId || playerId === this.localPlayer?.id) {
      return; // Don't damage self or invalid players
    }

    // Find the player in other players list
    const playerToUpdate = this.players.get(playerId);
    if (!playerToUpdate || !playerToUpdate.metadata) {
      console.warn(`Player ${playerId} not found or has no metadata`);
      return;
    }

    try {
      // Ensure we have an integer for current health
      const currentHealth = Math.floor(
        playerToUpdate.metadata.health || this.settings.maxHealth
      );

      // Calculate new health as integer
      const newHealth = Math.max(0, currentHealth - Math.floor(damage));
      console.log(
        `Player ${playerId} hit: Health ${currentHealth} -> ${newHealth} (damage: ${Math.floor(
          damage
        )})`
      );

      // Update the player's health locally
      playerToUpdate.metadata.health = newHealth;

      // If player has no health left, it's a kill
      if (newHealth <= 0) {
        // Increment local player kills
        if (this.localPlayer) {
          this.localPlayer.kills += 1;
          console.log(
            `Kill registered: ${this.localPlayer.id} killed ${playerId}`
          );
        }

        // Show kill effect
        this.showKillEffect(playerToUpdate.position);

        // Respawn player after a delay
        setTimeout(() => {
          if (playerToUpdate && !playerToUpdate.isDisposed()) {
            // Reset health to max (integer value)
            playerToUpdate.metadata.health = Math.floor(
              this.settings.maxHealth
            );

            // Move the player to a random position
            const respawnPos = this.getRandomSpawnPosition();
            playerToUpdate.position = new BABYLON.Vector3(
              respawnPos.x,
              respawnPos.y + 1,
              respawnPos.z
            );
          }
        }, this.settings.respawnTime);
      }

      // Notify the server about the damage
      this.emitPlayerDamage(playerId, newHealth).catch((err) =>
        console.error("Failed to emit player damage:", err)
      );
    } catch (error) {
      console.error("Error in damagePlayer:", error);
    }
  }

  /**
   * Show an effect when a player is killed
   */
  private showKillEffect(position: any): void {
    if (!BABYLON || !this.scene) return;

    // Create explosion particle system
    const explosion = new BABYLON.ParticleSystem("explosion", 100, this.scene);
    explosion.particleTexture = new BABYLON.Texture(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      this.scene
    );
    explosion.emitter = position;
    explosion.minEmitBox = new BABYLON.Vector3(-0.5, -0.5, -0.5);
    explosion.maxEmitBox = new BABYLON.Vector3(0.5, 0.5, 0.5);
    explosion.color1 = new BABYLON.Color4(1, 0.5, 0, 1);
    explosion.color2 = new BABYLON.Color4(1, 0.2, 0, 1);
    explosion.colorDead = new BABYLON.Color4(0, 0, 0, 0);
    explosion.minSize = 0.3;
    explosion.maxSize = 0.8;
    explosion.minLifeTime = 0.3;
    explosion.maxLifeTime = 1.5;
    explosion.emitRate = 300;
    explosion.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
    explosion.gravity = new BABYLON.Vector3(0, -9.81, 0);
    explosion.direction1 = new BABYLON.Vector3(-1, 8, -1);
    explosion.direction2 = new BABYLON.Vector3(1, 8, 1);
    explosion.minAngularSpeed = 0;
    explosion.maxAngularSpeed = Math.PI;
    explosion.minEmitPower = 1;
    explosion.maxEmitPower = 3;
    explosion.updateSpeed = 0.01;

    // Start the particle system
    explosion.start();

    // Stop and dispose after 2 seconds
    setTimeout(() => {
      explosion.stop();
      setTimeout(() => {
        explosion.dispose();
      }, 2000);
    }, 300);
  }

  /**
   * Send player damage to the server
   */
  private async emitPlayerDamage(
    playerId: string,
    newHealth: number
  ): Promise<void> {
    try {
      // Check if the player ID is valid UUID
      if (!playerId || playerId.length !== 36) {
        console.error("Invalid player ID:", playerId);
        return;
      }

      // Use the debounced update function instead of direct call
      debouncedUpdateHealth(playerId, newHealth);

      // If the player died, update the kill count for the local player
      if (newHealth <= 0 && this.localPlayer) {
        debouncedIncrementKills(this.localPlayer.id);
      }
    } catch (err) {
      console.error("Failed to update player damage on server:", err);
    }
  }

  /**
   * Get a random spawn position for respawning players
   */
  private getRandomSpawnPosition(): any {
    const spawnRadius = 80; // Half the map size
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * spawnRadius;

    return {
      x: Math.cos(angle) * distance,
      y: 0, // On the ground
      z: Math.sin(angle) * distance,
    };
  }

  public setLocalPlayer(player: Player): void {
    this.localPlayer = player;
  }

  public updatePlayer(player: Player): void {
    if (!BABYLON || !this.scene) return;

    let playerMesh = this.players.get(player.id);

    if (!playerMesh) {
      // Player is new - create mesh and log join message
      console.log(`New player joined: ${player.id} (${player.name})`);

      // Create an android-like player model
      // First create a parent mesh for the entire player
      playerMesh = new BABYLON.TransformNode(`player-${player.id}`, this.scene);

      // Create the body (cylinder for torso)
      const body = BABYLON.MeshBuilder.CreateCylinder(
        `player-body-${player.id}`,
        { height: 1.2, diameter: 0.7, tessellation: 16 },
        this.scene
      );
      body.parent = playerMesh;
      body.position.y = 0.9; // Position relative to parent

      // Create head (sphere)
      const head = BABYLON.MeshBuilder.CreateSphere(
        `player-head-${player.id}`,
        { diameter: 0.5, segments: 16 },
        this.scene
      );
      head.parent = playerMesh;
      head.position.y = 1.8; // Position on top of body

      // Create limbs
      // Left arm
      const leftArm = BABYLON.MeshBuilder.CreateCylinder(
        `player-leftArm-${player.id}`,
        { height: 0.8, diameter: 0.2, tessellation: 8 },
        this.scene
      );
      leftArm.parent = playerMesh;
      leftArm.position = new BABYLON.Vector3(-0.45, 1.2, 0);
      leftArm.rotation.z = Math.PI / 4; // Angle arm outward

      // Right arm
      const rightArm = BABYLON.MeshBuilder.CreateCylinder(
        `player-rightArm-${player.id}`,
        { height: 0.8, diameter: 0.2, tessellation: 8 },
        this.scene
      );
      rightArm.parent = playerMesh;
      rightArm.position = new BABYLON.Vector3(0.45, 1.2, 0);
      rightArm.rotation.z = -Math.PI / 4; // Angle arm outward

      // Left leg
      const leftLeg = BABYLON.MeshBuilder.CreateCylinder(
        `player-leftLeg-${player.id}`,
        { height: 1.0, diameter: 0.25, tessellation: 8 },
        this.scene
      );
      leftLeg.parent = playerMesh;
      leftLeg.position = new BABYLON.Vector3(-0.25, 0.4, 0);

      // Right leg
      const rightLeg = BABYLON.MeshBuilder.CreateCylinder(
        `player-rightLeg-${player.id}`,
        { height: 1.0, diameter: 0.25, tessellation: 8 },
        this.scene
      );
      rightLeg.parent = playerMesh;
      rightLeg.position = new BABYLON.Vector3(0.25, 0.4, 0);

      // Face details (eyes for the android)
      const leftEye = BABYLON.MeshBuilder.CreateSphere(
        `player-leftEye-${player.id}`,
        { diameter: 0.08, segments: 8 },
        this.scene
      );
      leftEye.parent = head;
      leftEye.position = new BABYLON.Vector3(-0.1, 0.05, 0.21);

      const rightEye = BABYLON.MeshBuilder.CreateSphere(
        `player-rightEye-${player.id}`,
        { diameter: 0.08, segments: 8 },
        this.scene
      );
      rightEye.parent = head;
      rightEye.position = new BABYLON.Vector3(0.1, 0.05, 0.21);

      // Create materials
      const playerColor = this.getPlayerColor(player.name);

      // Main body material
      const bodyMaterial = new BABYLON.StandardMaterial(
        `playerMaterial-${player.id}`,
        this.scene
      );
      bodyMaterial.diffuseColor = playerColor;
      bodyMaterial.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
      bodyMaterial.emissiveColor = playerColor.scale(0.2); // Subtle glow
      body.material = bodyMaterial;
      head.material = bodyMaterial;
      leftArm.material = bodyMaterial;
      rightArm.material = bodyMaterial;
      leftLeg.material = bodyMaterial;
      rightLeg.material = bodyMaterial;

      // Eye material (glowing)
      const eyeMaterial = new BABYLON.StandardMaterial(
        `eyeMaterial-${player.id}`,
        this.scene
      );
      eyeMaterial.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.8);
      eyeMaterial.emissiveColor = new BABYLON.Color3(0.8, 0.8, 1.0); // Bright glow
      eyeMaterial.specularColor = new BABYLON.Color3(1, 1, 1);
      leftEye.material = eyeMaterial;
      rightEye.material = eyeMaterial;

      // Create a physics impostor for the player to enable bullet collisions
      const playerImpostor = BABYLON.MeshBuilder.CreateBox(
        `playerCollider-${player.id}`,
        { width: 0.7, height: 2, depth: 0.7 },
        this.scene
      );
      playerImpostor.parent = playerMesh;
      playerImpostor.position.y = 1; // Center of the player model
      playerImpostor.visibility = 0; // Make it invisible

      // Add physics to the player for collision
      playerImpostor.physicsImpostor = new BABYLON.PhysicsImpostor(
        playerImpostor,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 0, restitution: 0.2 },
        this.scene
      );

      // Store player metadata
      playerImpostor.metadata = {
        playerId: player.id,
        playerName: player.name,
        health: this.settings.maxHealth,
        isHitBox: true,
      };

      // Store animation references
      playerMesh.metadata = {
        playerId: player.id,
        playerName: player.name,
        health: this.settings.maxHealth,
        leftArm,
        rightArm,
        leftLeg,
        rightLeg,
        head,
      };

      this.players.set(player.id, playerMesh);
    }

    // Update position and rotation - handle jumping properly
    playerMesh.position.x = player.position.x;

    // For jumping, check if isJumping is true AND y position is > 0
    if (player.isJumping && player.position.y > 0) {
      // Direct position update for jumping - subtract player height to account for character center
      playerMesh.position.y = Math.max(0, player.position.y - 1.8);
    } else {
      // When not jumping or landing, keep at ground level
      playerMesh.position.y = 0;
    }

    playerMesh.position.z = player.position.z;
    playerMesh.rotation.y = player.rotation.y;

    // Update crouching state - scale the model if crouching
    const scale = player.isCrouching ? 0.5 : 1;
    playerMesh.scaling.y = scale;

    // Store the states in metadata
    if (playerMesh.metadata) {
      playerMesh.metadata.isJumping = player.isJumping;
      playerMesh.metadata.isCrouching = player.isCrouching;
    }

    // Animate walking if the player is moving
    if (playerMesh.metadata && player.velocity) {
      const isMoving =
        Math.abs(player.velocity.x) > 0.1 || Math.abs(player.velocity.z) > 0.1;

      // Get all the limbs from metadata
      const leftLeg = playerMesh.metadata.leftLeg;
      const rightLeg = playerMesh.metadata.rightLeg;
      const leftArm = playerMesh.metadata.leftArm;
      const rightArm = playerMesh.metadata.rightArm;

      // Reset limb rotations first
      if (leftLeg) leftLeg.rotation.x = 0;
      if (rightLeg) rightLeg.rotation.x = 0;
      if (leftArm) leftArm.rotation.x = 0;
      if (rightArm) rightArm.rotation.x = 0;

      if (player.isJumping) {
        // If jumping, set a specific jump pose
        if (leftLeg && rightLeg) {
          leftLeg.rotation.x = -0.5; // Legs slightly bent
          rightLeg.rotation.x = -0.5;
        }

        if (leftArm && rightArm) {
          leftArm.rotation.x = -1.0; // Arms up
          rightArm.rotation.x = -1.0;
        }
      } else if (player.isCrouching) {
        // Crouching pose - bend knees more
        if (leftLeg && rightLeg) {
          leftLeg.rotation.x = 0.8;
          rightLeg.rotation.x = 0.8;
        }

        if (leftArm && rightArm) {
          leftArm.rotation.x = 0.3;
          rightArm.rotation.x = 0.3;
        }
      } else if (isMoving) {
        // Walking animation
        const time = Date.now() / 200;

        if (leftLeg && rightLeg) {
          leftLeg.rotation.x = Math.sin(time) * 0.5;
          rightLeg.rotation.x = Math.sin(time + Math.PI) * 0.5;
        }

        if (leftArm && rightArm) {
          leftArm.rotation.x = Math.sin(time + Math.PI) * 0.3;
          rightArm.rotation.x = Math.sin(time) * 0.3;
        }
      }
    }
  }

  private getPlayerColor(name: string): any {
    if (!BABYLON) return {};

    switch (name) {
      case "Google":
        return new BABYLON.Color3(0.3, 0.6, 1);
      case "Facebook":
        return new BABYLON.Color3(0.2, 0.4, 0.8);
      case "Twitter":
        return new BABYLON.Color3(0.4, 0.7, 1);
      case "Microsoft":
        return new BABYLON.Color3(0.7, 0.2, 0.7);
      case "Apple":
        return new BABYLON.Color3(0.8, 0.8, 0.8);
      case "Amazon":
        return new BABYLON.Color3(1, 0.6, 0.2);
      case "Netflix":
        return new BABYLON.Color3(0.8, 0.1, 0.1);
      case "Tesla":
        return new BABYLON.Color3(0.9, 0.1, 0.3);
      case "Uber":
        return new BABYLON.Color3(0.1, 0.1, 0.1);
      case "Airbnb":
        return new BABYLON.Color3(1, 0.3, 0.4);
      default:
        return new BABYLON.Color3(0.5, 0.5, 0.5);
    }
  }

  public removePlayer(playerId: string): void {
    const playerMesh = this.players.get(playerId);
    if (playerMesh) {
      playerMesh.dispose();
      this.players.delete(playerId);
    }

    const weapon = this.weapons.get(playerId);
    if (weapon) {
      weapon.dispose();
      this.weapons.delete(playerId);
    }
  }

  public enablePhysics(): void {
    if (!BABYLON || !this.scene) return;

    try {
      // First check if we have access to the necessary physics plugin
      if (BABYLON.CannonJSPlugin) {
        // Create a simple gravity-based physics engine
        this.scene.enablePhysics(
          new BABYLON.Vector3(0, -this.settings.gravity, 0),
          new BABYLON.CannonJSPlugin()
        );
        console.log("Physics enabled with CannonJSPlugin successfully");
      } else {
        throw new Error("CannonJSPlugin not available");
      }
    } catch (error) {
      // Fallback to a custom physics implementation if the plugin fails
      console.warn("Failed to enable physics plugin:", error);
      console.log("Using simplified physics instead");

      // Set a flag to use simplified physics
      (this.scene as any).isPhysicsEnabled = true;

      // Create a more complete mock physics engine to avoid method missing errors
      if (!(this.scene as any)._physicsEngine) {
        const dummyImpostors: any[] = [];

        (this.scene as any)._physicsEngine = {
          getImpostors: () => dummyImpostors,
          getPhysicsPlugin: () => ({
            world: {},
            executeStep: () => {},
          }),
          dispose: () => {},
          getSubTimeStep: () => 0.01,
          setSubTimeStep: () => {},
          setTimeStep: () => {},
          setGravity: (gravity: any) => {},
          _physicsPlugin: {
            world: {},
            executeStep: () => {},
            setGravity: () => {},
          },
          _impostors: dummyImpostors,
        };

        // Add the missing getPhysicsImpostors method directly to the scene
        (this.scene as any).getPhysicsImpostors = function () {
          return dummyImpostors;
        };
      }
    }
  }

  public createCyberpunkMap(): void {
    if (!this.scene) return;

    console.log("Creating cyberpunk map");

    // Create a better looking ground
    this.createGround();

    // Initialize map objects from server or create defaults
    this.initializeMapObjects();

    // Create neon lights but more of them and brighter
    this.createNeonLights();

    // Create a lighterr fog for cyberpunk atmosphere
    this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP;
    this.scene.fogDensity = 0.005; // Reduced fog density
    this.scene.fogColor = new BABYLON.Color3(0.2, 0.2, 0.3); // Lighter fog color

    // Add a stronger ambient light
    const ambientLight = new BABYLON.HemisphericLight(
      "ambientLight",
      new BABYLON.Vector3(0, 1, 0),
      this.scene
    );
    ambientLight.intensity = 0.8; // Stronger intensity
    ambientLight.diffuse = new BABYLON.Color3(0.5, 0.5, 0.6);
    ambientLight.specular = new BABYLON.Color3(0.7, 0.7, 0.8);
  }

  /**
   * Initialize map objects - either load from server or create defaults
   */
  private async initializeMapObjects() {
    try {
      // Import the sendMapObject and getMapObjects functions dynamically
      // to avoid circular dependencies
      const { getMapObjects, sendMapObject } = await import(
        "@/lib/supabase/client"
      );

      // Try to get existing map objects from the server
      const response = await getMapObjects();

      if (response.data && response.data.length > 0) {
        console.log(`Loaded ${response.data.length} map objects from server`);

        // Update map objects from server data
        response.data.forEach((item: any) => {
          const mapObject = {
            id: item.id,
            type: item.type as "platform" | "building" | "light",
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
          };

          this.updateMapObject(mapObject);
        });
      } else {
        console.log("No map objects found, creating defaults");

        // Create default map objects
        const defaultObjects = this.createDefaultMapObjects();

        // Save them to the server
        for (const obj of defaultObjects) {
          try {
            await sendMapObject(obj);
            this.updateMapObject(obj);
          } catch (err) {
            console.error("Failed to save map object:", err);
          }
        }
      }
    } catch (err) {
      console.error("Error initializing map objects:", err);

      // Fallback to creating buildings and platforms locally if server fails
      this.createBuildings();
      this.createPlatforms();
    }
  }

  /**
   * Create default map objects when none exist on the server
   */
  private createDefaultMapObjects() {
    const objects = [];
    const { v4: uuidv4 } = require("uuid");

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
        type: "platform" as "platform",
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotation: { x: 0, y: 0, z: 0 },
        scaling: { x: 1, y: 1, z: 1 },
        color: platformColors[index % platformColors.length],
        lastUpdated: Date.now(),
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
        type: "building" as "building",
        position: { x: posX, y: height / 2, z: posZ },
        rotation: { x: 0, y: Math.random() * Math.PI * 2, z: 0 },
        scaling: { x: width / 4, y: height / 10, z: depth / 4 },
        color:
          buildingColors[Math.floor(Math.random() * buildingColors.length)],
        lastUpdated: Date.now(),
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
        type: "light" as "light",
        position: { x: posX, y: posY, z: posZ },
        rotation: { x: 0, y: 0, z: 0 },
        scaling: { x: 1, y: 1, z: 1 },
        color: colors[Math.floor(Math.random() * colors.length)],
        lastUpdated: Date.now(),
      });
    }

    return objects;
  }

  private createGround(): void {
    if (!BABYLON || !this.scene) return;

    // Create a larger ground with a more interesting material
    this.ground = BABYLON.MeshBuilder.CreateGround(
      "ground",
      { width: 200, height: 200 },
      this.scene
    );
    this.ground.checkCollisions = true;

    // Raise the ground slightly to prevent z-fighting
    this.ground.position.y = 0.01;

    const groundMaterial = new BABYLON.StandardMaterial(
      "groundMaterial",
      this.scene
    );
    groundMaterial.diffuseColor = new BABYLON.Color3(0.6, 0.8, 0.9); // Much lighter blue
    groundMaterial.specularColor = new BABYLON.Color3(0.2, 0.2, 0.3);
    groundMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.2); // Slightly brighter emissive

    // Create a grid texture programmatically
    const gridTexture = new BABYLON.DynamicTexture(
      "gridTexture",
      { width: 1024, height: 1024 },
      this.scene
    );
    const ctx = gridTexture.getContext();

    // Fill with a light color
    ctx.fillStyle = "rgb(150, 200, 255)"; // Light blue background
    ctx.fillRect(0, 0, 1024, 1024);

    // Draw grid lines less frequently
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgb(100, 150, 255)"; // Darker blue lines

    // Draw fewer grid lines to reduce blinking
    ctx.beginPath();
    for (let i = 0; i <= 1024; i += 128) {
      // Vertical lines
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 1024);

      // Horizontal lines
      ctx.moveTo(0, i);
      ctx.lineTo(1024, i);
    }
    ctx.stroke();

    gridTexture.update();
    groundMaterial.diffuseTexture = gridTexture;

    // Set texture scaling for the ground
    if (groundMaterial.diffuseTexture) {
      groundMaterial.diffuseTexture.uScale = 20;
      groundMaterial.diffuseTexture.vScale = 20;
    }

    this.ground.material = groundMaterial;
  }

  private createBuildings(): void {
    if (!BABYLON || !this.scene) return;

    // Create multiple buildings with different heights and colors
    for (let i = 0; i < 20; i++) {
      const height = 5 + Math.random() * 15;
      const width = 3 + Math.random() * 7;
      const depth = 3 + Math.random() * 7;

      const posX = (Math.random() - 0.5) * 160;
      const posZ = (Math.random() - 0.5) * 160;

      // Don't create buildings too close to the spawn area
      if (Math.abs(posX) < 20 && Math.abs(posZ) < 20) continue;

      const building = BABYLON.MeshBuilder.CreateBox(
        `building-${i}`,
        { width, height, depth },
        this.scene
      );

      building.position.x = posX;
      building.position.y = height / 2;
      building.position.z = posZ;

      const buildingMaterial = new BABYLON.StandardMaterial(
        `buildingMaterial-${i}`,
        this.scene
      );

      // Brighter cyberpunk style buildings
      // Randomly select a color scheme
      const colorSchemes = [
        {
          diffuse: new BABYLON.Color3(0.2, 0.4, 0.6),
          emissive: new BABYLON.Color3(0.1, 0.2, 0.4),
        }, // Blue
        {
          diffuse: new BABYLON.Color3(0.6, 0.2, 0.5),
          emissive: new BABYLON.Color3(0.3, 0.1, 0.25),
        }, // Purple
        {
          diffuse: new BABYLON.Color3(0.5, 0.6, 0.2),
          emissive: new BABYLON.Color3(0.25, 0.3, 0.1),
        }, // Green
        {
          diffuse: new BABYLON.Color3(0.6, 0.4, 0.2),
          emissive: new BABYLON.Color3(0.3, 0.2, 0.1),
        }, // Orange
      ];

      const colorScheme =
        colorSchemes[Math.floor(Math.random() * colorSchemes.length)];
      buildingMaterial.diffuseColor = colorScheme.diffuse;
      buildingMaterial.emissiveColor = colorScheme.emissive;
      buildingMaterial.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);

      building.material = buildingMaterial;

      // Add collision detection to buildings
      building.checkCollisions = true;
    }
  }

  private createPlatforms(): void {
    if (!BABYLON || !this.scene) return;

    // Create various platforms for jumping across the map
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

    platformPositions.forEach((pos, index) => {
      const platform = BABYLON.MeshBuilder.CreateBox(
        `platform-${index}`,
        { width: 5, height: 0.5, depth: 5 },
        this.scene
      );

      platform.position = new BABYLON.Vector3(pos.x, pos.y, pos.z);
      platform.checkCollisions = true;

      const platformMaterial = new BABYLON.StandardMaterial(
        `platformMaterial-${index}`,
        this.scene
      );

      // Neon-colored platforms
      const platformColors = [
        new BABYLON.Color3(1, 0.2, 0.7), // Pink
        new BABYLON.Color3(0.2, 0.8, 1), // Cyan
        new BABYLON.Color3(0.8, 0.2, 1), // Purple
        new BABYLON.Color3(1, 0.8, 0.2), // Yellow
        new BABYLON.Color3(0.2, 1, 0.5), // Green
      ];

      const colorIndex = index % platformColors.length;
      platformMaterial.diffuseColor = platformColors[colorIndex];
      platformMaterial.emissiveColor = platformColors[colorIndex].scale(0.5);
      platformMaterial.specularColor = new BABYLON.Color3(1, 1, 1);
      platform.material = platformMaterial;
    });
  }

  private createNeonLights(): void {
    if (!BABYLON || !this.scene) return;

    // Create more neon light sources with higher intensity
    const colors = [
      new BABYLON.Color3(1, 0.2, 0.7), // Pink
      new BABYLON.Color3(0.2, 0.8, 1), // Cyan
      new BABYLON.Color3(0.8, 0.2, 1), // Purple
      new BABYLON.Color3(1, 0.8, 0.2), // Yellow
      new BABYLON.Color3(0.2, 1, 0.5), // Green
    ];

    // Create more lights
    for (let i = 0; i < 50; i++) {
      const posX = (Math.random() - 0.5) * 160;
      const posY = 0.5 + Math.random() * 20;
      const posZ = (Math.random() - 0.5) * 160;

      const colorIndex = Math.floor(Math.random() * colors.length);
      const color = colors[colorIndex];

      // Create a brighter neon light source
      const light = new BABYLON.PointLight(
        `neonLight-${i}`,
        new BABYLON.Vector3(posX, posY, posZ),
        this.scene
      );

      light.diffuse = color;
      light.specular = color;
      light.intensity = 0.7 + Math.random() * 0.7; // Higher intensity
      light.range = 15 + Math.random() * 15; // Larger range

      // Create a small emissive sphere for the light source
      const sphere = BABYLON.MeshBuilder.CreateSphere(
        `neonSphere-${i}`,
        { diameter: 0.8 }, // Slightly larger
        this.scene
      );

      sphere.position.x = posX;
      sphere.position.y = posY;
      sphere.position.z = posZ;

      const sphereMaterial = new BABYLON.StandardMaterial(
        `neonMaterial-${i}`,
        this.scene
      );
      sphereMaterial.diffuseColor = color;
      sphereMaterial.emissiveColor = color;
      sphereMaterial.specularColor = color;
      sphereMaterial.alpha = 0.8;
      sphere.material = sphereMaterial;
    }
  }

  public enableDebugLayer(): void {
    // We're not going to try to load the debug layer since it's causing issues
    console.log("Debug layer disabled to avoid Inspector issues");
  }

  public getCamera(): any {
    return this.camera;
  }

  public dispose(): void {
    if (this.engine) {
      console.log("Disposing game engine");

      // Remove crosshair if it exists
      if (this.crosshair && this.crosshair.parentNode) {
        document.body.removeChild(this.crosshair);
      }

      this.engine.dispose();
    }
  }

  // Improved jump method with better state updates
  private jump(): void {
    if (!this.localPlayer || !this.camera) return;

    // Only jump if not already jumping
    if (this.localPlayer.isJumping) return;

    console.log("Player initiating jump");

    this.localPlayer.isJumping = true;
    this.localPlayer.velocity.y = this.settings.jumpForce;

    // Immediately update other players about our jump state
    this.sendPlayerUpdate();

    // Track when we last sent an update
    let lastUpdateTime = Date.now();
    const updateInterval = 200; // ms between updates

    // Create a gravity effect by using a recurring function
    const applyGravity = () => {
      if (!this.localPlayer || !this.camera) return;

      const currentTime = Date.now();

      // Calculate the next position based on velocity
      const nextPosition =
        this.camera.position.y + this.localPlayer.velocity.y * 0.016;

      // Apply gravity to velocity
      this.localPlayer.velocity.y -= this.settings.gravity * 0.016;

      // Check for collision with platforms and objects
      const ray = new BABYLON.Ray(
        new BABYLON.Vector3(
          this.camera.position.x,
          nextPosition,
          this.camera.position.z
        ),
        new BABYLON.Vector3(0, -1, 0),
        1.0
      );

      const hit = this.scene.pickWithRay(ray);

      // If we hit something below us within 1.8 units, land on it
      if (hit.hit && hit.distance < 1.8) {
        this.camera.position.y = hit.pickedPoint?.y + 1.8 || 1.8;
        this.localPlayer.isJumping = false;
        this.localPlayer.velocity.y = 0;

        console.log(
          "Player landed on object at height:",
          this.camera.position.y
        );

        // Notify others that we've landed
        this.sendPlayerUpdate();

        return; // Stop the gravity effect
      } else {
        // Update camera position for jumping
        this.camera.position.y = nextPosition;

        // Ensure we're updating the local player's position too
        this.localPlayer.position.y = this.camera.position.y;

        // Only send updates at intervals to avoid flooding
        if (currentTime - lastUpdateTime > updateInterval) {
          this.sendPlayerUpdate();
          lastUpdateTime = currentTime;
        }

        // Check if landed on ground (y=0)
        if (this.camera.position.y <= 1.8) {
          this.camera.position.y = 1.8;
          this.localPlayer.isJumping = false;
          this.localPlayer.velocity.y = 0;

          console.log("Player landed on ground");

          // Notify others that we've landed
          this.sendPlayerUpdate();

          return; // Stop the gravity effect
        }
      }

      // Continue applying gravity
      requestAnimationFrame(applyGravity);
    };

    // Start the gravity effect
    requestAnimationFrame(applyGravity);
  }

  // Add a helper method to send player updates
  private sendPlayerUpdate(): void {
    if (!this.localPlayer || !this.camera) return;

    // Update the local player position and rotation from camera
    this.localPlayer.position = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
    };

    this.localPlayer.rotation = {
      x: this.camera.rotation.x,
      y: this.camera.rotation.y,
      z: this.camera.rotation.z,
    };

    // Use the debounced function to send the update
    debouncedSendPlayerUpdate(this.localPlayer);
  }

  private crouch(isCrouching: boolean): void {
    if (!this.localPlayer || !this.camera) return;

    this.localPlayer.isCrouching = isCrouching;
    this.camera.position.y = isCrouching ? 0.9 : 1.8;
  }

  public getMapObjects(): MapObject[] {
    const objects: MapObject[] = [];
    this.mapObjects.forEach((mesh, id) => {
      if (mesh) {
        objects.push({
          id,
          type: mesh.metadata?.type || "platform",
          position: {
            x: mesh.position.x,
            y: mesh.position.y,
            z: mesh.position.z,
          },
          rotation: {
            x: mesh.rotation.x,
            y: mesh.rotation.y,
            z: mesh.rotation.z,
          },
          scaling: {
            x: mesh.scaling.x,
            y: mesh.scaling.y,
            z: mesh.scaling.z,
          },
          color: mesh.metadata?.color || "#808080",
          lastUpdated: Date.now(),
        });
      }
    });
    return objects;
  }

  public updateMapObject(mapObject: MapObject): void {
    if (!BABYLON || !this.scene) return;

    let objectMesh = this.mapObjects.get(mapObject.id);

    if (!objectMesh) {
      // Create the object based on its type
      switch (mapObject.type) {
        case "platform":
          objectMesh = BABYLON.MeshBuilder.CreateBox(
            `platform-${mapObject.id}`,
            { width: 5, height: 0.5, depth: 5 },
            this.scene
          );
          break;
        case "building":
          objectMesh = BABYLON.MeshBuilder.CreateBox(
            `building-${mapObject.id}`,
            { width: 4, height: 10, depth: 4 },
            this.scene
          );
          break;
        case "light":
          objectMesh = BABYLON.MeshBuilder.CreateSphere(
            `light-${mapObject.id}`,
            { diameter: 0.8 },
            this.scene
          );

          // Add a light source
          const light = new BABYLON.PointLight(
            `light-source-${mapObject.id}`,
            new BABYLON.Vector3(0, 0, 0),
            this.scene
          );
          light.parent = objectMesh;
          light.intensity = 0.7;
          light.range = 15;
          break;
      }

      if (objectMesh) {
        // Store type in metadata for future reference
        objectMesh.metadata = {
          type: mapObject.type,
          color: mapObject.color,
        };

        // Set material
        const material = new BABYLON.StandardMaterial(
          `material-${mapObject.id}`,
          this.scene
        );

        try {
          // Try to parse the color
          const hex = mapObject.color.replace("#", "");
          const r = parseInt(hex.substring(0, 2), 16) / 255;
          const g = parseInt(hex.substring(2, 4), 16) / 255;
          const b = parseInt(hex.substring(4, 6), 16) / 255;

          material.diffuseColor = new BABYLON.Color3(r, g, b);
          material.emissiveColor = new BABYLON.Color3(
            r * 0.3,
            g * 0.3,
            b * 0.3
          );
        } catch (e) {
          // Default color if parsing fails
          material.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        }

        objectMesh.material = material;
        objectMesh.checkCollisions = true;

        this.mapObjects.set(mapObject.id, objectMesh);
      }
    }

    // Update position, rotation, and scaling
    if (objectMesh) {
      objectMesh.position.x = mapObject.position.x;
      objectMesh.position.y = mapObject.position.y;
      objectMesh.position.z = mapObject.position.z;

      objectMesh.rotation.x = mapObject.rotation.x;
      objectMesh.rotation.y = mapObject.rotation.y;
      objectMesh.rotation.z = mapObject.rotation.z;

      objectMesh.scaling.x = mapObject.scaling.x;
      objectMesh.scaling.y = mapObject.scaling.y;
      objectMesh.scaling.z = mapObject.scaling.z;
    }
  }

  /**
   * Get the direction where the camera is looking
   */
  private getForwardDirection(): any {
    if (!BABYLON || !this.camera) {
      return { normalize: () => ({ scale: () => ({}) }) };
    }

    // Get forward direction directly from the camera
    const forward = this.camera.getDirection(new BABYLON.Vector3(0, 0, 1));
    return forward.normalize();
  }

  /**
   * Create a projectile from another player (received via network)
   */
  public createRemoteProjectile(projectileData: any): void {
    if (!BABYLON || !this.scene) return;

    // Generate a unique ID for the projectile
    const projectileId = projectileData.id;

    console.log(
      "Creating remote projectile:",
      projectileId,
      "from player:",
      projectileData.playerId
    );

    // Create a projectile sphere
    const projectile = BABYLON.MeshBuilder.CreateSphere(
      projectileId,
      { diameter: 0.3 }, // Slightly larger for better visibility
      this.scene
    );

    // Create a material for the projectile
    const projectileMaterial = new BABYLON.StandardMaterial(
      `projectileMaterial-${projectileId}`,
      this.scene
    );
    projectileMaterial.diffuseColor = new BABYLON.Color3(0.3, 0.6, 1); // Blue for remote projectiles
    projectileMaterial.emissiveColor = new BABYLON.Color3(0.3, 0.6, 1);
    projectileMaterial.specularColor = new BABYLON.Color3(1, 1, 1);
    projectile.material = projectileMaterial;

    // Add glow effect
    let glowLayer = this.scene.getGlowLayerByName("projectileGlow");
    if (!glowLayer) {
      glowLayer = new BABYLON.GlowLayer("projectileGlow", this.scene);
      glowLayer.intensity = 0.8;
    }
    glowLayer.addIncludedOnlyMesh(projectile);

    // Position the projectile
    projectile.position = new BABYLON.Vector3(
      projectileData.position.x,
      projectileData.position.y,
      projectileData.position.z
    );

    // Create direction vector
    const direction = new BABYLON.Vector3(
      projectileData.direction.x,
      projectileData.direction.y,
      projectileData.direction.z
    );

    // Add a trail effect
    const trail = new BABYLON.TrailMesh(
      "trail" + projectileId,
      projectile,
      this.scene,
      0.1, // Wider trail for better visibility
      20,
      true
    );
    const trailMaterial = new BABYLON.StandardMaterial(
      "trailMaterial" + projectileId,
      this.scene
    );
    trailMaterial.emissiveColor = new BABYLON.Color3(0.3, 0.6, 1); // Blue trail
    trailMaterial.diffuseColor = new BABYLON.Color3(0.3, 0.6, 1);
    trailMaterial.alpha = 0.7;
    trail.material = trailMaterial;

    // Calculate velocity
    const speed = this.settings.projectileSpeed;
    const velocity = direction.normalize().scale(speed);

    // Calculate integer damage value
    const damageValue = Math.floor(
      this.settings.maxHealth / this.settings.shootsToKill
    );

    // Store metadata
    projectile.metadata = {
      shooterId: projectileData.playerId,
      damage: damageValue,
      velocity: velocity,
    };

    // Update function for projectile movement and tracking
    const updateFunction = () => {
      try {
        // Simple manual motion
        if (projectile.metadata?.velocity && !projectile.isDisposed()) {
          projectile.position.addInPlace(
            projectile.metadata.velocity.scale(0.016) // Scale by time delta
          );
        }

        // Simple collision detection with the local player
        if (this.localPlayer && this.camera && !projectile.isDisposed()) {
          const distance = BABYLON.Vector3.Distance(
            projectile.position,
            this.camera.position
          );

          if (distance < 1.0) {
            // Local player hit by remote projectile
            console.log(
              "Local player hit by remote projectile from:",
              projectile.metadata.shooterId
            );

            // Reduce local player health (ensure integer value)
            if (this.localPlayer) {
              const newHealth = Math.max(
                0,
                this.localPlayer.health - projectile.metadata.damage
              );
              this.localPlayer.health = Math.floor(newHealth);

              // If player died, increment the shooter's kill count
              if (this.localPlayer.health <= 0) {
                // Reset health and teleport
                this.localPlayer.health = this.settings.maxHealth;
                this.respawnLocalPlayer();

                // Increment deaths count
                this.localPlayer.deaths += 1;

                // Update server with new health and deaths count
                this.updateLocalPlayerStats();
              }
            }

            // Dispose of the projectile
            this.scene.unregisterBeforeRender(updateFunction);
            projectile.dispose();
            if (trail && !trail.isDisposed()) {
              trail.dispose();
            }
          }
        }

        // Check if projectile is too far away
        if (
          !projectile.isDisposed() &&
          BABYLON.Vector3.Distance(
            projectile.position,
            projectileData.position // Use original position for distance check
          ) > 100
        ) {
          this.scene.unregisterBeforeRender(updateFunction);
          if (trail && !trail.isDisposed()) {
            trail.dispose();
          }
          if (projectile && !projectile.isDisposed()) {
            projectile.dispose();
          }
        }
      } catch (error) {
        console.error("Error in remote projectile update:", error);
        // Clean up on error
        this.scene.unregisterBeforeRender(updateFunction);
        if (!projectile.isDisposed()) projectile.dispose();
        if (trail && !trail.isDisposed()) trail.dispose();
      }
    };

    // Register the update function
    this.scene.registerBeforeRender(updateFunction);

    // Destroy projectile after 3 seconds as a backup
    setTimeout(() => {
      try {
        this.scene.unregisterBeforeRender(updateFunction);
        if (trail && !trail.isDisposed()) {
          trail.dispose();
        }
        if (projectile && !projectile.isDisposed()) {
          projectile.dispose();
        }
      } catch (error) {
        console.error("Error disposing remote projectile:", error);
      }
    }, 3000);
  }

  // Respawn local player at a random position
  private respawnLocalPlayer(): void {
    if (!this.localPlayer || !this.camera) return;

    // Get a random spawn position
    const spawnPos = this.getRandomSpawnPosition();

    // Move the camera to spawn position
    this.camera.position = new BABYLON.Vector3(
      spawnPos.x,
      1.8, // Fixed height off the ground
      spawnPos.z
    );

    // Reset jumping and velocity
    this.localPlayer.isJumping = false;
    this.localPlayer.velocity = { x: 0, y: 0, z: 0 };
  }

  // Update local player stats to server after being hit
  private async updateLocalPlayerStats(): Promise<void> {
    try {
      if (!this.localPlayer) return;

      // Use debounced function instead of direct import
      debouncedSendPlayerUpdate(this.localPlayer);
    } catch (err) {
      console.error("Failed to update local player stats:", err);
    }
  }
}
