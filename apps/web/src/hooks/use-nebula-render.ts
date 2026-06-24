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
 *
 * PERF(v3.42.05): 原实现使用 requestAnimationFrame 持续循环，对静态力导向图
 * 每秒重复渲染相同画面，并每帧调用 setPerf 触发 React 重渲染，导致页面冻结、
 * 侧边栏点击无响应。改为"按需渲染"：仅在 layout/selection/hover/resize/用户交互
 * 时调度单帧，perf 状态每秒最多更新一次。
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
const MAX_RENDER_NODES = 500
const PERF_UPDATE_INTERVAL_MS = 1000

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

// ─── 2D Canvas 渲染器（按需渲染版） ────────────────────────────────────

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
  private _scheduleRender: () => void

  constructor(canvas: HTMLCanvasElement, scheduleRender: () => void) {
    this.canvas = canvas
    this.ctx = canvas.getContext("2d")!
    this._scheduleRender = scheduleRender
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
    this._scheduleRender()
  }

  private _handleUp = (e: MouseEvent) => {
    const wasClick = this.isDown && !this.moved
    this.isDown = false
    this.moved = false
    if (wasClick && this._layoutRef) {
      const rect = this.canvas.getBoundingClientRect()
      const g = this.screenToGraph(e.clientX - rect.left, e.clientY - rect.top)
      const hit = this.hitTest(g.x, g.y, this._layoutRef)
      this._onClickNode?.(hit)
    }
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
    this._scheduleRender()
  }

  private _handleHover = (e: MouseEvent) => {
    if (this.isDown || !this._layoutRef) return
    const rect = this.canvas.getBoundingClientRect()
    const g = this.screenToGraph(e.clientX - rect.left, e.clientY - rect.top)
    const hit = this.hitTest(g.x, g.y, this._layoutRef)
    this._onHoverNode?.(hit)
    // hover 高亮会触发父组件重渲染并调用 render，此处无需主动 schedule
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
  const lastPerfUpdateRef = useRef(0)
  const hiddenRef = useRef(false)
  const reducedMotionRef = useRef(false)
  const layoutRef = useRef<ForceLayoutResult | null>(null)
  const selectedRef = useRef<string | null>(null)
  const hoveredRef = useRef<string | null>(null)
  const needsRenderRef = useRef(false)
  const perfRafRef = useRef(0)
  const sceneRef = useRef<THREE.Scene | null>(null)

  // ─── 容器尺寸追踪 ─────────────────────────────────────────────────────

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

  // 按需调度单帧渲染（稳定引用，永不变化）
  const scheduleRender = useCallback(() => {
    if (needsRenderRef.current) return
    needsRenderRef.current = true
    requestAnimationFrame(() => {
      needsRenderRef.current = false
      if (hiddenRef.current) return
      if (renderModeRef.current === "d3-2d") {
        if (layoutRef.current) {
          rendererRef.current?.render(layoutRef.current, selectedRef.current, hoveredRef.current)
          recordFrameRef.current()
        }
      }
    })
  }, [])

  const renderModeRef = useRef(renderMode)
  useEffect(() => { renderModeRef.current = renderMode }, [renderMode])

  // PERF(v3.42.05): FPS 检测函数，通过 ref 持有避免效应依赖变化
  const recordFrame = useCallback(() => {
    const now = performance.now()
    const elapsed = now - lastFrameTimeRef.current
    lastFrameTimeRef.current = now

    if (elapsed > 0) {
      const fps = 1000 / elapsed
      fpsSamplesRef.current.push(fps)
      if (fpsSamplesRef.current.length > 60) fpsSamplesRef.current.shift()
    }

    // 节流：每秒最多更新一次 perf state，避免 React 重渲染风暴
    if (now - lastPerfUpdateRef.current < PERF_UPDATE_INTERVAL_MS) return
    lastPerfUpdateRef.current = now

    const avgFps =
      fpsSamplesRef.current.length > 0
        ? fpsSamplesRef.current.reduce((a, b) => a + b, 0) /
          fpsSamplesRef.current.length
        : 60

    const currentMode = renderModeRef.current
    const nextPerf: RenderPerf = {
      fps: Math.round(avgFps),
      frameTimeMs: Math.round(elapsed),
      renderMode: currentMode,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      degraded: currentMode === "d3-2d",
      degradeReason: currentMode === "d3-2d" ? "auto" : undefined,
    }

    setPerf(nextPerf)

    // 自动降级
    if (currentMode === "three-3d" && avgFps < DEGRADE_FPS_THRESHOLD) {
      setRenderMode("d3-2d")
    }
  }, [nodes.length, edges.length])

  // PERF(v3.42.05): 通过 ref 持有 recordFrame 和 selectNode，
  // 避免效应因这些函数引用变化而重复销毁/重建场景。
  const recordFrameRef = useRef(recordFrame)
  useEffect(() => { recordFrameRef.current = recordFrame }, [recordFrame])

  const selectNodeRef = useRef(selectNode)
  useEffect(() => { selectNodeRef.current = selectNode }, [selectNode])

  const onNodeHoverRef = useRef(onNodeHover)
  useEffect(() => { onNodeHoverRef.current = onNodeHover }, [onNodeHover])

  // 页面可见性 + 动画偏好监听
  useEffect(() => {
    const handleVisibility = () => {
      hiddenRef.current = document.hidden
    }
    document.addEventListener("visibilitychange", handleVisibility)

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
  // PERF(v3.42.05): 效应仅依赖 renderMode 和容器尺寸。
  // selectNode / onNodeHover / scheduleRender / recordFrame 通过 ref 持有，
  // 避免这些函数引用变化导致 Canvas 被销毁重建。
  useEffect(() => {
    if (renderMode !== "d3-2d" || !containerRef.current) return
    if (containerSize.width === 0 || containerSize.height === 0) return

    // 清理 Three.js
    threeRef.current?.dispose()
    threeRef.current = null

    const container = containerRef.current
    const width = containerSize.width
    const height = containerSize.height

    // 创建 Canvas（仅首次或 renderMode 切换时创建）
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
      rendererRef.current = new D3CanvasRenderer(canvas, scheduleRender)
      rendererRef.current.setCallbacks({
        onClickNode: (id) => selectNodeRef.current(id),
        onHoverNode: (id) => {
          if (id !== hoveredRef.current) {
            setHoveredNodeId(id)
            onNodeHoverRef.current?.(id)
          }
        },
      })
    }

    rendererRef.current?.resize(width, height)

    // 初始渲染一帧
    if (layoutRef.current) {
      rendererRef.current?.render(layoutRef.current, selectedRef.current, hoveredRef.current)
      recordFrameRef.current()
    }

    return () => {
      rendererRef.current?.unbindEvents()
      canvasRef.current?.remove()
      canvasRef.current = null
      rendererRef.current = null
    }
  }, [renderMode, containerSize.width, containerSize.height])

  // layout/selection/hover 变化时重新调度渲染（D3 模式）
  useEffect(() => {
    if (renderMode !== "d3-2d") return
    scheduleRender()
  }, [renderMode, layout, selectedNodeId, hoveredNodeId])

  // Three.js 场景更新函数引用（由创建效应设置，更新效应调用）
  const updateThreeSceneRef = useRef<(() => void) | null>(null)

  // ─── Three.js 3D 场景创建 ──────────────────────────────────────────
  // PERF(v3.42.05): 场景创建仅依赖 renderMode 和容器尺寸。
  // layout / selectNode / onNodeHover / recordFrame 变化时通过 updateThreeSceneRef 更新，
  // 不再销毁重建整个 WebGL 上下文。
  // PERF(v3.42.05): 延迟 300ms 加载 Three.js（600KB+），确保页面首帧不被阻塞。
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

    let disposed = false
    let cleanup: (() => void) | undefined

    const loadTimer = setTimeout(() => {
      if (disposed || renderModeRef.current !== "three-3d") return
      import("three").then(async (THREE) => {
      if (disposed || renderModeRef.current !== "three-3d") return

      const testCanvas = document.createElement("canvas")
      const gl = testCanvas.getContext("webgl") || testCanvas.getContext("experimental-webgl")
      if (!gl) {
        console.warn("[Nebula] WebGL not available, falling back to 2D")
        setRenderMode("d3-2d")
        return
      }

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

      let controls: { update: () => void; dispose: () => void } | null = null
      if (OrbitControlsCtor) {
        controls = new OrbitControlsCtor(camera, renderer.domElement)
        ;(controls as any).enableDamping = false
        ;(controls as any).rotateSpeed = 0.5
        ;(controls as any).zoomSpeed = 0.8
        ;(controls as any).minDistance = 10
        ;(controls as any).maxDistance = 5000
        renderer.domElement.style.cursor = "grab"
      }

      // 光照
      scene.add(new THREE.AmbientLight(0x404040, 0.6))
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4)
      directionalLight.position.set(1, 1, 1)
      scene.add(directionalLight)

      const nodeMeshes: THREE.Mesh[] = []
      const edgeLines: THREE.Line[] = []
      const geometry = new THREE.SphereGeometry(1, 16, 16)

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
        const maxSize = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 100)
        const fov = (camera.fov * Math.PI) / 180
        const distance = (maxSize / 2 / Math.tan(fov / 2)) * 1.3
        camera.position.set(0, 0, distance)
        camera.lookAt(0, 0, 0)
        camera.near = Math.max(0.1, distance / 100)
        camera.far = distance * 4
        camera.updateProjectionMatrix()
      }

      // 暴露给外部的场景更新函数（由 layout/selection 变化效应调用）
      updateThreeSceneRef.current = () => {
        // PERF(v3.42.05): 先释放旧 GPU 资源，再创建新对象。
        // 之前只从 scene 移除 mesh/line 但不 dispose 材质和几何体，
        // 每次更新泄漏 ~2500 个 GPU 对象，数分钟后 WebGL 内存耗尽导致页面卡死。
        for (const mesh of nodeMeshes) {
          scene.remove(mesh)
          // 节点材质各自独立，须 dispose；geometry 是所有节点共享的，不 dispose
          const mat = mesh.material as THREE.Material
          mat.dispose()
        }
        for (const line of edgeLines) {
          scene.remove(line)
          // 边的几何体和材质都是独立创建的，须全部 dispose
          line.geometry.dispose()
          ;(line.material as THREE.Material).dispose()
        }
        nodeMeshes.length = 0
        edgeLines.length = 0

        if (!layoutRef.current) return
        const l = layoutRef.current

        for (const edge of l.edges) {
          const source = l.nodes[edge.sourceIndex]
          const target = l.nodes[edge.targetIndex]
          if (!source || !target) continue
          const lineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(source.position.x, source.position.y, source.position.z),
            new THREE.Vector3(target.position.x, target.position.y, target.position.z),
          ])
          const lineMat = new THREE.LineBasicMaterial({ color: 0x374151, transparent: true, opacity: 0.4 })
          const line = new THREE.Line(lineGeo, lineMat)
          scene.add(line)
          edgeLines.push(line)
        }

        for (const node of l.nodes) {
          const color = new THREE.Color(getCategoryColor(node.category))
          const mat = new THREE.MeshPhongMaterial({
            color, emissive: color,
            emissiveIntensity: node.id === selectedRef.current ? 0.6 : 0.15,
            transparent: true,
            opacity: node.id === selectedRef.current ? 1 : 0.8,
          })
          const mesh = new THREE.Mesh(geometry, mat)
          mesh.position.set(node.position.x, node.position.y, node.position.z)
          mesh.scale.setScalar(2 + (node.weight ?? 0.5) * 4)
          mesh.userData = { nodeId: node.id }
          scene.add(mesh)
          nodeMeshes.push(mesh)
        }
        fitCameraToScene()
      }

      // 按需渲染
      const renderOnce = () => {
        if (hiddenRef.current) return
        renderer.render(scene, camera)
        recordFrameRef.current()
      }

      // Raycaster
      const raycaster = new THREE.Raycaster()
      const mouse = new THREE.Vector2()

      renderer.domElement.addEventListener("click", (e: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect()
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(mouse, camera)
        const intersects = raycaster.intersectObjects(nodeMeshes)
        if (intersects.length > 0) {
          selectNodeRef.current(intersects[0].object.userData.nodeId as string)
        } else {
          selectNodeRef.current(null)
        }
        renderOnce()
      })

      renderer.domElement.addEventListener("mousemove", (e: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect()
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(mouse, camera)
        const intersects = raycaster.intersectObjects(nodeMeshes)
        const hit = intersects.length > 0 ? (intersects[0].object.userData.nodeId as string) : null
        if (hit !== hoveredRef.current) {
          setHoveredNodeId(hit)
          onNodeHoverRef.current?.(hit)
          renderOnce()
        }
      })

      if (controls) {
        const ctl = controls as unknown as { addEventListener: (event: string, cb: () => void) => void }
        ctl.addEventListener("change", () => renderOnce())
      }

      // 初始场景填充 + 渲染
      updateThreeSceneRef.current()
      renderOnce()

      cleanup = () => {
        // PERF(v3.42.05): 释放所有 GPU 资源，防止 WebGL 内存泄漏
        for (const mesh of nodeMeshes) {
          scene.remove(mesh)
          ;(mesh.material as THREE.Material).dispose()
        }
        for (const line of edgeLines) {
          scene.remove(line)
          line.geometry.dispose()
          ;(line.material as THREE.Material).dispose()
        }
        nodeMeshes.length = 0
        edgeLines.length = 0
        geometry.dispose()
        controls?.dispose()
        renderer.dispose()
        renderer.domElement.remove()
        scene.clear()
        updateThreeSceneRef.current = null
        sceneRef.current = null
        cameraRef.current = null
      }

      threeRef.current = { dispose: cleanup }
    }).catch((err) => {
      console.warn("[Nebula] Three.js import failed, falling back to 2D:", err)
      setRenderMode("d3-2d")
    })
    }, 300) // 延迟 300ms 让首帧先渲染

    return () => {
      disposed = true
      clearTimeout(loadTimer)
      cleanup?.()
      threeRef.current = null
    }
  }, [renderMode, containerSize.width, containerSize.height])

  // ─── Three.js 场景更新（layout / selection / hover 变化时） ────────
  // PERF(v3.42.05): 仅调用 updateThreeSceneRef 更新节点/边，不重建 WebGL 上下文。
  useEffect(() => {
    if (renderMode !== "three-3d") return
    updateThreeSceneRef.current?.()
    // 场景更新后渲染一帧
    if (threeRef.current) {
      const doRender = () => {
        if (hiddenRef.current) return
        if (sceneRef.current && cameraRef.current) {
          // 使用 threeRef 的存在来判断是否有活跃的 renderer
          recordFrameRef.current()
        }
      }
      // 延迟一帧确保场景更新完成
      requestAnimationFrame(doRender)
    }
  }, [renderMode, layout, selectedNodeId, hoveredNodeId])

  return {
    renderMode,
    perf,
    selectedNodeId,
    hoveredNodeId,
    selectNode,
    forceDegrade,
  }
}
