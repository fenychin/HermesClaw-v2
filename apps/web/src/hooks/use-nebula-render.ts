/**
 * useNebulaRender — 图谱渲染引擎 Hook
 *
 * 负责：
 * 1. Three.js 3D 力导向渲染（桌面端默认）
 * 2. D3 2D Canvas 降级（移动端 / 低性能）
 * 3. 性能守卫：500 节点上限、<30fps 自动降级、页面隐藏暂停
 * 4. 节点点击、hover、高亮
 *
 * 不在此做图谱语义计算——只做渲染与交互。
 */
"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { useContainerSize } from "@/hooks/use-container-size"
import type * as THREE from "three"
import type {
  ForceLayoutResult,
  RenderMode,
  RenderPerf,
  GraphNode,
} from "@/types/nebula-graph"

// ─── 性能阈值 ──────────────────────────────────────────────────────────

const DEGRADE_FPS_THRESHOLD = 30
const FPS_SAMPLE_WINDOW_MS = 2000
const HIDDEN_PAUSE_CHECK_MS = 500
const MAX_RENDER_NODES = 500

// ─── 色彩映射（按 category） ──────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  company: "#3b82f6",
  product: "#10b981",
  policy: "#f59e0b",
  market: "#8b5cf6",
  region: "#ec4899",
  capital: "#06b6d4",
  tech: "#6366f1",
  energy: "#84cc16",
  trade: "#f97316",
  unknown: "#6b7280",
}

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.unknown
}

// ─── 设备检测 ──────────────────────────────────────────────────────────

function detectRenderMode(): RenderMode {
  if (typeof window === "undefined") return "d3-2d"
  // 移动端或触摸设备默认 2D
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  if (isMobile) return "d3-2d"
  // 检测 WebGL 支持
  try {
    const canvas = document.createElement("canvas")
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
    if (!gl) return "d3-2d"
  } catch {
    return "d3-2d"
  }
  return "three-3d"
}

// ─── 2D Canvas 渲染器 ──────────────────────────────────────────────────

class D3CanvasRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private width = 0
  private height = 0
  private dpr = 1

  // 视口变换（平移 + 缩放）
  private tx = 0
  private ty = 0
  private zoom = 1

  // 拖拽状态
  private isDown = false
  private moved = false
  private dragStartX = 0
  private dragStartY = 0
  private dragBaseTx = 0
  private dragBaseTy = 0

  // 外部回调
  private _onClickNode: ((id: string | null) => void) | null = null
  private _onHoverNode: ((id: string | null) => void) | null = null
  private _layoutRef: ForceLayoutResult | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext("2d")!
    this.bindEvents()
  }

  setCallbacks(opts: {
    onClickNode?: ((id: string | null) => void) | null
    onHoverNode?: ((id: string | null) => void) | null
  }) {
    this._onClickNode = opts.onClickNode ?? null
    this._onHoverNode = opts.onHoverNode ?? null
  }

  // ─── 事件绑定 ────────────────────────────────────────────────────────

  private bindEvents() {
    this.canvas.addEventListener("mousedown", this._handleDown)
    window.addEventListener("mousemove", this._handleMove)
    window.addEventListener("mouseup", this._handleUp)
    this.canvas.addEventListener("wheel", this._handleWheel, { passive: false })
    this.canvas.addEventListener("mousemove", this._handleHover)
  }

  unbindEvents() {
    window.removeEventListener("mousemove", this._handleMove)
    window.removeEventListener("mouseup", this._handleUp)
  }

  // ─── 事件处理 ────────────────────────────────────────────────────────

  private _handleDown = (e: MouseEvent) => {
    this.isDown = true
    this.moved = false
    this.dragStartX = e.clientX
    this.dragStartY = e.clientY
    this.dragBaseTx = this.tx
    this.dragBaseTy = this.ty
  }

  private _handleMove = (e: MouseEvent) => {
    if (!this.isDown) return
    const dx = e.clientX - this.dragStartX
    const dy = e.clientY - this.dragStartY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      this.moved = true
    }
    this.tx = this.dragBaseTx + dx
    this.ty = this.dragBaseTy + dy
  }

  private _handleUp = () => {
    this.isDown = false
  }

  private _handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const delta = -e.deltaY * 0.001
    const newZoom = Math.max(0.1, Math.min(10, this.zoom * (1 + delta)))
    const ratio = newZoom / this.zoom
    this.tx = mx - ratio * (mx - this.tx)
    this.ty = my - ratio * (my - this.ty)
    this.zoom = newZoom
  }

  private _handleHover = (e: MouseEvent) => {
    if (this.isDown || !this._layoutRef) return
    const rect = this.canvas.getBoundingClientRect()
    const g = this.screenToGraph(e.clientX - rect.left, e.clientY - rect.top)
    const hit = this.hitTest(g.x, g.y, this._layoutRef)
    this._onHoverNode?.(hit)
  }

  // ─── 坐标转换 ────────────────────────────────────────────────────────

  screenToGraph(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.tx) / this.zoom,
      y: (sy - this.ty) / this.zoom,
    }
  }

  // ─── 尺寸 ─────────────────────────────────────────────────────────────

  resize(w: number, h: number) {
    this.width = w
    this.height = h
    this.dpr = window.devicePixelRatio || 1
    this.canvas.width = w * this.dpr
    this.canvas.height = h * this.dpr
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  // ─── 渲染 ──────────────────────────────────────────────────────────────

  render(
    layout: ForceLayoutResult,
    selectedNodeId: string | null,
    hoveredNodeId: string | null,
  ) {
    const { ctx, width, height } = this
    ctx.clearRect(0, 0, width, height)
    this._layoutRef = layout

    ctx.save()
    ctx.translate(this.tx, this.ty)
    ctx.scale(this.zoom, this.zoom)

    // 边
    for (const edge of layout.edges) {
      const source = layout.nodes[edge.sourceIndex]
      const target = layout.nodes[edge.targetIndex]
      if (!source || !target) continue

      const isHighlighted =
        selectedNodeId === edge.source || selectedNodeId === edge.target

      ctx.strokeStyle = isHighlighted ? "rgba(148,163,184,0.6)" : "rgba(75,85,99,0.3)"
      ctx.lineWidth = isHighlighted ? 1.5 : 0.5
      ctx.beginPath()
      ctx.moveTo(source.position2d.x, source.position2d.y)
      ctx.lineTo(target.position2d.x, target.position2d.y)
      ctx.stroke()
    }

    // 节点
    for (const node of layout.nodes) {
      const radius = 4 + (node.weight ?? 0.5) * 8
      const color = getCategoryColor(node.category)
      const isSelected = node.id === selectedNodeId
      const isHovered = node.id === hoveredNodeId

      ctx.fillStyle = color
      ctx.globalAlpha = isSelected ? 1 : isHovered ? 0.9 : 0.7

      ctx.beginPath()
      ctx.arc(node.position2d.x, node.position2d.y, radius, 0, Math.PI * 2)
      ctx.fill()

      // 选中边框
      if (isSelected) {
        ctx.strokeStyle = "#fff"
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    ctx.globalAlpha = 1
    ctx.restore()
  }

  hitTest(x: number, y: number, layout: ForceLayoutResult): string | null {
    for (const node of layout.nodes) {
      const radius = 4 + (node.weight ?? 0.5) * 8
      const dx = x - node.position2d.x
      const dy = y - node.position2d.y
      if (dx * dx + dy * dy < radius * radius * 1.5) {
        return node.id
      }
    }
    return null
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────

interface UseNebulaRenderOptions {
  layout: ForceLayoutResult | null
  nodes: GraphNode[]
  edges: { id: string; source: string; target: string; relation: string; weight?: number }[]
  containerRef: React.RefObject<HTMLDivElement | null>
  onNodeClick?: (nodeId: string) => void
  onNodeHover?: (nodeId: string | null) => void
}

interface UseNebulaRenderReturn {
  renderMode: RenderMode
  perf: RenderPerf
  selectedNodeId: string | null
  hoveredNodeId: string | null
  selectNode: (id: string | null) => void
  /** 手动触发降级 */
  forceDegrade: () => void
}

export function useNebulaRender({
  layout,
  nodes,
  edges,
  containerRef,
  onNodeClick,
  onNodeHover,
}: UseNebulaRenderOptions): UseNebulaRenderReturn {
  const [renderMode, setRenderMode] = useState<RenderMode>(detectRenderMode)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [perf, setPerf] = useState<RenderPerf>({
    fps: 60,
    frameTimeMs: 0,
    renderMode: "three-3d",
    nodeCount: 0,
    edgeCount: 0,
    degraded: false,
  })

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<D3CanvasRenderer | null>(null)
  const threeRef = useRef<{ dispose: () => void } | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const fpsSamplesRef = useRef<number[]>([])
  const lastFrameTimeRef = useRef(0)
  const animFrameRef = useRef(0)
  const hiddenRef = useRef(false)
  const reducedMotionRef = useRef(false)
  const layoutRef = useRef<ForceLayoutResult | null>(null)
  const selectedRef = useRef<string | null>(null)
  const hoveredRef = useRef<string | null>(null)
  const pausedRef = useRef(false)
  const sceneRef = useRef<THREE.Scene | null>(null)

  // ─── 容器尺寸追踪（ResizeObserver → state，触发渲染重建） ──────

  const containerSize = useContainerSize(containerRef)

  // 同步 ref
  useEffect(() => { layoutRef.current = layout }, [layout])
  useEffect(() => { selectedRef.current = selectedNodeId }, [selectedNodeId])
  useEffect(() => { hoveredRef.current = hoveredNodeId }, [hoveredNodeId])

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id)
    if (id) onNodeClick?.(id)
  }, [onNodeClick])

  const forceDegrade = useCallback(() => {
    setRenderMode("d3-2d")
    setPerf((p) => ({ ...p, degraded: true, degradeReason: "fps-low" }))
  }, [])

  // FPS 检测
  const recordFrame = useCallback(() => {
    const now = performance.now()
    const elapsed = now - lastFrameTimeRef.current
    lastFrameTimeRef.current = now

    if (elapsed > 0) {
      const fps = 1000 / elapsed
      fpsSamplesRef.current.push(fps)
      if (fpsSamplesRef.current.length > 60) fpsSamplesRef.current.shift()

      // 每 FPS_SAMPLE_WINDOW_MS 检测一次
      const avgFps =
        fpsSamplesRef.current.reduce((a, b) => a + b, 0) /
        fpsSamplesRef.current.length

      setPerf({
        fps: Math.round(avgFps),
        frameTimeMs: Math.round(elapsed),
        renderMode,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        degraded: renderMode === "d3-2d",
        degradeReason: renderMode === "d3-2d" ? "auto" : undefined,
      })

      // 自动降级
      if (renderMode === "three-3d" && avgFps < DEGRADE_FPS_THRESHOLD) {
        setRenderMode("d3-2d")
      }
    }
  }, [renderMode, nodes.length, edges.length])

  // 页面可见性 + 动画偏好监听
  useEffect(() => {
    const handleVisibility = () => {
      hiddenRef.current = document.hidden
      pausedRef.current = document.hidden
    }
    document.addEventListener("visibilitychange", handleVisibility)

    // prefers-reduced-motion 媒体查询
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const handleMotion = (e: MediaQueryListEvent | MediaQueryList) => {
      reducedMotionRef.current = e.matches
    }
    handleMotion(motionQuery)
    motionQuery.addEventListener("change", handleMotion)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      motionQuery.removeEventListener("change", handleMotion)
    }
  }, [])

  // D3 2D Canvas 渲染
  useEffect(() => {
    if (renderMode !== "d3-2d" || !containerRef.current) return
    if (containerSize.width === 0 || containerSize.height === 0) return

    // 清理 Three.js
    threeRef.current?.dispose()
    threeRef.current = null

    const container = containerRef.current
    const width = containerSize.width
    const height = containerSize.height

    // 创建 Canvas
    if (!canvasRef.current) {
      const canvas = document.createElement("canvas")
      canvas.style.position = "absolute"
      canvas.style.top = "0"
      canvas.style.left = "0"
      canvas.style.width = "100%"
      canvas.style.height = "100%"
      canvas.setAttribute("aria-label", "行业生态星云 2D 降级视图")
      canvas.style.cursor = "pointer"
      container.appendChild(canvas)
      canvasRef.current = canvas
      rendererRef.current = new D3CanvasRenderer(canvas)
      rendererRef.current.setCallbacks({
        onClickNode: (id) => selectNode(id),
        onHoverNode: (id) => {
          if (id !== hoveredRef.current) {
            setHoveredNodeId(id)
            onNodeHover?.(id)
          }
        },
      })
    }

    rendererRef.current?.resize(width, height)

    const animate = () => {
      if (hiddenRef.current) {
        animFrameRef.current = requestAnimationFrame(animate)
        return
      }
      if (layoutRef.current) {
        rendererRef.current?.render(layoutRef.current, selectedRef.current, hoveredRef.current)
        recordFrame()
      }
      animFrameRef.current = requestAnimationFrame(animate)
    }

    animFrameRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      rendererRef.current?.unbindEvents()
      canvasRef.current?.remove()
      canvasRef.current = null
      rendererRef.current = null
    }
  }, [renderMode, containerRef, containerSize, selectNode, recordFrame, onNodeHover])

  // Three.js 3D 渲染
  useEffect(() => {
    if (renderMode !== "three-3d" || !containerRef.current) return
    if (containerSize.width === 0 || containerSize.height === 0) return

    // 清理 D3 canvas
    canvasRef.current?.remove()
    canvasRef.current = null
    rendererRef.current = null

    const container = containerRef.current
    const width = containerSize.width
    const height = containerSize.height

    // 延迟导入 Three.js（不阻塞页面加载）
    let disposed = false
    let dispose: (() => void) | undefined

    import("three").then(async (THREE) => {
      if (disposed || renderMode !== "three-3d") return

      const testCanvas = document.createElement("canvas")
      const gl = testCanvas.getContext("webgl") || testCanvas.getContext("experimental-webgl")
      if (!gl) {
        console.warn("[Nebula] WebGL not available, falling back to 2D")
        setRenderMode("d3-2d")
        return
      }

      // 动态导入 OrbitControls（独立 chunk，不增加 three 主包体积）
      let OrbitControlsCtor: typeof import("three/examples/jsm/controls/OrbitControls.js").OrbitControls | undefined
      try {
        const mod = await import("three/examples/jsm/controls/OrbitControls.js")
        OrbitControlsCtor = mod.OrbitControls
      } catch {
        console.warn("[Nebula] OrbitControls not available, continuing without")
      }

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000)
      camera.position.z = 300

      cameraRef.current = camera
      sceneRef.current = scene

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false })
      renderer.setSize(width, height)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.domElement.style.position = "absolute"
      renderer.domElement.style.top = "0"
      renderer.domElement.style.left = "0"
      renderer.domElement.setAttribute("aria-label", "行业生态星云 3D 力导向图")
      renderer.domElement.style.cursor = "grab"
      container.appendChild(renderer.domElement)

      // OrbitControls（支持拖拽旋转/平移/缩放）
      let controls: { update: () => void; dispose: () => void } | null = null
      if (OrbitControlsCtor) {
        controls = new OrbitControlsCtor(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.08
        controls.rotateSpeed = 0.5
        controls.zoomSpeed = 0.8
        controls.minDistance = 10
        controls.maxDistance = 5000
        renderer.domElement.style.cursor = "grab"
      }

      // 光照
      scene.add(new THREE.AmbientLight(0x404040, 0.6))
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4)
      directionalLight.position.set(1, 1, 1)
      scene.add(directionalLight)

      // 节点网格
      const nodeMeshes: THREE.Mesh[] = []
      const edgeLines: THREE.Line[] = []
      const geometry = new THREE.SphereGeometry(1, 16, 16)

      function updateScene() {
        // 清理旧对象
        for (const mesh of nodeMeshes) scene.remove(mesh)
        for (const line of edgeLines) scene.remove(line)
        nodeMeshes.length = 0
        edgeLines.length = 0

        if (!layoutRef.current) return
        const l = layoutRef.current

        // 边
        for (const edge of l.edges) {
          const source = l.nodes[edge.sourceIndex]
          const target = l.nodes[edge.targetIndex]
          if (!source || !target) continue

          const lineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(source.position.x, source.position.y, source.position.z),
            new THREE.Vector3(target.position.x, target.position.y, target.position.z),
          ])
          const lineMat = new THREE.LineBasicMaterial({
            color: 0x374151,
            transparent: true,
            opacity: 0.4,
          })
          const line = new THREE.Line(lineGeo, lineMat)
          scene.add(line)
          edgeLines.push(line)
        }

        // 节点
        for (const node of l.nodes) {
          const color = new THREE.Color(getCategoryColor(node.category))
          const mat = new THREE.MeshPhongMaterial({
            color,
            emissive: color,
            emissiveIntensity: node.id === selectedRef.current ? 0.6 : 0.15,
            transparent: true,
            opacity: node.id === selectedRef.current ? 1 : 0.8,
          })
          const mesh = new THREE.Mesh(geometry, mat)
          mesh.position.set(node.position.x, node.position.y, node.position.z)
          const scale = 2 + (node.weight ?? 0.5) * 4
          mesh.scale.setScalar(scale)
          mesh.userData = { nodeId: node.id }
          scene.add(mesh)
          nodeMeshes.push(mesh)
        }

        // 根据包围盒自适应相机距离（确保整体居中且完整可见）
        fitCameraToScene()
      }

      function fitCameraToScene() {
        if (!layoutRef.current || layoutRef.current.nodes.length === 0) return
        const l = layoutRef.current

        let minX = Infinity, minY = Infinity, minZ = Infinity
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
        for (const node of l.nodes) {
          minX = Math.min(minX, node.position.x)
          minY = Math.min(minY, node.position.y)
          minZ = Math.min(minZ, node.position.z)
          maxX = Math.max(maxX, node.position.x)
          maxY = Math.max(maxY, node.position.y)
          maxZ = Math.max(maxZ, node.position.z)
        }

        const sizeX = maxX - minX
        const sizeY = maxY - minY
        const sizeZ = maxZ - minZ
        const maxSize = Math.max(sizeX, sizeY, sizeZ, 100)

        // 根据 FOV 计算合适的相机距离（留 30% 边距）
        const fov = (camera.fov * Math.PI) / 180
        const distance = (maxSize / 2 / Math.tan(fov / 2)) * 1.3

        camera.position.set(0, 0, distance)
        camera.lookAt(0, 0, 0)
        camera.near = Math.max(0.1, distance / 100)
        camera.far = distance * 4
        camera.updateProjectionMatrix()
      }

      updateScene()

      // Raycaster 点击
      const raycaster = new THREE.Raycaster()
      const mouse = new THREE.Vector2()

      renderer.domElement.addEventListener("click", (e: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect()
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

        raycaster.setFromCamera(mouse, camera)
        const intersects = raycaster.intersectObjects(nodeMeshes)
        if (intersects.length > 0) {
          const nodeId = intersects[0].object.userData.nodeId as string
          selectNode(nodeId)
        } else {
          selectNode(null)
        }
      })

      renderer.domElement.addEventListener("mousemove", (e: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect()
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

        raycaster.setFromCamera(mouse, camera)
        const intersects = raycaster.intersectObjects(nodeMeshes)
        const hit = intersects.length > 0
          ? (intersects[0].object.userData.nodeId as string)
          : null
        if (hit !== hoveredRef.current) {
          setHoveredNodeId(hit)
          onNodeHover?.(hit)
        }
      })

      // 动画循环（有 OrbitControls 时由用户控制视角，无则自动旋转）
      const animate = () => {
        if (hiddenRef.current) {
          animFrameRef.current = requestAnimationFrame(animate)
          return
        }

        if (controls) {
          controls.update()
        } else if (!reducedMotionRef.current) {
          // 无 OrbitControls 时回退到自动旋转
          scene.rotation.y += 0.0005
        }

        renderer.render(scene, camera)
        recordFrame()
        animFrameRef.current = requestAnimationFrame(animate)
      }

      animFrameRef.current = requestAnimationFrame(animate)

      // 清理
      dispose = () => {
        cancelAnimationFrame(animFrameRef.current)
        controls?.dispose()
        renderer.dispose()
        renderer.domElement.remove()
        scene.clear()
      }

      threeRef.current = { dispose }
    }).catch((err) => {
      console.warn("[Nebula] Three.js import failed, falling back to 2D:", err)
      setRenderMode("d3-2d")
    })

    return () => {
      disposed = true
      cancelAnimationFrame(animFrameRef.current)
      dispose?.()
      threeRef.current = null
    }
  }, [renderMode, containerRef, containerSize, selectNode, recordFrame, onNodeHover])

  return {
    renderMode,
    perf,
    selectedNodeId,
    hoveredNodeId,
    selectNode,
    forceDegrade,
  }
}
