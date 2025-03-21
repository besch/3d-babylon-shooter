// Use conditional imports to avoid document issues during SSR
import { Player, GameSettings, MapObject } from "./types";
import {
  updatePlayerHealth,
  incrementPlayerKills,
  incrementPlayerDeaths,
  sendPlayerUpdate,
  sendProjectile,
} from "@/lib/supabase/client";
import { AndroidPlayer } from "./models/AndroidPlayer";

// Define types to avoid missing BABYLON reference
let BABYLON: any = null;
let GUI: any = null;
let cannonModule: any = null;

// Define sound objects
let soundShoot: any = null;
let soundJump: any = null;
let soundRun: any = null;
let soundDie: any = null;
let isRunning: boolean = false;
let runSoundInterval: any = null;

// Add a global volume control
let globalSoundVolume: number = 1.0;

// Add a fallback sound system using standard Web Audio API
let audioContext: AudioContext | null = null;
let audioBuffers: Record<string, AudioBuffer> = {};
let useFallbackAudio = true; // Force fallback audio by default since we know it works
let debugSound = true; // Set to true for additional sound debugging

// Function to play sounds with the fallback system
function playFallbackSound(soundName: string): boolean {
  if (!audioContext) {
    console.error(`Cannot play sound ${soundName}: Audio context is null`);
    return false;
  }

  if (!audioBuffers[soundName]) {
    console.error(`Cannot play sound ${soundName}: Sound not loaded in buffer`);
    return false;
  }

  try {
    if (debugSound) console.log(`Playing fallback sound: ${soundName}`);

    // Check audio context state
    if (audioContext.state !== "running") {
      console.warn(
        `Audio context not running (state: ${audioContext.state}), attempting to resume...`
      );
      audioContext
        .resume()
        .catch((err) => console.error("Failed to resume audio context:", err));
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffers[soundName];

    // Add gain node to control volume
    const gainNode = audioContext.createGain();
    gainNode.gain.value = globalSoundVolume;

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    source.start(0);

    if (debugSound)
      console.log(
        `Sound ${soundName} started playing at volume ${globalSoundVolume}`
      );
    return true;
  } catch (error: any) {
    console.error(`Error playing fallback sound ${soundName}:`, error);
    return false;
  }
}

// Function to load audio buffer
async function loadAudioBuffer(url: string, name: string): Promise<void> {
  if (!audioContext) {
    console.error("No audio context available for loading", name);
    return Promise.resolve(); // Return resolved promise to avoid errors in Promise.all
  }

  try {
    if (debugSound) console.log(`Loading fallback sound: ${name} from ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        `Failed to fetch sound ${name}: ${response.status} ${response.statusText}`
      );
      return Promise.reject(new Error(`HTTP error ${response.status}`));
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      console.error(`Empty array buffer for sound ${name}`);
      return Promise.reject(new Error("Empty buffer"));
    }

    console.log(
      `Decoding audio data for ${name}, buffer size: ${arrayBuffer.byteLength} bytes`
    );
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    audioBuffers[name] = audioBuffer;
    console.log(
      `Fallback sound loaded: ${name}, duration: ${audioBuffer.duration.toFixed(
        2
      )}s`
    );
    return Promise.resolve();
  } catch (error: any) {
    console.error(`Error loading fallback sound ${name}:`, error);
    return Promise.reject(error);
  }
}

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

// Helper function to convert BABYLON.Color3 to hex string
function colorToHex(color: any, alpha = 1.0): string {
  // Make sure we have maximum values of 1.0
  const r = Math.min(Math.round(color.r * 255), 255);
  const g = Math.min(Math.round(color.g * 255), 255);
  const b = Math.min(Math.round(color.b * 255), 255);

  if (alpha < 1.0) {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

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
  shootsToKill: 3, // Exactly 3 shots should kill
  respawnTime: 3000, // 3 seconds
  recoilForce: 0.5,
  projectileSpeed: 100,
  jumpForce: 20, // Increased from 5 to 8 for higher jumps
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
  private skybox: any;
  // Add event callback for local player hit
  private onLocalPlayerHitCallback: ((newHealth: number) => void) | null = null;
  // Add callback for player stats updates (kills/deaths)
  public onPlayerStatsUpdate:
    | ((stats: { kills?: number; deaths?: number }) => void)
    | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    settings: GameSettings = DEFAULT_GAME_SETTINGS
  ) {
    console.log("GameEngine constructor called");
    this.canvas = canvas;
    this.settings = settings;
  }

  // Add method to set the callback
  public onLocalPlayerHit(callback: (newHealth: number) => void): void {
    this.onLocalPlayerHitCallback = callback;
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
      this.camera.speed = 2.25; // Increase movement speed by 3x (from original 0.75)

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
              2.5 // Increase check distance to detect platforms below
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

      // Create skybox with light blue color
      this.createSkybox();

      // Ground setup - changed to light grey with texture
      console.log("Creating ground");
      this.createGround();

      // Create boundaries
      this.createBoundaries();

      // Load sounds
      this.loadSounds();

      // Setup running sound based on movement
      this.setupRunSound();

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

  private createSkybox(): void {
    if (!BABYLON || !this.scene) return;

    // Create a skybox
    this.skybox = BABYLON.MeshBuilder.CreateBox(
      "skyBox",
      { size: 1000.0 },
      this.scene
    );
    const skyboxMaterial = new BABYLON.StandardMaterial("skyBox", this.scene);
    skyboxMaterial.backFaceCulling = false;

    // Create a dynamic texture for the skybox with light blue color
    const resolution = 1024;
    const skyTexture = new BABYLON.DynamicTexture(
      "skyTexture",
      { width: resolution, height: resolution },
      this.scene
    );
    const ctx = skyTexture.getContext();

    // Create light blue gradient background
    const grd = ctx.createLinearGradient(0, 0, 0, resolution);
    grd.addColorStop(0, "#b3d9ff"); // Light blue at top
    grd.addColorStop(1, "#e6f2ff"); // Very light blue at horizon

    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, resolution, resolution);

    // Add some cloud patterns
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";

    // Create random clouds
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * resolution;
      const y = Math.random() * (resolution / 3); // Keep clouds in upper third
      const size = 50 + Math.random() * 100;

      // Draw a fluffy cloud (multiple overlapping circles)
      for (let j = 0; j < 5; j++) {
        const offsetX = (Math.random() - 0.5) * size * 0.6;
        const offsetY = (Math.random() - 0.5) * size * 0.3;
        const radius = size * 0.3 + Math.random() * size * 0.2;

        ctx.beginPath();
        ctx.arc(x + offsetX, y + offsetY, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    skyTexture.update();

    // Apply the texture to all sides of the skybox
    skyboxMaterial.reflectionTexture = skyTexture;
    skyboxMaterial.reflectionTexture.coordinatesMode =
      BABYLON.Texture.SKYBOX_MODE;
    skyboxMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0);
    skyboxMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
    this.skybox.material = skyboxMaterial;

    // Make sure the skybox follows the camera
    this.skybox.infiniteDistance = true;
  }

  private createGround(): void {
    if (!BABYLON || !this.scene) return;

    // Create a larger ground with a very light grey texture
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
    groundMaterial.diffuseColor = new BABYLON.Color3(0.98, 0.98, 0.99); // Nearly white color
    groundMaterial.specularColor = new BABYLON.Color3(0.4, 0.4, 0.5);

    // Create a texture programmatically
    const gridTexture = new BABYLON.DynamicTexture(
      "gridTexture",
      { width: 1024, height: 1024 },
      this.scene
    );
    const ctx = gridTexture.getContext();

    // Fill with very light color
    ctx.fillStyle = "#f8f9ff";
    ctx.fillRect(0, 0, 1024, 1024);

    // Draw light grid lines
    ctx.strokeStyle = "#d8e0ff";
    ctx.lineWidth = 1;

    // Draw a light grid
    const gridSize = 64;
    for (let i = 0; i <= 1024; i += gridSize) {
      // Vertical lines
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 1024);
      ctx.stroke();

      // Horizontal lines
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(1024, i);
      ctx.stroke();
    }

    // Add some subtle texture variation
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const size = 20 + Math.random() * 40;

      ctx.fillStyle = `rgba(230, 240, 255, ${Math.random() * 0.2})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    gridTexture.update();

    // Apply the texture to the ground
    groundMaterial.diffuseTexture = gridTexture;

    // Set other material properties
    groundMaterial.specularPower = 64;

    this.ground.material = groundMaterial;

    // Make grid lines appear sharper
    const diffuseTexture = groundMaterial.diffuseTexture;
    if (diffuseTexture) {
      diffuseTexture.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
      diffuseTexture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    }
  }

  private loadSounds(): void {
    if (!BABYLON || !this.scene) return;

    // Preload all sounds with correct paths and make sure they're ready to play
    try {
      console.log("Loading game sounds...");

      // Always use Web Audio API fallback system since we know it works in the test page
      useFallbackAudio = true;
      console.log("Using Web Audio API fallback system for all sounds");

      // Get base path for sounds
      const basePath = window.location.origin;
      console.log("Base URL for sound loading:", basePath);

      // Initialize fallback audio system
      try {
        // Create audio context with better error handling
        try {
          audioContext = new (window.AudioContext ||
            (window as any).webkitAudioContext)();
          console.log(
            "✓ Audio context created successfully:",
            audioContext?.state
          );
        } catch (audioContextError) {
          console.error("Failed to create audio context:", audioContextError);
          return; // Exit if we can't create an audio context
        }

        // Function to verify sound is loaded
        const testSound = (name: string) => {
          if (audioBuffers[name]) {
            console.log(`✓ Sound verified loaded: ${name}`);
          } else {
            console.error(`✗ Sound failed to load: ${name}`);
          }
        };

        // Load and test each sound
        Promise.all([
          loadAudioBuffer(`${basePath}/sounds/shoot.mp3`, "shoot").then(() =>
            testSound("shoot")
          ),
          loadAudioBuffer(`${basePath}/sounds/jump.mp3`, "jump").then(() =>
            testSound("jump")
          ),
          loadAudioBuffer(`${basePath}/sounds/run.mp3`, "run").then(() =>
            testSound("run")
          ),
          loadAudioBuffer(`${basePath}/sounds/die.mp3`, "die").then(() =>
            testSound("die")
          ),
        ])
          .then(() => {
            console.log("All fallback sounds loaded successfully");
          })
          .catch((err) => {
            console.error("Error loading some sounds:", err);
          });
      } catch (audioError: any) {
        console.error("Failed to initialize fallback audio:", audioError);
      }

      // Skip Babylon sound loading since we're forcing fallback audio

      // Play a test sound once on user interaction to unlock audio
      const unlockAudio = () => {
        console.log("User interaction detected - trying to unlock audio");

        // Unlock the Web Audio API context
        if (audioContext && audioContext.state === "suspended") {
          try {
            const resumePromise = audioContext.resume();
            resumePromise
              .then(() => {
                console.log(
                  "✓ Audio context resumed successfully, state:",
                  audioContext?.state
                );

                // Play a test sound to verify
                setTimeout(() => {
                  console.log("Testing sound playback...");
                  if (audioContext) playFallbackSound("shoot");
                }, 500);
              })
              .catch((err: any) => {
                console.error("Failed to resume audio context:", err);
              });
          } catch (resumeError) {
            console.error("Error trying to resume audio context:", resumeError);
          }
        } else {
          console.log(
            "Audio context already active, state:",
            audioContext?.state
          );

          // Play a test sound to verify anyway
          setTimeout(() => {
            console.log("Testing sound playback...");
            if (audioContext) playFallbackSound("shoot");
          }, 500);
        }

        document.removeEventListener("click", unlockAudio);
        document.removeEventListener("keydown", unlockAudio);
      };

      // Add event listeners to unlock audio on user interaction
      document.addEventListener("click", unlockAudio);
      document.addEventListener("keydown", unlockAudio);
    } catch (error: any) {
      console.error("Error loading sounds:", error);
    }
  }

  private shoot(): void {
    if (this.isRecoiling || !this.scene) return;

    // Play shoot sound with better error handling
    try {
      if (useFallbackAudio) {
        // Use the fallback sound system
        playFallbackSound("shoot");
      } else if (soundShoot) {
        // Check sound exists
        if (!soundShoot.isPlaying) {
          // Only play if not already playing
          console.log("Attempting to play shoot sound...");
          try {
            const promise = soundShoot.play();
            // Only call .then() and .catch() if promise is actually a Promise
            if (promise && typeof promise.then === "function") {
              promise
                .then(() => {
                  console.log("Shoot sound played successfully");
                })
                .catch((error: any) => {
                  console.error("Could not play shoot sound:", error);
                  // Try fallback as well
                  playFallbackSound("shoot");
                  useFallbackAudio = true;
                });
            }
          } catch (playError) {
            console.error("Error calling play():", playError);
            playFallbackSound("shoot");
            useFallbackAudio = true;
          }
        }
      } else {
        console.warn("Shoot sound not loaded or null");
        // Try fallback as well
        playFallbackSound("shoot");
      }
    } catch (error) {
      console.error("Error playing shoot sound:", error);
      // Try fallback as last resort
      playFallbackSound("shoot");
    }

    // Rest of the function remains the same...
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
      // Fix material to prevent black artifact
      weaponMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
      weaponMaterial.emissiveColor = new BABYLON.Color3(0.05, 0.05, 0.05);
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

      // Trail will be created later after the projectile has traveled some distance
      let trail: any = null;
      let trailCreated = false;
      const MIN_TRAIL_DISTANCE = 3.0; // Minimum distance projectile must travel before showing trail

      // Simple projectile motion
      const speed = this.settings.projectileSpeed;
      const velocity = direction.scale(speed);

      // Calculate exact damage to ensure 3 shots kill (34 per shot)
      const exactDamage = Math.ceil(
        this.settings.maxHealth / this.settings.shootsToKill
      );

      // Store the shooter ID for hit detection
      projectile.metadata = {
        shooterId: this.localPlayer.id,
        damage: exactDamage,
        velocity: velocity,
        initialPosition: projectile.position.clone(), // Store initial position to calculate distance traveled
      };

      // Always use simple motion as the more reliable approach
      const useSimpleMotion = true;

      // Update function for projectile movement and tracking
      const updateFunction = () => {
        try {
          if (useSimpleMotion && !projectile.isDisposed()) {
            // Simple manual motion
            if (projectile.metadata?.velocity) {
              const movement = projectile.metadata.velocity.scale(0.016); // Scale by time delta
              projectile.position.addInPlace(movement);

              // Create trail only after the projectile has traveled some distance
              if (!trailCreated) {
                const distanceTraveled = BABYLON.Vector3.Distance(
                  projectile.position,
                  projectile.metadata.initialPosition
                );

                if (distanceTraveled >= MIN_TRAIL_DISTANCE) {
                  // Create trail now that the projectile is far enough away
                  trail = new BABYLON.TrailMesh(
                    "trail-" + projectileId,
                    projectile,
                    this.scene,
                    0.05, // Width
                    15, // Length
                    true // Update every frame
                  );

                  const trailMaterial = new BABYLON.StandardMaterial(
                    "trailMaterial-" + projectileId,
                    this.scene
                  );
                  trailMaterial.emissiveColor = new BABYLON.Color3(1, 0.3, 0.3);
                  trailMaterial.diffuseColor = new BABYLON.Color3(
                    1,
                    0.05,
                    0.05
                  );
                  trailMaterial.alpha = 0.7;
                  trailMaterial.specularColor = new BABYLON.Color3(0, 0, 0); // Prevent black artifact
                  trailMaterial.backFaceCulling = false; // Fix rendering issues
                  trail.material = trailMaterial;

                  trailCreated = true;
                }
              } else if (trail && !trail.isDisposed()) {
                // Ensure trail follows correctly once created
                trail.update();
              }
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
          if (trail && !trail.isDisposed()) {
            trail.dispose();
          }
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
      // Calculate exact damage to kill in 3 shots (34 damage per shot)
      const exactDamage = Math.ceil(
        this.settings.maxHealth / this.settings.shootsToKill
      );

      // Ensure we have an integer for current health
      const currentHealth = Math.floor(
        playerToUpdate.metadata.health || this.settings.maxHealth
      );

      // Calculate new health as integer
      const newHealth = Math.max(0, currentHealth - exactDamage);
      console.log(
        `Player ${playerId} hit: Health ${currentHealth} -> ${newHealth} (damage: ${exactDamage})`
      );

      // Update the player's health locally
      playerToUpdate.metadata.health = newHealth;

      // If player has no health left, it's a kill
      if (newHealth <= 0) {
        // Play death sound for nearby players with better error handling
        try {
          if (useFallbackAudio) {
            console.log("Playing death sound using fallback audio");
            playFallbackSound("die");
          } else if (soundDie) {
            console.log("Playing death sound using Babylon audio");
            soundDie.play();
          } else {
            console.warn("Death sound not loaded");
            // Try fallback anyway
            playFallbackSound("die");
          }
        } catch (error) {
          console.error("Error playing death sound:", error);
          // Try fallback as last resort
          playFallbackSound("die");
        }

        // Increment local player kills
        if (this.localPlayer) {
          this.localPlayer.kills += 1;
          console.log(
            `Kill registered: ${this.localPlayer.id} killed ${playerId}, total kills: ${this.localPlayer.kills}`
          );

          // Notify UI about kills count change
          if (this.onPlayerStatsUpdate) {
            this.onPlayerStatsUpdate({ kills: this.localPlayer.kills });
          }
        }

        // Show kill effect
        this.showKillEffect(playerToUpdate.position);

        // Respawn player after a delay
        setTimeout(() => {
          if (playerToUpdate && !playerToUpdate.isDisposed()) {
            // Reset health to max (integer value)
            playerToUpdate.metadata.health = this.settings.maxHealth;
            console.log(
              `Player ${playerId} respawned with health: ${this.settings.maxHealth}`
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
    // Use a larger radius to utilize more of the map
    const spawnRadius = 80; // Half the map size (200/2 - margin)

    // Generate a truly random angle in radians (0 to 2π)
    const angle = Math.random() * Math.PI * 2;

    // Use square root of random value for better distribution across the radius
    // This prevents clustering near the center
    const distanceFactor = Math.sqrt(Math.random());
    const distance = distanceFactor * spawnRadius;

    // Compute position using polar coordinates
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;

    console.log(
      `Spawning player at random position: (${x.toFixed(2)}, ${z.toFixed(2)})`
    );

    return {
      x: x,
      y: 0, // On the ground
      z: z,
    };
  }

  // Respawn local player at a random position
  private respawnLocalPlayer(): void {
    if (!this.localPlayer || !this.camera) return;

    // Reset health to max
    this.localPlayer.health = this.settings.maxHealth;

    // Get a random spawn position
    const spawnPos = this.getRandomSpawnPosition();

    // Move the camera to spawn position with a slight delay to avoid physics issues
    setTimeout(() => {
      if (this.camera) {
        this.camera.position = new BABYLON.Vector3(
          spawnPos.x,
          1.8, // Fixed height off the ground
          spawnPos.z
        );

        // Make sure player is facing a random direction
        this.camera.rotation.y = Math.random() * Math.PI * 2;

        console.log("Player respawned at:", spawnPos);
      }
    }, 100);

    // Reset jumping and velocity
    this.localPlayer.isJumping = false;
    this.localPlayer.velocity = { x: 0, y: 0, z: 0 };

    // Ensure UI gets updated with new health value
    if (this.onLocalPlayerHitCallback) {
      this.onLocalPlayerHitCallback(this.localPlayer.health);
    }

    // Update server with new player state
    this.sendPlayerUpdate();
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

      // Create android player mesh using the new class
      const androidPlayer = new AndroidPlayer({
        id: player.id,
        name: player.name,
        scene: this.scene,
      });

      playerMesh = androidPlayer.getMesh();
      this.players.set(player.id, playerMesh);
    }

    // Update position and rotation - handle jumping properly
    playerMesh.position.x = player.position.x;

    // For jumping, check if isJumping is true AND y position is > 0
    // For platforms, check if y position is > 0 even when not jumping
    if (player.position.y > 0) {
      // Direct position update for elevated positions - subtract player height to account for character center
      playerMesh.position.y = Math.max(0, player.position.y - 1.8);
    } else {
      // When not elevated, keep at ground level
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

    // Return toxic green color for all players
    return new BABYLON.Color3(0.4, 1.0, 0.0);
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

    // Create buildings and platforms (still needed for proper map functionality)
    this.createBuildings();
    this.createPlatforms();

    // Create neon lights but more of them and brighter
    this.createNeonLights();

    // Create a very light fog for cyberpunk atmosphere
    this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP;
    this.scene.fogDensity = 0.002; // Even less fog density
    this.scene.fogColor = new BABYLON.Color3(0.95, 0.97, 1.0); // Almost white with slight blue tint

    // Add a brighter ambient light for the whole scene
    const ambientLight = new BABYLON.HemisphericLight(
      "ambientLight",
      new BABYLON.Vector3(0, 1, 0),
      this.scene
    );
    ambientLight.intensity = 1.0; // Maximum intensity
    ambientLight.diffuse = new BABYLON.Color3(0.95, 0.95, 1.0); // Nearly white light
    ambientLight.specular = new BABYLON.Color3(1.0, 1.0, 1.0); // White specular highlights
    ambientLight.groundColor = new BABYLON.Color3(0.9, 0.9, 0.95); // Light blue-tinted ground reflection

    // Add an additional directional light for better shadows and lighting
    const directionalLight = new BABYLON.DirectionalLight(
      "directionalLight",
      new BABYLON.Vector3(-0.5, -1, -0.5),
      this.scene
    );
    directionalLight.intensity = 0.6;
    directionalLight.diffuse = new BABYLON.Color3(1, 1, 0.95); // Slightly warm light
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

      // Light colored cyberpunk style buildings with texture
      // Randomly select a light color scheme
      const colorSchemes = [
        {
          diffuse: new BABYLON.Color3(0.9, 0.95, 1.0), // Very light blue
          emissive: new BABYLON.Color3(0.5, 0.6, 0.8),
          pattern: "dots",
        },
        {
          diffuse: new BABYLON.Color3(1.0, 0.95, 1.0), // Very light pink
          emissive: new BABYLON.Color3(0.7, 0.5, 0.7),
          pattern: "grid",
        },
        {
          diffuse: new BABYLON.Color3(0.95, 1.0, 0.95), // Very light green
          emissive: new BABYLON.Color3(0.6, 0.8, 0.6),
          pattern: "stripes",
        },
        {
          diffuse: new BABYLON.Color3(1.0, 1.0, 0.9), // Very light yellow
          emissive: new BABYLON.Color3(0.8, 0.8, 0.5),
          pattern: "noise",
        },
        {
          diffuse: new BABYLON.Color3(1.0, 0.9, 0.85), // Very light orange
          emissive: new BABYLON.Color3(0.8, 0.6, 0.5),
          pattern: "circles",
        },
      ];

      const colorScheme =
        colorSchemes[Math.floor(Math.random() * colorSchemes.length)];
      buildingMaterial.diffuseColor = colorScheme.diffuse;
      buildingMaterial.emissiveColor = colorScheme.emissive;
      buildingMaterial.specularColor = new BABYLON.Color3(0.6, 0.6, 0.6);

      // Create a procedural texture for the building
      const textureSize = 512;
      const buildingTexture = new BABYLON.DynamicTexture(
        `buildingTexture-${i}`,
        { width: textureSize, height: textureSize },
        this.scene
      );

      const ctx = buildingTexture.getContext();

      // Fill with base color
      const baseColor = colorToHex(colorScheme.diffuse);
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, textureSize, textureSize);

      // Add texture pattern based on the chosen pattern
      const detailColor = colorToHex(
        colorScheme.emissive,
        0.7 // Make pattern color more visible but still light
      );
      ctx.fillStyle = detailColor;

      switch (colorScheme.pattern) {
        case "dots":
          // Create dot pattern
          for (let x = 20; x < textureSize; x += 40) {
            for (let y = 20; y < textureSize; y += 40) {
              const size = 4 + Math.random() * 6;
              ctx.beginPath();
              ctx.arc(
                x + Math.random() * 10,
                y + Math.random() * 10,
                size,
                0,
                Math.PI * 2
              );
              ctx.fill();
            }
          }
          break;

        case "grid":
          // Create grid pattern
          ctx.lineWidth = 2;
          ctx.strokeStyle = detailColor;
          for (let x = 0; x <= textureSize; x += 64) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, textureSize);
            ctx.stroke();
          }

          for (let y = 0; y <= textureSize; y += 64) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(textureSize, y);
            ctx.stroke();
          }
          break;

        case "stripes":
          // Create horizontal stripes
          const stripeHeight = 50;
          for (let y = 0; y < textureSize; y += stripeHeight * 2) {
            ctx.fillRect(0, y, textureSize, stripeHeight);
          }
          break;

        case "noise":
          // Create noise texture
          for (let i = 0; i < 2000; i++) {
            const x = Math.random() * textureSize;
            const y = Math.random() * textureSize;
            const size = 1 + Math.random() * 3;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
          }
          break;

        case "circles":
          // Create concentric circles
          for (let i = 0; i < 5; i++) {
            const centerX = textureSize / 2;
            const centerY = textureSize / 2;
            const radius = 30 + i * 60;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.lineWidth = 10;
            ctx.strokeStyle = detailColor;
            ctx.stroke();
          }
          break;
      }

      // Update the texture
      buildingTexture.update();

      // Apply the texture to the building
      buildingMaterial.diffuseTexture = buildingTexture;

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

      // Light-colored platforms with texture
      const platformColors = [
        new BABYLON.Color3(1.0, 0.92, 0.98), // Very light pink
        new BABYLON.Color3(0.92, 0.98, 1.0), // Very light cyan
        new BABYLON.Color3(0.98, 0.92, 1.0), // Very light lavender
        new BABYLON.Color3(1.0, 0.99, 0.92), // Very light yellow
        new BABYLON.Color3(0.92, 1.0, 0.95), // Very light mint
      ];

      const colorIndex = index % platformColors.length;
      const baseColor = platformColors[colorIndex];
      platformMaterial.diffuseColor = baseColor;
      platformMaterial.emissiveColor = baseColor.scale(0.5);
      platformMaterial.specularColor = new BABYLON.Color3(1, 1, 1);

      // Create a procedural texture for the platform
      const textureSize = 256;
      const platformTexture = new BABYLON.DynamicTexture(
        `platformTexture-${index}`,
        { width: textureSize, height: textureSize },
        this.scene
      );

      const ctx = platformTexture.getContext();

      // Fill with the base color
      const baseColorHex = colorToHex(baseColor);
      ctx.fillStyle = baseColorHex;
      ctx.fillRect(0, 0, textureSize, textureSize);

      // Add a glowing edge pattern
      const glowColor = colorToHex(baseColor.scale(0.7), 0.9);
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 8;

      // Draw a border
      ctx.strokeRect(8, 8, textureSize - 16, textureSize - 16);

      // Add a center pattern based on the index
      ctx.fillStyle = glowColor;

      switch (index % 5) {
        case 0:
          // Concentric circles
          for (let i = 0; i < 3; i++) {
            const radius = 20 + i * 20;
            ctx.beginPath();
            ctx.arc(textureSize / 2, textureSize / 2, radius, 0, Math.PI * 2);
            ctx.stroke();
          }
          break;

        case 1:
          // Diamond pattern
          ctx.beginPath();
          ctx.moveTo(textureSize / 2, 50);
          ctx.lineTo(textureSize - 50, textureSize / 2);
          ctx.lineTo(textureSize / 2, textureSize - 50);
          ctx.lineTo(50, textureSize / 2);
          ctx.closePath();
          ctx.stroke();
          break;

        case 2:
          // X pattern
          ctx.beginPath();
          ctx.moveTo(50, 50);
          ctx.lineTo(textureSize - 50, textureSize - 50);
          ctx.moveTo(textureSize - 50, 50);
          ctx.lineTo(50, textureSize - 50);
          ctx.stroke();
          break;

        case 3:
          // Grid pattern
          for (let i = 50; i < textureSize; i += 50) {
            // Vertical line
            ctx.beginPath();
            ctx.moveTo(i, 50);
            ctx.lineTo(i, textureSize - 50);
            ctx.stroke();

            // Horizontal line
            ctx.beginPath();
            ctx.moveTo(50, i);
            ctx.lineTo(textureSize - 50, i);
            ctx.stroke();
          }
          break;

        case 4:
          // Spiral pattern
          const centerX = textureSize / 2;
          const centerY = textureSize / 2;
          const maxRadius = textureSize / 2 - 30;

          ctx.beginPath();
          for (let angle = 0; angle < Math.PI * 8; angle += 0.1) {
            const radius = (angle / (Math.PI * 8)) * maxRadius;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;

            if (angle === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
          break;
      }

      // Update the texture
      platformTexture.update();

      // Apply the texture to the platform
      platformMaterial.diffuseTexture = platformTexture;

      platform.material = platformMaterial;
    });
  }

  /**
   * Initialize map objects - load from server only
   */
  private async initializeMapObjects() {
    try {
      // Import the getMapObjects function dynamically
      // to avoid circular dependencies
      const { getMapObjects } = await import("@/lib/supabase/client");

      // Get existing map objects from the server
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
        console.log("No map objects found on server");

        // Instead of creating defaults, notify user to run initialization
        console.warn(
          "Please ensure map objects are initialized by calling the init API first"
        );

        // Fall back to creating some local-only objects for this session
        this.createBuildings();
        this.createPlatforms();
      }
    } catch (err) {
      console.error("Error initializing map objects:", err);

      // Fallback to creating buildings and platforms locally if server fails
      this.createBuildings();
      this.createPlatforms();
    }
  }

  private createNeonLights(): void {
    if (!BABYLON || !this.scene) return;

    // Create more neon light sources with very bright light colors
    const colors = [
      new BABYLON.Color3(1.0, 0.9, 0.95), // Brighter pink
      new BABYLON.Color3(0.9, 0.95, 1.0), // Brighter cyan
      new BABYLON.Color3(0.95, 0.9, 1.0), // Brighter lavender
      new BABYLON.Color3(1.0, 0.98, 0.9), // Brighter yellow
      new BABYLON.Color3(0.9, 1.0, 0.95), // Brighter mint
      new BABYLON.Color3(1.0, 0.95, 0.9), // Brighter peach
      new BABYLON.Color3(0.95, 1.0, 1.0), // Bright white-blue
    ];

    // Create more lights for better coverage
    for (let i = 0; i < 70; i++) {
      const posX = (Math.random() - 0.5) * 160;
      const posY = 0.5 + Math.random() * 20;
      const posZ = (Math.random() - 0.5) * 160;

      const colorIndex = Math.floor(Math.random() * colors.length);
      const color = colors[colorIndex];

      // Create a much brighter neon light source
      const light = new BABYLON.PointLight(
        `neonLight-${i}`,
        new BABYLON.Vector3(posX, posY, posZ),
        this.scene
      );

      light.diffuse = color;
      light.specular = color;
      light.intensity = 1.0 + Math.random() * 0.5; // Maximum intensity
      light.range = 20 + Math.random() * 20; // Larger range for more coverage

      // Create a glowing emissive sphere for the light source
      const sphere = BABYLON.MeshBuilder.CreateSphere(
        `neonSphere-${i}`,
        { diameter: 1.0 }, // Larger for better visibility
        this.scene
      );

      sphere.position.x = posX;
      sphere.position.y = posY;
      sphere.position.z = posZ;

      // Create material with texture for better glow effect
      const sphereMaterial = new BABYLON.StandardMaterial(
        `neonMaterial-${i}`,
        this.scene
      );

      // Create a glowing texture
      const textureSize = 256;
      const glowTexture = new BABYLON.DynamicTexture(
        `glowTexture-${i}`,
        { width: textureSize, height: textureSize },
        this.scene
      );

      const ctx = glowTexture.getContext();

      // Create radial gradient for a realistic glow
      const gradient = ctx.createRadialGradient(
        textureSize / 2,
        textureSize / 2,
        textureSize / 10,
        textureSize / 2,
        textureSize / 2,
        textureSize / 2
      );

      // Use the color with full alpha in center
      gradient.addColorStop(0, colorToHex(color, 1.0));
      // Fade out to transparent at edges
      gradient.addColorStop(1, colorToHex(color, 0.0));

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, textureSize, textureSize);

      // Update the texture
      glowTexture.update();

      // Apply the texture to the sphere
      sphereMaterial.diffuseTexture = glowTexture;
      sphereMaterial.diffuseColor = color;
      sphereMaterial.emissiveColor = color;
      sphereMaterial.specularColor = new BABYLON.Color3(1, 1, 1);
      sphereMaterial.alpha = 0.9;

      // Enable transparency and disable backface culling
      sphereMaterial.useAlphaFromDiffuseTexture = true;
      sphereMaterial.backFaceCulling = false;

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

      // Clean up sound resources
      if (soundShoot) soundShoot.dispose();
      if (soundJump) soundJump.dispose();
      if (soundRun) soundRun.dispose();
      if (soundDie) soundDie.dispose();

      // Clear any running intervals
      if (runSoundInterval) {
        clearInterval(runSoundInterval);
        runSoundInterval = null;
      }

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

    // Play jump sound with additional error handling
    try {
      if (useFallbackAudio) {
        // Use the fallback sound system
        playFallbackSound("jump");
      } else if (soundJump) {
        // Check sound exists
        if (!soundJump.isPlaying) {
          // Only play if not already playing
          console.log("Attempting to play jump sound...");
          try {
            const promise = soundJump.play();
            // Only call .then() and .catch() if promise is actually a Promise
            if (promise && typeof promise.then === "function") {
              promise
                .then(() => {
                  console.log("Jump sound played successfully");
                })
                .catch((error: any) => {
                  console.error("Could not play jump sound:", error);
                  // Try fallback as well
                  playFallbackSound("jump");
                  useFallbackAudio = true;
                });
            }
          } catch (playError) {
            console.error("Error calling play() on jump sound:", playError);
            playFallbackSound("jump");
            useFallbackAudio = true;
          }
        }
      } else {
        console.warn("Jump sound not loaded or null");
        // Try fallback as well
        playFallbackSound("jump");
      }
    } catch (error) {
      console.error("Error playing jump sound:", error);
      // Try fallback as last resort
      playFallbackSound("jump");
    }

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
        2.0 // Increase check distance to better detect platforms
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

        // Force sending updates more frequently during jumps
        this.sendPlayerUpdate();
        lastUpdateTime = currentTime;

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

        // Use a dynamic texture for all object types
        const textureSize = 512;
        const objectTexture = new BABYLON.DynamicTexture(
          `texture-${mapObject.id}`,
          { width: textureSize, height: textureSize },
          this.scene
        );
        const ctx = objectTexture.getContext();

        try {
          // Try to parse the color - ensure it's a light color
          let hex = mapObject.color.replace("#", "");
          let r = parseInt(hex.substring(0, 2), 16) / 255;
          let g = parseInt(hex.substring(2, 4), 16) / 255;
          let b = parseInt(hex.substring(4, 6), 16) / 255;

          // If the color is too dark (average value < 0.6), lighten it
          const brightness = (r + g + b) / 3;
          if (brightness < 0.6) {
            // Lighten the color (make at least 0.7 brightness)
            const targetBrightness = 0.7;
            const factor = targetBrightness / Math.max(brightness, 0.1);
            r = Math.min(r * factor, 1.0);
            g = Math.min(g * factor, 1.0);
            b = Math.min(b * factor, 1.0);
          }

          const color = new BABYLON.Color3(r, g, b);
          material.diffuseColor = color;
          material.emissiveColor = new BABYLON.Color3(
            r * 0.3,
            g * 0.3,
            b * 0.3
          );
          material.specularColor = new BABYLON.Color3(0.6, 0.6, 0.6);

          // Fill the texture background with the light color
          ctx.fillStyle = colorToHex(color);
          ctx.fillRect(0, 0, textureSize, textureSize);

          // Add texture pattern based on object type
          switch (mapObject.type) {
            case "platform":
              // Add a border pattern
              ctx.strokeStyle = colorToHex(color.scale(0.8));
              ctx.lineWidth = 10;
              ctx.strokeRect(10, 10, textureSize - 20, textureSize - 20);

              // Add a center pattern
              ctx.beginPath();
              ctx.arc(
                textureSize / 2,
                textureSize / 2,
                textureSize / 4,
                0,
                Math.PI * 2
              );
              ctx.stroke();
              break;

            case "building":
              // Add window patterns
              ctx.fillStyle = colorToHex(color.scale(0.85));
              const windowSize = 30;
              const spacing = 60;

              for (let x = spacing / 2; x < textureSize; x += spacing) {
                for (let y = spacing / 2; y < textureSize; y += spacing) {
                  ctx.fillRect(
                    x - windowSize / 2,
                    y - windowSize / 2,
                    windowSize,
                    windowSize
                  );
                }
              }
              break;

            case "light":
              // Create a glowing gradient
              const grd = ctx.createRadialGradient(
                textureSize / 2,
                textureSize / 2,
                0,
                textureSize / 2,
                textureSize / 2,
                textureSize / 2
              );
              grd.addColorStop(0, colorToHex(color, 1.0));
              grd.addColorStop(1, colorToHex(color, 0.1));

              ctx.fillStyle = grd;
              ctx.fillRect(0, 0, textureSize, textureSize);
              break;
          }

          // Update the texture
          objectTexture.update();

          // Apply the texture
          material.diffuseTexture = objectTexture;
        } catch (e) {
          // Default light color and pattern if parsing fails
          console.error("Error creating texture:", e);
          material.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9);
          material.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0.3);

          // Create a basic texture
          ctx.fillStyle = "#f0f0f0";
          ctx.fillRect(0, 0, textureSize, textureSize);
          ctx.strokeStyle = "#e0e0e0";
          ctx.lineWidth = 8;
          ctx.strokeRect(16, 16, textureSize - 32, textureSize - 32);
          objectTexture.update();
          material.diffuseTexture = objectTexture;
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

    // Calculate exact damage to kill in 3 shots
    const exactDamage = Math.ceil(
      this.settings.maxHealth / this.settings.shootsToKill
    );

    // Store metadata
    projectile.metadata = {
      shooterId: projectileData.playerId,
      damage: exactDamage,
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
              // Calculate exact damage
              const exactDamage = Math.ceil(
                this.settings.maxHealth / this.settings.shootsToKill
              );
              const newHealth = Math.max(
                0,
                this.localPlayer.health - exactDamage
              );
              this.localPlayer.health = Math.floor(newHealth);

              // Notify the callback about the health change
              if (this.onLocalPlayerHitCallback) {
                this.onLocalPlayerHitCallback(this.localPlayer.health);
              }

              // If player died, increment the shooter's kill count
              if (this.localPlayer.health <= 0) {
                // Play death sound
                try {
                  if (useFallbackAudio) {
                    console.log(
                      "Playing death sound using fallback audio (local player)"
                    );
                    playFallbackSound("die");
                  } else if (soundDie) {
                    console.log(
                      "Playing death sound using Babylon audio (local player)"
                    );
                    soundDie.play();
                  } else {
                    console.warn("Death sound not loaded (local player)");
                    // Try fallback anyway
                    playFallbackSound("die");
                  }
                } catch (error) {
                  console.error(
                    "Error playing death sound (local player):",
                    error
                  );
                  // Try fallback as last resort
                  playFallbackSound("die");
                }

                // Reset health and teleport
                this.localPlayer.health = this.settings.maxHealth;
                this.respawnLocalPlayer();

                // Increment deaths count
                this.localPlayer.deaths += 1;
                console.log(
                  `Local player died, total deaths: ${this.localPlayer.deaths}`
                );

                // Update deaths count
                if (this.onPlayerStatsUpdate) {
                  this.onPlayerStatsUpdate({ deaths: this.localPlayer.deaths });
                }

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

        // Check if projectile is too far away and dispose if needed
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

  // Add a method to get the current local player
  public getLocalPlayer(): Player | null {
    return this.localPlayer;
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

  private setupRunSound(): void {
    if (!this.scene) return;

    // Previous position to track movement
    let prevPosition = { x: 0, z: 0 };
    let lastSoundTime = 0;
    const MIN_SOUND_INTERVAL = 1000; // Minimum time in ms between run sounds (1 second)

    // Track player movement to trigger run sound
    this.scene.registerBeforeRender(() => {
      if (!this.camera || !this.localPlayer) return;

      // Get current position
      const currentPos = {
        x: this.camera.position.x,
        z: this.camera.position.z,
      };

      // Calculate movement since last frame
      const deltaX = currentPos.x - prevPosition.x;
      const deltaZ = currentPos.z - prevPosition.z;
      const distanceMoved = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);

      // Update previous position
      prevPosition = { ...currentPos };

      // Player is running if moving more than a threshold and not jumping/crouching
      const isMovingNow =
        distanceMoved > 0.05 &&
        !this.localPlayer.isJumping &&
        !this.localPlayer.isCrouching;

      // Start run sound if just started moving
      if (isMovingNow && !isRunning) {
        isRunning = true;

        // Clear any existing interval to be safe
        if (runSoundInterval) {
          clearInterval(runSoundInterval);
          runSoundInterval = null;
        }

        // Play a single run sound immediately
        const now = Date.now();
        if (now - lastSoundTime >= MIN_SOUND_INTERVAL) {
          lastSoundTime = now;
          if (useFallbackAudio) {
            playFallbackSound("run");
          } else if (soundRun && !soundRun.isPlaying) {
            try {
              soundRun.play();
            } catch (error) {
              console.error("Error playing run sound:", error);
              playFallbackSound("run");
            }
          }
        }

        // Set up interval to play run sound at appropriate intervals
        runSoundInterval = setInterval(() => {
          if (!isRunning) return;

          const currentTime = Date.now();
          if (currentTime - lastSoundTime >= MIN_SOUND_INTERVAL) {
            lastSoundTime = currentTime;

            if (useFallbackAudio) {
              playFallbackSound("run");
            } else if (soundRun && !soundRun.isPlaying) {
              try {
                soundRun.play();
              } catch (error) {
                console.error("Error playing run sound:", error);
                playFallbackSound("run");
              }
            }
          }
        }, MIN_SOUND_INTERVAL); // Use the minimum sound interval
      }
      // Stop run sound if stopped moving
      else if (!isMovingNow && isRunning) {
        isRunning = false;

        // Clear interval when stopped running
        if (runSoundInterval) {
          clearInterval(runSoundInterval);
          runSoundInterval = null;
        }
      }
    });
  }

  private setupInputHandling(): void {
    if (!this.scene) return;

    // Handle shooting with mouse down, not just clicks
    let isMouseDown = false;
    let shootingInterval: any = null;
    let keyStates: Record<string, boolean> = {}; // Track key states

    // Fix for the jumping when moving forward and shooting issue
    let isWKeyPressed = false;
    let isShooting = false;
    let hasJumpedForShoot = false;

    // Keyboard handler to prevent unintended jumps when shooting
    const handleKeyDown = (e: KeyboardEvent) => {
      keyStates[e.key] = true;

      // Special handling for W key (forward movement)
      if (e.key === "w" || e.key === "W" || e.keyCode === 87) {
        isWKeyPressed = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keyStates[e.key] = false;

      // Special handling for W key (forward movement)
      if (e.key === "w" || e.key === "W" || e.keyCode === 87) {
        isWKeyPressed = false;
      }
    };

    // Add event listeners for key tracking
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    // Mouse down event for continuous shooting
    this.scene.onPointerDown = (evt: any) => {
      try {
        if (evt.button === 0) {
          // Left button
          isMouseDown = true;
          isShooting = true;

          // Check if W key is pressed and prevent jump only in that case
          if (isWKeyPressed && !this.localPlayer?.isJumping) {
            // We're shooting while moving forward - add a temporary flag to prevent jumping
            hasJumpedForShoot = true;
            console.log("Preventing jump due to forward movement + shooting");
          }

          this.shoot(); // Shoot immediately when pressed

          // Set interval for continuous shooting
          if (!shootingInterval) {
            shootingInterval = setInterval(() => {
              if (isMouseDown) {
                // Make sure the W key state is up to date
                if (isWKeyPressed && !hasJumpedForShoot) {
                  hasJumpedForShoot = true;
                  console.log(
                    "Preventing jump in interval due to forward movement + shooting"
                  );
                }

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
          isShooting = false;
          hasJumpedForShoot = false; // Reset the flag

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

    // Handle jumping and crouching with additional safeguards
    this.scene.onKeyboardObservable.add((kbInfo: any) => {
      try {
        if (!this.localPlayer) return;

        switch (kbInfo.type) {
          case BABYLON.KeyboardEventTypes.KEYDOWN:
            // Update key states
            const key = kbInfo.event.key.toLowerCase();
            keyStates[key] = true;

            // Special handling for W key
            if (key === "w") {
              isWKeyPressed = true;
            }

            // Only trigger jump if spacebar is explicitly pressed and not during W+shoot
            if (kbInfo.event.key === " " && !this.localPlayer.isJumping) {
              // Don't jump if we're shooting while moving forward
              if (isWKeyPressed && isShooting) {
                console.log("Jump prevented due to W+shoot combination");
                hasJumpedForShoot = true;
              } else if (!hasJumpedForShoot) {
                this.jump();
              }
            } else if (kbInfo.event.key === "Shift") {
              this.crouch(true);
            }
            break;

          case BABYLON.KeyboardEventTypes.KEYUP:
            // Update keyStates
            const keyUp = kbInfo.event.key.toLowerCase();
            keyStates[keyUp] = false;

            // Special handling for W key
            if (keyUp === "w") {
              isWKeyPressed = false;
            }

            if (kbInfo.event.key === " ") {
              // Reset jump flag on spacebar release
              hasJumpedForShoot = false;
            } else if (kbInfo.event.key === "Shift") {
              this.crouch(false);
            }
            break;
        }
      } catch (error) {
        console.error("Error in keyboard handling:", error);
      }
    });

    // Rest of the function remains the same...

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
          isShooting = false;
          hasJumpedForShoot = false;

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

    // Clean up event listeners when the scene is disposed
    this.scene.onDisposeObservable.add(() => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    });
  }

  /**
   * Set volume for all game sounds
   * @param volume Volume level from 0.0 to 1.0
   */
  public setSoundVolume(volume: number): void {
    // Ensure volume is between 0 and 1
    const normalizedVolume = Math.max(0, Math.min(1, volume));
    globalSoundVolume = normalizedVolume;

    console.log(`Game sound volume set to: ${normalizedVolume}`);

    // Update volume for Babylon sounds if they exist
    if (soundShoot && soundShoot.setVolume) {
      soundShoot.setVolume(normalizedVolume);
    }

    if (soundJump && soundJump.setVolume) {
      soundJump.setVolume(normalizedVolume);
    }

    if (soundRun && soundRun.setVolume) {
      soundRun.setVolume(normalizedVolume);
    }

    if (soundDie && soundDie.setVolume) {
      soundDie.setVolume(normalizedVolume);
    }
  }
}
