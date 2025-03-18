// Use conditional imports to avoid document issues during SSR
import { Player, GameSettings } from "./types";

// Define types to avoid missing BABYLON reference
let BABYLON: any = null;

// Only initialize on client side
async function loadBabylonModules() {
  if (typeof window !== "undefined" && !BABYLON) {
    try {
      // Use dynamic import instead of require
      const core = await import("@babylonjs/core");
      console.log("Babylon.js core loaded successfully");
      BABYLON = core;
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
      this.camera.attachControl(this.canvas, true);
      this.camera.applyGravity = true;
      this.camera.checkCollisions = true;
      this.camera.ellipsoid = new BABYLON.Vector3(0.5, 0.9, 0.5);
      this.camera.minZ = 0.1;

      // Controls
      this.camera.keysUp.push(87); // W
      this.camera.keysDown.push(83); // S
      this.camera.keysLeft.push(65); // A
      this.camera.keysRight.push(68); // D

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

  private setupInputHandling(): void {
    if (!this.scene) return;

    this.scene.onPointerDown = (evt: any) => {
      if (evt.button === 0) {
        // Left click
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

    // Position the projectile at the weapon position
    const direction = this.getForwardDirection();
    projectile.position = new BABYLON.Vector3(
      this.camera.position.x + direction.x * 0.5,
      this.camera.position.y - 0.1 + direction.y * 0.5,
      this.camera.position.z + direction.z * 0.5
    );

    // Simple projectile motion without physics
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

    const targetPosition = projectile.position.add(direction.scale(speed * 2));

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
    if (!BABYLON || !this.camera)
      return { normalize: () => ({ scale: () => ({}) }) };

    const matrix = new BABYLON.Matrix();
    this.camera.getWorldMatrix().invertToRef(matrix);
    const direction = BABYLON.Vector3.TransformNormal(
      new BABYLON.Vector3(0, 0, 1),
      matrix
    );
    return direction.normalize();
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
    if (!this.scene) return;

    try {
      console.log("Enabling debug layer");
      this.scene.debugLayer.show();
    } catch (error) {
      console.warn("Failed to enable debug layer:", error);
    }
  }

  public dispose(): void {
    if (this.engine) {
      console.log("Disposing game engine");
      this.engine.dispose();
    }
  }
}
