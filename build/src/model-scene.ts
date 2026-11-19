import {
  AmbientLight,
  Box3,
  CanvasTexture,
  DoubleSide,
  Group,
  DirectionalLight,
  HemisphereLight,
  type BufferGeometry,
  type Intersection,
  type Light,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  NoColorSpace,
  type Object3D,
  PerspectiveCamera,
  Plane,
  PMREMGenerator,
  Raycaster,
  Scene,
  type SkinnedMesh,
  Sprite,
  SpriteMaterial,
  Sphere,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Timer,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { ModelPick, Vec3 } from './annotation.ts'
import type { GltfModel } from './gltf-model-parse.ts'
import { type Lighting, DEFAULT_LIGHTING, lightLevels } from './lighting.ts'
import { saveView, type SavedView } from './camera-storage.ts'
import { createIsolation, type HiddenPiece } from './isolation.ts'
import { disposeObjectTree } from './model-disposal.ts'
import { type Clipping, clippingPlane, DEFAULT_CLIPPING } from './clipping.ts'
import { buildOutline, type OutlineNode } from './outliner.ts'
import { findPiece, namePath, pieceIdOf } from './piece-id.ts'
import { measureModel, type ModelStats } from './model-stats.ts'
import { createSceneAnimation, type SceneAnimation } from './scene-animation.ts'
import { createSceneGuides, type ModelDimensions, type SceneGuides } from './scene-guides.ts'

// Turning on wireframe makes three.js build a JavaScript array of two entries per index, then upload it.
export const WIREFRAME_MAX_INDICES = 6_000_000

export type ModelSummary = {
  stats: ModelStats
  /** Whether wireframe can be shown without building an unbounded edge list. */
  wireframeAvailable: boolean
  dimensions: ModelDimensions
  gridCellSize: number
  animationNames: string[]
  otherSceneCount: number
}

export type PickMode = 'off' | 'annotate' | 'isolate'
export type { HiddenPiece }
export type { OutlineNode }

export type SpotMarker = {
  point: Vec3
  /** Whether the note covers a zone: its sphere is drawn, and the pieces within `radius` are lit red with the clicked one. */
  zone: boolean
  radius: number
  /** The clicked piece, which is always lit red. */
  pieceId: string
}

export type ModelStage = {
  /** The renderer KTX2 textures are transcoded for. */
  renderer: WebGLRenderer
  /**
   * Shows `model` in place of the current one once its shaders are compiled; keeps the camera when
   * `keepView` and the bounds are alike, and puts it where `restore` says when that is a place the model
   * allows. On failure the current model stays and `model` is released.
   */
  show: (model: GltfModel, keepView: boolean, restore?: SavedView | null) => Promise<ModelSummary>
  /**
   * Names the document on screen, from now on remembering where the camera is under it. Called after `show`, so
   * that the framing a new model gets is not remembered for the one before it.
   */
  setViewKey: (key: string | null) => void
  /** Removes and releases the current model. */
  clear: () => void
  resetView: () => void
  setWireframe: (enabled: boolean) => void
  /** Cuts away one side of the model along an axis, to see what is inside it. */
  setClipping: (clipping: Clipping) => void
  /** How the model is lit: the type of light, how strong, how bright the picture is and where the direct light comes from. */
  setLighting: (lighting: Lighting) => void
  setGuidesVisible: (visible: boolean) => void
  playAnimation: (clipIndex: number) => void
  setAnimationPaused: (paused: boolean) => void
  /**
   * Draws each note as a numbered badge, with its piece (or, for a zone, the pieces within its radius) lit
   * red and the zone's sphere; the spot being written, if any, is a dot. Replaces whatever was drawn before.
   */
  setAnnotationMarkers: (notes: SpotMarker[], pending: SpotMarker | null) => void
  /** What a click on the model does: nothing, opens the annotation popover, or hides the piece. */
  setPickMode: (mode: PickMode) => void
  /** Shows a piece `setPickMode('isolate')` hid, named by the id its own entry in the hidden list carries. */
  showPiece: (pieceId: string) => void
  /** Shows every piece `setPickMode('isolate')` hid. */
  showAllHidden: () => void
  /** Hides the piece `pieceId` names, or shows it again if it is already hidden: for the outliner's eye icon. */
  toggleHidden: (pieceId: string) => void
  /** Moves the camera to frame just the piece `pieceId` names, as resetView does for the whole model. */
  focusPiece: (pieceId: string) => void
  /** The current view, with every note's badge, as a PNG data URL; null if the context is lost. */
  captureScreenshot: () => string | null
  dispose: () => void
}

export type StageEvents = {
  onContextLost: () => void
  onContextRestored: () => void
  /** The user clicked, without dragging, on the model; `at` is where, in CSS pixels from the view's corner. */
  onPick: (pick: ModelPick, at: { x: number; y: number }) => void
  /** The pieces `setPickMode('isolate')` is hiding changed: a click hid or showed one, or a model replaced the last. */
  onHiddenPiecesChange: (hidden: HiddenPiece[]) => void
  /** The model's scene graph, from its root down; empty once it is replaced. */
  onOutlineChange: (tree: OutlineNode | null, truncated: boolean) => void
}

// Why cap: past 2, each step multiplies the pixels shaded for little visible gain.
export const MAX_PIXEL_RATIO = 2
// Up to this much vertex work (morph targets count once each) the bounds follow the vertices, so
// rotated parts are not overstated; past it, each geometry's own box is transformed instead.
export const PRECISE_BOUNDS_WORK = 2_000_000
// Shaders still compiling by then are compiled by the first frame instead.
const COMPILE_WAIT_MS = 10_000
const MAX_ANISOTROPY = 8
// A press that moves less than this before it is released is a click, not the start of an orbit or a pan.
const CLICK_SLOP_PX = 5
// The pick dot's size as a fraction of its distance from the camera, so it stays the same size on screen.
const MARKER_SCREEN_FRACTION = 0.012
// A numbered badge's height as a fraction of the view's; the badge keeps that size however far the camera is.
const BADGE_SIZE = 0.05
const MARKER_COLOR = 0xff3b30
// Why darker than the markers: the lights and the tone mapping wash a bright red out towards pink.
const RED_PIECE_COLOR = 0xb81d13
// How many zones the shader tests at most, and how strongly it tints what lies inside them.
const MAX_ZONES = 16
const ZONE_TINT = '0.8'

type Shown = {
  model: Object3D
  guides: SceneGuides
  animation: SceneAnimation
  center: Vector3
  radius: number
  materials: Material[]
  bounds: { min: Vec3; max: Vec3 }
}

/** Vertices the precise bounds would visit, each morph target counting as another pass. */
function boundsWork(root: Object3D): number {
  let work = 0
  root.traverse((node) => {
    const geometry = (node as Mesh).geometry as BufferGeometry | undefined
    const vertices = geometry?.getAttribute('position')?.count ?? 0
    work += vertices * (1 + (geometry?.morphAttributes.position?.length ?? 0))
  })
  return work
}

const isFiniteBox = (box: Box3): boolean =>
  [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite)

/** The model's bounds, and whether it has any geometry at all. */
function boundsOf(model: Object3D): { bounds: Box3; empty: boolean } {
  model.updateMatrixWorld(true)
  let bounds = new Box3().setFromObject(model, boundsWork(model) <= PRECISE_BOUNDS_WORK)
  // Why: precise bounds visit every vertex, and one NaN vertex makes them NaN; the geometries' own
  // boxes skip such vertices.
  if (!isFiniteBox(bounds)) bounds = new Box3().setFromObject(model, false)
  // Why: a model with no geometry (only empty nodes or lights) has empty bounds.
  return bounds.isEmpty() || !isFiniteBox(bounds)
    ? { bounds: new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5)), empty: true }
    : { bounds, empty: false }
}

/** A geometry's box from its base positions, skipping vertices that are not finite numbers. */
function finiteBox(geometry: BufferGeometry): Box3 {
  const box = new Box3()
  const position = geometry.getAttribute('position')
  const point = new Vector3()
  for (let index = 0; index < position.count; index++) {
    point.fromBufferAttribute(position, index)
    if (Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)) box.expandByPoint(point)
  }
  return box
}

// Material slots three.js reads as sRGB colour; every other map holds data and must stay linear.
const SRGB_SLOTS = new Set(['map', 'emissiveMap', 'sheenColorMap', 'specularColorMap'])

/**
 * GLTFLoader caches one texture per image and sets its colour space on that shared object, so a
 * texture used both as colour and as data (a normal or ORM map) ends up sRGB in both. Data slots get
 * their own linear copy instead.
 */
function separateColorSpaces(materials: Material[]): void {
  const linearCopies = new Map<Texture, Texture>()
  for (const material of materials) {
    const slots = material as unknown as Record<string, unknown>
    for (const [slot, value] of Object.entries(slots)) {
      if (!(value instanceof Texture) || SRGB_SLOTS.has(slot) || value.colorSpace !== SRGBColorSpace) continue
      let copy = linearCopies.get(value)
      if (!copy) {
        copy = value.clone()
        copy.colorSpace = NoColorSpace
        linearCopies.set(value, copy)
      }
      slots[slot] = copy
    }
  }
}

function collectMaterials(root: Object3D): Material[] {
  const materials = new Set<Material>()
  root.traverse((node) => {
    const material = (node as Object3D & { material?: Material | Material[] }).material
    for (const entry of Array.isArray(material) ? material : material ? [material] : []) materials.add(entry)
  })
  return [...materials]
}

function hasOwnLights(root: Object3D): boolean {
  let found = false
  root.traverse((node) => {
    if ((node as Light).isLight) found = true
  })
  return found
}

function prepareForDisplay(root: Object3D, anisotropy: number): void {
  const measured = new Set<BufferGeometry>()
  root.traverse((node) => {
    // Why from the data: GLTFLoader takes these boxes from the file's min and max, which it never checks,
    // and they decide what is culled. Once per geometry, from the base shape only: morph targets would
    // multiply the work, so morphing meshes are simply never culled.
    const geometry = (node as Mesh).geometry as BufferGeometry | undefined
    if (geometry?.getAttribute('position') && !measured.has(geometry)) {
      measured.add(geometry)
      geometry.boundingBox = finiteBox(geometry)
      geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new Sphere())
    }
    if (geometry && Object.keys(geometry.morphAttributes).length > 0) node.frustumCulled = false
    // Why: a skinned mesh's bounds follow its bind pose, so animated limbs would be culled at the edges.
    if ((node as SkinnedMesh).isSkinnedMesh) node.frustumCulled = false
  })
  const materials = collectMaterials(root)
  separateColorSpaces(materials)
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) value.anisotropy = anisotropy
    }
  }
}

/**
 * One renderer, environment and camera for the life of the frame: a document change swaps the model
 * only, so reloads never pile up WebGL contexts (Chromium evicts the oldest past 16 per process).
 */
export function createModelStage(host: HTMLElement, events: StageEvents): ModelStage {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  const canvas = renderer.domElement
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = NeutralToneMapping
  canvas.style.display = 'block'
  canvas.tabIndex = 0
  host.appendChild(canvas)
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), MAX_ANISOTROPY)

  const scene = new Scene()
  const hemisphere = new HemisphereLight(0xffffff, 0x444444, 0)
  const keyLight = new DirectionalLight(0xffffff, 0)
  const ambient = new AmbientLight(0xffffff, 0)
  scene.add(hemisphere, keyLight, ambient)
  let shown: Shown | null = null
  let section: Clipping = DEFAULT_CLIPPING
  // Why on the renderer, not each material: it then also cuts through the floor grid and the markers,
  // which is the point of a plane through the model, and there is nothing else to keep in step.
  const applySection = (): void => {
    const plane = shown ? clippingPlane(section, shown.bounds) : null
    renderer.clippingPlanes = plane ? [new Plane(new Vector3(...plane.normal), plane.constant)] : []
  }
  // Set once the zone tint exists; the lighting below runs first and tells it when the model's materials changed.
  let syncZoneCopies: () => void = () => {}
  let lighting: Lighting = DEFAULT_LIGHTING
  let modelHasLights = false
  // Why metalness is set to 0 in the flat type: a metal has no colour of its own, only reflections, so with
  // the reflections off it would be black. Each material's own value is kept and put back with the other types.
  const ownMetalness = new WeakMap<Material, number>()
  const applyMaterialLook = (): void => {
    for (const material of shown?.materials ?? []) {
      const metal = material as Material & { metalness?: number }
      if (typeof metal.metalness !== 'number') continue
      if (lighting.mode === 'flat') {
        if (!ownMetalness.has(material)) ownMetalness.set(material, metal.metalness)
        metal.metalness = 0
      } else if (ownMetalness.has(material)) {
        metal.metalness = ownMetalness.get(material)!
        ownMetalness.delete(material)
      }
    }
    syncZoneCopies()
  }
  const applyLighting = (): void => {
    applyMaterialLook()
    const levels = lightLevels(lighting, modelHasLights)
    hemisphere.intensity = levels.hemisphere
    keyLight.intensity = levels.key
    keyLight.visible = levels.keyVisible
    keyLight.position.set(...levels.keyPosition)
    ambient.intensity = levels.ambient
    scene.environmentIntensity = levels.environment
    renderer.toneMappingExposure = lighting.exposure
  }
  applyLighting()

  let environment: Texture | null = null
  const buildEnvironment = (): void => {
    environment?.dispose()
    const pmrem = new PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    environment = pmrem.fromScene(room, 0.04).texture
    room.dispose()
    pmrem.dispose()
    scene.environment = environment
  }
  buildEnvironment()

  const camera = new PerspectiveCamera(45, 1, 0.01, 1000)
  const controls = new OrbitControls(camera, canvas)
  controls.listenToKeyEvents(canvas)
  let contextLost = false
  let onScreen = true

  const render = (): void => {
    if (!contextLost && onScreen) renderer.render(scene, camera)
  }
  // Why from the model's centre, not the orbit target: panning away from the model must not clip it.
  const updateClipping = (): void => {
    const center = shown?.center ?? controls.target
    const radius = shown?.radius ?? 1
    const distance = camera.position.distanceTo(center)
    camera.far = distance + radius * 4
    // Why the floor at far / 1e4: a 24-bit depth buffer cannot separate surfaces past that ratio.
    camera.near = Math.max(distance - radius * 4, camera.far / 1e4, 1e-6)
    camera.updateProjectionMatrix()
  }
  const markers = new Group()
  scene.add(markers)
  let pendingDot: Mesh | null = null
  const updateMarker = (): void => {
    pendingDot?.scale.setScalar(camera.position.distanceTo(pendingDot.position) * MARKER_SCREEN_FRACTION)
  }
  // Why remembered after a pause and when the page is hidden: a drag changes the view many times a second, and
  // the frame may be recreated the moment the person leaves the tab, without another event to save on.
  let viewKey: string | null = null
  let rememberTimer: ReturnType<typeof setTimeout> | undefined
  const rememberView = (): void => {
    clearTimeout(rememberTimer)
    if (!viewKey) return
    saveView(viewKey, {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z]
    })
  }
  const onPageHide = (): void => rememberView()
  controls.addEventListener('change', () => {
    updateClipping()
    updateMarker()
    render()
    clearTimeout(rememberTimer)
    if (viewKey) rememberTimer = setTimeout(rememberView, 250)
  })

  const raycaster = new Raycaster()
  const pointer = new Vector2()
  const finite = (value: Vector3): Vec3 | null => (Number.isFinite(value.x + value.y + value.z) ? [value.x, value.y, value.z] : null)
  // Why walked up: a hidden node hides everything under it, but the raycaster visits it all the same.
  const isVisible = (object: Object3D, root: Object3D): boolean => {
    for (let node: Object3D | null = object; node; node = node === root ? null : node.parent) {
      if (!node.visible) return false
    }
    return true
  }
  // The material a hit surface is drawn with; a mesh with several has one per group of faces.
  const surfaceOf = (entry: Intersection): Material | undefined => {
    const material = (entry.object as Mesh).material as Material | Material[] | undefined
    return Array.isArray(material) ? material[entry.face?.materialIndex ?? 0] : material
  }
  /** What the model has under a point of the canvas (CSS pixels, as pointer events give them), or null. */
  const hitAt = (clientX: number, clientY: number): Intersection | null => {
    if (!shown || contextLost) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, 1 - ((clientY - rect.top) / rect.height) * 2)
    raycaster.setFromCamera(pointer, camera)
    // Why scaled by the model: a point or a line is a pixel wide, so it needs some reach to be hit at all.
    raycaster.params.Points.threshold = shown.radius * 0.01
    raycaster.params.Line.threshold = shown.radius * 0.01
    const root = shown.model
    return raycaster.intersectObject(root, true).find((entry) => isVisible(entry.object, root) && surfaceOf(entry)?.visible !== false) ?? null
  }
  const pickAt = (clientX: number, clientY: number): ModelPick | null => {
    const hit = hitAt(clientX, clientY)
    if (!hit || !shown) return null
    const root = shown.model
    const path = namePath(hit.object, root)
    const point = finite(hit.point)
    const localPoint = finite(hit.object.worldToLocal(hit.point.clone()))
    const normal = hit.face ? finite(hit.face.normal.clone().transformDirection(hit.object.matrixWorld)) : null
    const position = finite(camera.position)
    const target = finite(controls.target)
    if (!point || !localPoint || !position || !target) return null
    return { point, localPoint, normal, pieceId: pieceIdOf(hit.object, root), path, material: surfaceOf(hit)?.name || null, camera: { position, target } }
  }

  const offset = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }
  // --- Isolating: an isolate-mode click hides the piece under it, to see what was behind it ---
  const isolation = createIsolation()
  const notifyHidden = (): void => events.onHiddenPiecesChange(isolation.list(shown?.model ?? null))
  const pickedAt = (clientX: number, clientY: number): void => {
    const hit = hitAt(clientX, clientY)
    if (hit && shown) {
      isolation.toggle(hit.object, shown.model)
      notifyHidden()
      render()
    }
  }

  // Why pointer events and a distance: OrbitControls turns a drag into an orbit, so only a press that stayed put is a click.
  let press: { id: number; x: number; y: number } | null = null
  let pickMode: PickMode = 'off'
  const onPointerDown = (event: PointerEvent): void => {
    press = pickMode !== 'off' && event.isPrimary && event.button === 0 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null
  }
  const onPointerUp = (event: PointerEvent): void => {
    const start = press
    press = null
    if (!start || event.pointerId !== start.id || event.button !== 0) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX) return
    if (pickMode === 'isolate') return pickedAt(event.clientX, event.clientY)
    const pick = pickAt(event.clientX, event.clientY)
    if (pick) events.onPick(pick, offset(event.clientX, event.clientY))
  }
  const onPointerCancel = (): void => {
    press = null
  }
  // Why Enter picks the middle: someone who cannot point can still aim the camera, then act on what is in the centre.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (pickMode === 'off' || event.key !== 'Enter' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
    const rect = canvas.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    if (pickMode === 'isolate') return pickedAt(x, y)
    const pick = pickAt(x, y)
    if (pick) events.onPick(pick, { x: rect.width / 2, y: rect.height / 2 })
  }
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerCancel)
  canvas.addEventListener('keydown', onKeyDown)

  // --- Red pieces, and red zones ---
  // Why swapping the material: the piece keeps its shape, its skin and its animation, and only its look changes.
  let red: MeshStandardMaterial | null = null
  let wireframeOn = false
  const redMaterial = (): MeshStandardMaterial => {
    red ??= new MeshStandardMaterial({ color: RED_PIECE_COLOR, emissive: MARKER_COLOR, emissiveIntensity: 0.12, roughness: 0.7, metalness: 0, side: DoubleSide })
    red.wireframe = wireframeOn
    return red
  }

  // A zone is a sphere, and only the part of the model inside it is tinted red: each fragment compares its
  // position with the zones. The pieces a zone touches get a copy of their own material that does this, so
  // they keep their textures, their skin and their animation, and no piece is painted whole.
  const zoneCentres = Array.from({ length: MAX_ZONES }, () => new Vector4())
  const zoneUniforms = { uZones: { value: zoneCentres }, uZoneCount: { value: 0 } }
  const tinted = (material: Material): Material => {
    const copy = material.clone()
    copy.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, zoneUniforms)
      shader.vertexShader = `varying vec3 vZonePosition;\n${shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n\tvZonePosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'
      )}`
      shader.fragmentShader = `varying vec3 vZonePosition;\nuniform vec4 uZones[${MAX_ZONES}];\nuniform int uZoneCount;\n${shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
	float inZone = 0.0;
	for ( int i = 0; i < ${MAX_ZONES}; i ++ ) {
		if ( i >= uZoneCount ) break;
		if ( distance( vZonePosition, uZones[ i ].xyz ) <= uZones[ i ].w ) inZone = 1.0;
	}
	gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( 1.0, 0.23, 0.19 ), ${ZONE_TINT} * inZone );`
      )}`
    }
    copy.customProgramCacheKey = () => 'zone-tint'
    return copy
  }

  type Lit = { own: Material | Material[]; copies: Material[] }
  const redPieces = new Map<Mesh, Lit>()
  const zonePieces = new Map<Mesh, Lit>()
  const restore = (pieces: Map<Mesh, Lit>, wanted: Set<Mesh>): void => {
    for (const [mesh, lit] of pieces) {
      if (wanted.has(mesh)) continue
      mesh.material = lit.own
      for (const copy of lit.copies) copy.dispose()
      pieces.delete(mesh)
    }
  }
  /** Lights `whole` pieces red, and tints the zones on `touched` ones; a piece in both is red whole. */
  const lightPieces = (whole: Set<Mesh>, touched: Set<Mesh>): void => {
    const zoned = new Set([...touched].filter((mesh) => !whole.has(mesh)))
    restore(redPieces, whole)
    restore(zonePieces, zoned)
    // Why restored first: a piece that changes kind has its own material back before the new one is put on.
    for (const mesh of whole) {
      if (redPieces.has(mesh)) continue
      redPieces.set(mesh, { own: mesh.material, copies: [] })
      mesh.material = redMaterial()
    }
    for (const mesh of zoned) {
      if (zonePieces.has(mesh)) continue
      const own = mesh.material
      const copies = (Array.isArray(own) ? own : [own]).map(tinted)
      zonePieces.set(mesh, { own, copies })
      mesh.material = Array.isArray(own) ? copies : copies[0]!
    }
    syncCopies()
  }
  // Why copied again: the wireframe and the flat lighting change the model's own materials, and a copy must follow.
  const syncCopies = (): void => {
    for (const { own, copies } of zonePieces.values()) {
      ;(Array.isArray(own) ? own : [own]).forEach((original, index) => {
        const copy = copies[index] as Material & { metalness?: number; wireframe?: boolean }
        const source = original as Material & { metalness?: number; wireframe?: boolean }
        if (copy && typeof source.metalness === 'number') copy.metalness = source.metalness
        if (copy && typeof source.wireframe === 'boolean') copy.wireframe = source.wireframe
      })
    }
  }
  syncZoneCopies = syncCopies
  const setZones = (spots: SpotMarker[]): void => {
    const zones = spots.filter((spot) => spot.zone && spot.radius > 0).slice(0, MAX_ZONES)
    zones.forEach((spot, index) => zoneCentres[index]!.set(...spot.point, spot.radius))
    zoneUniforms.uZoneCount.value = zones.length
  }
  const pieceNamed = (id: string): Mesh | null => {
    const found = shown ? findPiece(id, shown.model) : null
    return found && (found as Mesh).isMesh ? (found as Mesh) : null
  }
  /** The meshes of the model whose box comes within `radius` of `point`. */
  const piecesWithin = (point: Vec3, radius: number): Mesh[] => {
    const near: Mesh[] = []
    const box = new Box3()
    const at = new Vector3(...point)
    shown?.model.traverse((node) => {
      const mesh = node as Mesh
      const bounds = mesh.isMesh ? mesh.geometry?.boundingBox : null
      if (!bounds || !isVisible(node, shown!.model)) return
      if (box.copy(bounds).applyMatrix4(mesh.matrixWorld).distanceToPoint(at) <= radius) near.push(mesh)
    })
    return near
  }

  // A white disc with the note's number, drawn once per note; the sprite then keeps its size on screen.
  const badgeTexture = (index: number): CanvasTexture => {
    const size = 64
    const face = document.createElement('canvas')
    face.width = size
    face.height = size
    const pen = face.getContext('2d')
    if (pen) {
      pen.beginPath()
      pen.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2)
      pen.fillStyle = '#ffffff'
      pen.fill()
      pen.lineWidth = 5
      pen.strokeStyle = '#ff3b30'
      pen.stroke()
      pen.fillStyle = '#0a0a0a'
      pen.font = 'bold 34px system-ui, sans-serif'
      pen.textAlign = 'center'
      pen.textBaseline = 'middle'
      pen.fillText(String(index), size / 2, size / 2 + 2)
    }
    const texture = new CanvasTexture(face)
    texture.colorSpace = SRGBColorSpace
    return texture
  }
  const clearMarkers = (): void => {
    for (const child of [...markers.children]) {
      markers.remove(child)
      const part = child as Mesh | Sprite
      if ('geometry' in part) part.geometry.dispose()
      const material = part.material as Material & { map?: Texture | null }
      material.map?.dispose()
      material.dispose()
    }
    pendingDot = null
  }
  const setAnnotationMarkers = (notes: SpotMarker[], pending: SpotMarker | null): void => {
    clearMarkers()
    const spots = [...notes, ...(pending ? [pending] : [])]
    setZones(spots)
    lightPieces(
      new Set(spots.filter((spot) => !spot.zone).flatMap((spot) => pieceNamed(spot.pieceId) ?? [])),
      new Set(spots.filter((spot) => spot.zone && spot.radius > 0).flatMap((spot) => piecesWithin(spot.point, spot.radius)))
    )
    // Why not depth-tested: the markers say where a spot is, and a surface in front must not hide it.
    const area = (spot: SpotMarker, opacity: number): void => {
      if (!spot.zone || !(spot.radius > 0)) return
      const sphere = new Mesh(
        new SphereGeometry(spot.radius, 24, 16),
        new MeshBasicMaterial({ color: MARKER_COLOR, transparent: true, opacity, depthWrite: false, toneMapped: false })
      )
      sphere.position.set(...spot.point)
      sphere.renderOrder = 998
      markers.add(sphere)
    }
    notes.forEach((note, index) => {
      area(note, 0.07)
      const badge = new Sprite(new SpriteMaterial({ map: badgeTexture(index + 1), depthTest: false, sizeAttenuation: false, toneMapped: false }))
      badge.position.set(...note.point)
      badge.scale.setScalar(BADGE_SIZE)
      badge.renderOrder = 999
      markers.add(badge)
    })
    if (pending) {
      area(pending, 0.12)
      pendingDot = new Mesh(
        new SphereGeometry(1, 16, 12),
        new MeshBasicMaterial({ color: MARKER_COLOR, depthTest: false, transparent: true, opacity: 0.9, toneMapped: false })
      )
      pendingDot.position.set(...pending.point)
      pendingDot.renderOrder = 999
      markers.add(pendingDot)
      updateMarker()
    }
    render()
  }

  const timer = new Timer()
  const running = (): boolean =>
    shown !== null && !contextLost && onScreen && !document.hidden && shown.animation.isRunning()
  const loop = (): void => {
    if (!running()) {
      renderer.setAnimationLoop(null)
      return
    }
    timer.update()
    shown!.animation.update(timer.getDelta())
    render()
  }
  const startLoop = (): void => {
    if (running()) {
      timer.reset()
      renderer.setAnimationLoop(loop)
    }
  }
  const onVisibilityChange = (): void => {
    if (document.hidden) rememberView()
    else startLoop()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', onPageHide)
  // Why also an intersection check: a tab Orca hides with CSS still reports the document as visible.
  const visibility = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true
    if (onScreen) {
      render()
      startLoop()
    }
  })
  visibility.observe(host)

  const resize = (): void => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
    const width = Math.max(host.clientWidth, 1)
    const height = Math.max(host.clientHeight, 1)
    renderer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    render()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  // Why: moving the window to a screen with another pixel ratio changes no size the observer sees.
  let pixelRatioQuery: MediaQueryList | null = null
  const watchPixelRatio = (): void => {
    pixelRatioQuery?.removeEventListener('change', watchPixelRatio)
    pixelRatioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    pixelRatioQuery.addEventListener('change', watchPixelRatio, { once: true })
    resize()
  }
  watchPixelRatio()

  const onContextLost = (event: Event): void => {
    // Why preventDefault: it asks the browser to restore the context rather than leave it dead.
    event.preventDefault()
    contextLost = true
    renderer.setAnimationLoop(null)
    events.onContextLost()
  }
  const onContextRestored = (): void => {
    contextLost = false
    // Why only the environment: three re-uploads geometry and textures, but render targets are lost.
    buildEnvironment()
    render()
    startLoop()
    events.onContextRestored()
  }
  canvas.addEventListener('webglcontextlost', onContextLost)
  canvas.addEventListener('webglcontextrestored', onContextRestored)

  // Why apart from `frame`: focusing on a single piece must not shrink how far the orbit can still zoom
  // out, which `frame` sets from the radius it is given.
  const focusOn = (center: Vector3, radius: number): void => {
    const distance = radius / Math.sin((camera.fov * Math.PI) / 360)
    camera.position.copy(center).add(new Vector3(0.6, 0.4, 1).normalize().multiplyScalar(distance))
    controls.target.copy(center)
    controls.update()
  }
  const frame = (center: Vector3, radius: number): void => {
    focusOn(center, radius)
    controls.minDistance = radius * 1e-3
    controls.maxDistance = radius * 100
  }

  /** Moves the camera to `view` if it is a place the orbit limits allow, as set by the framing just before. */
  const putCameraAt = ({ position, target }: SavedView): void => {
    const distance = Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2])
    if (!(distance >= controls.minDistance && distance <= controls.maxDistance)) return
    camera.position.set(...position)
    controls.target.set(...target)
    controls.update()
  }

  const release = (entry: Shown): void => {
    // Why first: the model's own materials are put back before they are released with it.
    lightPieces(new Set(), new Set())
    entry.animation.dispose()
    scene.remove(entry.model, entry.guides.group)
    disposeObjectTree(entry.model)
    entry.guides.dispose()
  }

  const clear = (): void => {
    if (!shown) return
    renderer.setAnimationLoop(null)
    release(shown)
    isolation.clear()
    shown = null
    notifyHidden()
    events.onOutlineChange(null, false)
    applySection()
    render()
  }

  return {
    renderer,
    show: async (model, keepView, restore) => {
      // Why forgotten here: the camera moves while this model is framed, and that is not the last model's view.
      viewKey = null
      clearTimeout(rememberTimer)
      let guides: SceneGuides | null = null
      let animation: SceneAnimation | null = null
      let next: Shown
      let summary: ModelSummary
      try {
        const stats = measureModel(model.scene)
        prepareForDisplay(model.scene, anisotropy)
        const { bounds, empty } = boundsOf(model.scene)
        const center = bounds.getCenter(new Vector3())
        const radius = Math.max(bounds.getSize(new Vector3()).length() / 2, 1e-6)
        guides = createSceneGuides(bounds)
        animation = createSceneAnimation(model.scene, model.animations)
        next = {
          model: model.scene,
          guides,
          animation,
          center,
          radius,
          materials: collectMaterials(model.scene),
          bounds: { min: [bounds.min.x, bounds.min.y, bounds.min.z], max: [bounds.max.x, bounds.max.y, bounds.max.z] }
        }
        // Why compile first: programs for heavy materials otherwise compile inside the first frame.
        // Without parallel compilation (software GL) compileAsync only warns, so compile directly; with
        // a lost context it would wait for a restore that may never come, so the wait is bounded.
        if (!contextLost && renderer.extensions.has('KHR_parallel_shader_compile')) {
          await Promise.race([renderer.compileAsync(model.scene, camera, scene), new Promise((done) => setTimeout(done, COMPILE_WAIT_MS))])
        } else if (!contextLost) {
          renderer.compile(model.scene, camera, scene)
        }
        summary = {
          stats,
          wireframeAvailable: stats.triangles * 3 + stats.lineSegments * 2 <= WIREFRAME_MAX_INDICES,
          dimensions: empty ? { width: 0, height: 0, depth: 0 } : guides.dimensions,
          gridCellSize: guides.gridCellSize,
          animationNames: animation.clipNames,
          otherSceneCount: model.otherSceneCount
        }
      } catch (error) {
        animation?.dispose()
        guides?.dispose()
        disposeObjectTree(model.scene)
        throw error
      }

      const previous = shown
      const alike =
        previous !== null &&
        previous.center.distanceTo(next.center) < Math.max(previous.radius, next.radius) * 0.5 &&
        next.radius / previous.radius > 0.5 &&
        next.radius / previous.radius < 2
      modelHasLights = hasOwnLights(model.scene)
      applyLighting()
      clear()
      shown = next
      applyMaterialLook()
      scene.add(next.model, next.guides.group)
      if (!(keepView && alike)) frame(next.center, next.radius)
      if (restore) putCameraAt(restore)
      updateClipping()
      applySection()
      render()
      const outline = buildOutline(next.model)
      events.onOutlineChange(outline.tree, outline.truncated)
      return summary
    },
    clear,
    setViewKey: (key) => {
      viewKey = key
      rememberView()
    },
    resetView: () => {
      if (shown) frame(shown.center, shown.radius)
      updateClipping()
      render()
    },
    setWireframe: (enabled) => {
      wireframeOn = enabled
      if (red) red.wireframe = enabled
      for (const material of shown?.materials ?? []) {
        if ('wireframe' in material) material.wireframe = enabled
      }
      syncCopies()
      render()
    },
    setLighting: (next) => {
      lighting = next
      applyLighting()
      render()
    },
    setClipping: (next) => {
      section = next
      applySection()
      render()
    },
    setGuidesVisible: (visible) => {
      if (shown) shown.guides.group.visible = visible
      render()
    },
    playAnimation: (clipIndex) => {
      shown?.animation.play(clipIndex)
      render()
      startLoop()
    },
    setAnimationPaused: (paused) => {
      shown?.animation.setPaused(paused)
      if (paused) renderer.setAnimationLoop(null)
      else startLoop()
      render()
    },
    setAnnotationMarkers,
    setPickMode: (mode) => {
      pickMode = mode
      press = null
      canvas.style.cursor = mode !== 'off' ? 'crosshair' : ''
    },
    showPiece: (pieceId) => {
      isolation.show(pieceId)
      notifyHidden()
      render()
    },
    showAllHidden: () => {
      isolation.showAll()
      notifyHidden()
      render()
    },
    toggleHidden: (pieceId) => {
      if (!shown) return
      const node = findPiece(pieceId, shown.model)
      if (!node) return
      isolation.toggle(node, shown.model)
      notifyHidden()
      render()
    },
    focusPiece: (pieceId) => {
      if (!shown) return
      const node = findPiece(pieceId, shown.model)
      if (!node) return
      const { bounds } = boundsOf(node)
      focusOn(bounds.getCenter(new Vector3()), Math.max(bounds.getSize(new Vector3()).length() / 2, 1e-6))
      updateClipping()
      render()
    },
    captureScreenshot: () => {
      if (contextLost) return null
      // Why rendered again here: reading the canvas right after this call is the only time the browser
      // still guarantees its pixels, since the renderer is not asked to keep them past that (`preserveDrawingBuffer`).
      render()
      try {
        return canvas.toDataURL('image/png')
      } catch {
        return null
      }
    },
    dispose: () => {
      clear()
      clearMarkers()
      scene.remove(markers)
      red?.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      canvas.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
      clearTimeout(rememberTimer)
      pixelRatioQuery?.removeEventListener('change', watchPixelRatio)
      visibility.disconnect()
      observer.disconnect()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      controls.dispose()
      environment?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    }
  }
}
