import {
  Scene,
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  Color3,
} from "@babylonjs/core";

export interface AndroidPlayerOptions {
  id: string;
  name: string;
  scene: Scene;
}

export class AndroidPlayer {
  private mesh: TransformNode;
  private scene: Scene;

  constructor(options: AndroidPlayerOptions) {
    this.scene = options.scene;
    this.mesh = this.createAndroidMesh(options.id, options.name);
  }

  private createAndroidMesh(
    playerId: string,
    playerName: string
  ): TransformNode {
    // Create a parent mesh for the entire player
    const playerMesh = new TransformNode(`player-${playerId}`, this.scene);

    // Create the body (cylinder for torso)
    const body = MeshBuilder.CreateCylinder(
      `player-body-${playerId}`,
      { height: 1.2, diameter: 0.7, tessellation: 16 },
      this.scene
    );
    body.parent = playerMesh;
    body.position.y = 0.9; // Position relative to parent

    // Create head (sphere)
    const head = MeshBuilder.CreateSphere(
      `player-head-${playerId}`,
      { diameter: 0.5, segments: 16 },
      this.scene
    );
    head.parent = playerMesh;
    head.position.y = 1.8; // Position on top of body

    // Create limbs
    // Left arm
    const leftArm = MeshBuilder.CreateCylinder(
      `player-leftArm-${playerId}`,
      { height: 0.8, diameter: 0.2, tessellation: 8 },
      this.scene
    );
    leftArm.parent = playerMesh;
    leftArm.position.set(-0.45, 1.2, 0);
    leftArm.rotation.z = Math.PI / 4; // Angle arm outward

    // Right arm
    const rightArm = MeshBuilder.CreateCylinder(
      `player-rightArm-${playerId}`,
      { height: 0.8, diameter: 0.2, tessellation: 8 },
      this.scene
    );
    rightArm.parent = playerMesh;
    rightArm.position.set(0.45, 1.2, 0);
    rightArm.rotation.z = -Math.PI / 4; // Angle arm outward

    // Left leg
    const leftLeg = MeshBuilder.CreateCylinder(
      `player-leftLeg-${playerId}`,
      { height: 1.0, diameter: 0.25, tessellation: 8 },
      this.scene
    );
    leftLeg.parent = playerMesh;
    leftLeg.position.set(-0.25, 0.4, 0);

    // Right leg
    const rightLeg = MeshBuilder.CreateCylinder(
      `player-rightLeg-${playerId}`,
      { height: 1.0, diameter: 0.25, tessellation: 8 },
      this.scene
    );
    rightLeg.parent = playerMesh;
    rightLeg.position.set(0.25, 0.4, 0);

    // Face details (eyes for the android)
    const leftEye = MeshBuilder.CreateSphere(
      `player-leftEye-${playerId}`,
      { diameter: 0.08, segments: 8 },
      this.scene
    );
    leftEye.parent = head;
    leftEye.position.set(-0.1, 0.05, 0.21);

    const rightEye = MeshBuilder.CreateSphere(
      `player-rightEye-${playerId}`,
      { diameter: 0.08, segments: 8 },
      this.scene
    );
    rightEye.parent = head;
    rightEye.position.set(0.1, 0.05, 0.21);

    // Create materials
    const playerColor = this.getPlayerColor(playerName);

    // Main body material
    const bodyMaterial = new StandardMaterial(
      `playerMaterial-${playerId}`,
      this.scene
    );
    bodyMaterial.diffuseColor = playerColor;
    bodyMaterial.specularColor = new Color3(0.3, 0.3, 0.3);
    bodyMaterial.emissiveColor = playerColor.scale(0.2); // Subtle glow
    body.material = bodyMaterial;
    head.material = bodyMaterial;
    leftArm.material = bodyMaterial;
    rightArm.material = bodyMaterial;
    leftLeg.material = bodyMaterial;
    rightLeg.material = bodyMaterial;

    // Eye material (glowing)
    const eyeMaterial = new StandardMaterial(
      `eyeMaterial-${playerId}`,
      this.scene
    );
    eyeMaterial.diffuseColor = new Color3(0.8, 0.8, 0.8);
    eyeMaterial.emissiveColor = new Color3(0.8, 0.8, 1.0); // Bright glow
    eyeMaterial.specularColor = new Color3(1, 1, 1);
    leftEye.material = eyeMaterial;
    rightEye.material = eyeMaterial;

    // Create a physics impostor for the player to enable bullet collisions
    const playerImpostor = MeshBuilder.CreateBox(
      `playerCollider-${playerId}`,
      { width: 0.7, height: 2, depth: 0.7 },
      this.scene
    );
    playerImpostor.parent = playerMesh;
    playerImpostor.position.y = 1; // Center of the player model
    playerImpostor.visibility = 0; // Make it invisible

    // Store player metadata
    playerImpostor.metadata = {
      playerId: playerId,
      playerName: playerName,
      health: 100, // Default health value
      isHitBox: true,
    };

    // Store animation references
    playerMesh.metadata = {
      playerId: playerId,
      playerName: playerName,
      health: 100, // Default health value
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      head,
    };

    return playerMesh;
  }

  private getPlayerColor(name: string): Color3 {
    // Return toxic green color for all players
    return new Color3(0.4, 1.0, 0.0);
  }

  public getMesh(): TransformNode {
    return this.mesh;
  }

  public dispose(): void {
    if (this.mesh) {
      this.mesh.dispose();
    }
  }
}
