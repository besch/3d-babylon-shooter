// Use conditional imports to avoid document issues during SSR
import { Player, GameSettings } from "./types";

// Define types to avoid missing BABYLON reference
let BABYLON: any = null;
let GUI: any = null;

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
  projectileSpeed: 50,
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
      this.camera.applyGravity = true;
      this.camera.checkCollisions = true;
      this.camera.ellipsoid = new BABYLON.Vector3(0.5, 0.9, 0.5);
      this.camera.minZ = 0.1;
      this.camera.inertia = 0.5; // Lower inertia for smoother movement
      this.camera.angularSensibility = 500; // Adjust sensitivity for camera rotation

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
    const mapSize = 100; // Match the ground size
    const wallThickness = 2;

    // Create materials
    const wallMaterial = new BABYLON.StandardMaterial(
      "wallMaterial",
      this.scene
    );
    wallMaterial.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.3);
    wallMaterial.emissiveColor = new BABYLON.Color3(0.05, 0.05, 0.1);

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

    // Handle shooting
    this.scene.onPointerDown = (evt: any) => {
      if (evt.button === 0) {
        this.shoot();
      }
    };

    // Handle jumping and crouching
    this.scene.onKeyboardObservable.add((kbInfo) => {
      if (!this.localPlayer) return;

      switch (kbInfo.type) {
        case BABYLON.KeyboardEventTypes.KEYDOWN:
          if (kbInfo.event.key === " " && !this.localPlayer.isJumping) {
            this.jump();
          } else if (kbInfo.event.key === "Control") {
            this.crouch(true);
          }
          break;
        case BABYLON.KeyboardEventTypes.KEYUP:
          if (kbInfo.event.key === "Control") {
            this.crouch(false);
          }
          break;
      }
    });

    // Lock the pointer when clicking in the canvas
    this.scene.onPointerDown = (evt: any) => {
      if (!this.scene.isPointerLock) {
        this.canvas.requestPointerLock =
          this.canvas.requestPointerLock ||
          (this.canvas as any).mozRequestPointerLock ||
          (this.canvas as any).webkitRequestPointerLock;

        if (this.canvas.requestPointerLock) {
          this.canvas.requestPointerLock();
        }
      }

      if (evt.button === 0) {
        this.shoot();
      }
    };
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

    // Create projectile
    const projectile = BABYLON.MeshBuilder.CreateSphere(
      "projectile",
      { diameter: 0.1 },
      this.scene
    );
    const projectileMaterial = new BABYLON.StandardMaterial(
      "projectileMaterial",
      this.scene
    );
    projectileMaterial.diffuseColor = new BABYLON.Color3(1, 0, 0);
    projectileMaterial.emissiveColor = new BABYLON.Color3(1, 0, 0);
    projectile.material = projectileMaterial;

    // Get the exact direction where the camera is looking
    const direction = this.getForwardDirection();
    console.log("Shooting direction:", direction);

    // Position the projectile directly in front of the camera (centered with the crosshair)
    projectile.position = new BABYLON.Vector3(
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z
    ).add(direction.scale(1)); // Start 1 unit in front of camera

    // Simple projectile motion
    const speed = this.settings.projectileSpeed;

    // Create animation to move the projectile
    const frameRate = 60;
    const projectileAnimation = new BABYLON.Animation(
      "projectileAnimation",
      "position",
      frameRate,
      BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
      BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    // Set keyframes for linear motion
    const keyframes = [];
    keyframes.push({
      frame: 0,
      value: projectile.position.clone(),
    });

    // Calculate end position (50 units in front of starting position)
    const targetPosition = projectile.position.add(direction.scale(50));

    keyframes.push({
      frame: frameRate * 2, // 2 seconds
      value: targetPosition,
    });

    projectileAnimation.setKeys(keyframes);
    projectile.animations.push(projectileAnimation);

    // Start animation
    this.scene.beginAnimation(projectile, 0, frameRate * 2, false, 1, () => {
      projectile.dispose();
    });

    // Destroy projectile after 2 seconds as a backup
    setTimeout(() => {
      if (projectile && !projectile.isDisposed()) {
        projectile.dispose();
      }
    }, 2000);
  }

  private getForwardDirection(): any {
    if (!BABYLON || !this.camera) {
      return { normalize: () => ({ scale: () => ({}) }) };
    }

    // Get forward direction directly from the camera
    const forward = this.camera.getDirection(new BABYLON.Vector3(0, 0, 1));
    return forward.normalize();
  }

  public setLocalPlayer(player: Player): void {
    this.localPlayer = player;
  }

  public updatePlayer(player: Player): void {
    if (!BABYLON || !this.scene) return;

    let playerMesh = this.players.get(player.id);

    if (!playerMesh) {
      playerMesh = BABYLON.MeshBuilder.CreateBox(
        `player-${player.id}`,
        { width: 1, height: 2, depth: 1 },
        this.scene
      );
      const playerMaterial = new BABYLON.StandardMaterial(
        `playerMaterial-${player.id}`,
        this.scene
      );
      playerMaterial.diffuseColor = this.getPlayerColor(player.name);
      playerMesh.material = playerMaterial;
      this.players.set(player.id, playerMesh);
    }

    playerMesh.position.x = player.position.x;
    playerMesh.position.y = player.position.y + 1; // Center the mesh
    playerMesh.position.z = player.position.z;
    playerMesh.rotation.y = player.rotation.y;
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
    // Simplified version that doesn't rely on the physics plugin
    console.log(
      "Physics disabled - using simplified projectile motion instead"
    );
  }

  public createCyberpunkMap(): void {
    if (!this.scene) return;

    console.log("Creating cyberpunk map");
    // Create buildings
    this.createBuildings();

    // Create neon lights
    this.createNeonLights();

    // Create fog for cyberpunk atmosphere
    this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP;
    this.scene.fogDensity = 0.01;
    this.scene.fogColor = new BABYLON.Color3(0.1, 0.1, 0.2);
  }

  private createBuildings(): void {
    if (!BABYLON || !this.scene) return;

    // Create multiple buildings with different heights
    for (let i = 0; i < 20; i++) {
      const height = 5 + Math.random() * 15;
      const width = 3 + Math.random() * 7;
      const depth = 3 + Math.random() * 7;

      const posX = (Math.random() - 0.5) * 80;
      const posZ = (Math.random() - 0.5) * 80;

      // Don't create buildings too close to the spawn area
      if (Math.abs(posX) < 10 && Math.abs(posZ) < 10) continue;

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

      // Cyberpunk style - dark buildings with emissive windows
      buildingMaterial.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.15);
      buildingMaterial.emissiveColor = new BABYLON.Color3(0.05, 0.05, 0.1);
      building.material = buildingMaterial;

      // Add collision detection to buildings
      building.checkCollisions = true;
    }
  }

  private createNeonLights(): void {
    if (!BABYLON || !this.scene) return;

    // Create neon light sources around the map
    const colors = [
      new BABYLON.Color3(1, 0.2, 0.7), // Pink
      new BABYLON.Color3(0.2, 0.8, 1), // Cyan
      new BABYLON.Color3(0.8, 0.2, 1), // Purple
      new BABYLON.Color3(1, 0.8, 0.2), // Yellow
      new BABYLON.Color3(0.2, 1, 0.5), // Green
    ];

    for (let i = 0; i < 30; i++) {
      const posX = (Math.random() - 0.5) * 80;
      const posY = 0.5 + Math.random() * 10;
      const posZ = (Math.random() - 0.5) * 80;

      const colorIndex = Math.floor(Math.random() * colors.length);
      const color = colors[colorIndex];

      // Create a small neon light source
      const light = new BABYLON.PointLight(
        `neonLight-${i}`,
        new BABYLON.Vector3(posX, posY, posZ),
        this.scene
      );

      light.diffuse = color;
      light.specular = color;
      light.intensity = 0.5 + Math.random() * 0.5;
      light.range = 10 + Math.random() * 10;

      // Create a small emissive sphere for the light source
      const sphere = BABYLON.MeshBuilder.CreateSphere(
        `neonSphere-${i}`,
        { diameter: 0.5 },
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
      sphereMaterial.alpha = 0.7;
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

  private jump(): void {
    if (!this.localPlayer || !this.camera) return;

    this.localPlayer.isJumping = true;
    this.localPlayer.velocity.y = this.settings.jumpForce;
    this.camera.position.y += this.settings.jumpForce;

    // Apply gravity
    setTimeout(() => {
      if (this.localPlayer) {
        this.localPlayer.velocity.y -= this.settings.gravity * 0.016; // 60fps
        this.camera.position.y += this.localPlayer.velocity.y * 0.016;

        // Check if landed
        if (this.camera.position.y <= 1.8) {
          this.camera.position.y = 1.8;
          this.localPlayer.isJumping = false;
          this.localPlayer.velocity.y = 0;
        }
      }
    }, 16);
  }

  private crouch(isCrouching: boolean): void {
    if (!this.localPlayer || !this.camera) return;

    this.localPlayer.isCrouching = isCrouching;
    this.camera.position.y = isCrouching ? 0.9 : 1.8;
  }
}
