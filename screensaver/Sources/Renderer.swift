import Metal
import MetalKit
import ModelIO
import simd

enum RendererError: Error { case noLibrary, noPipeline }

final class Renderer: NSObject, MTKViewDelegate {
    private let device: MTLDevice
    private let queue: MTLCommandQueue
    private let library: MTLLibrary
    private let depthState: MTLDepthStencilState

    private var waterPipeline: MTLRenderPipelineState!
    private var skyPipeline: MTLRenderPipelineState!
    private var terrainPipeline: MTLRenderPipelineState!
    private var fallbackPipeline: MTLRenderPipelineState!

    private let waterGrid: WaterGrid
    private let scene = Scene()
    private let vertexDescriptor: MDLVertexDescriptor
    private let cameraPath = CameraPath()
    private let startTime = CACurrentMediaTime()

    private var uniforms = FrameUniforms(
        viewProjection: matrix_identity_float4x4,
        cameraPosition: .zero,
        time: 0,
        sunDirection: normalize(SIMD3(0.4, 0.8, 0.3)),
        timeOfDay: 0.5,
        deepColor: SIMD3(0.02, 0.18, 0.32),
        shallowColor: SIMD3(0.20, 0.68, 0.78),
        foamColor: SIMD3(0.95, 0.98, 0.98),
        skyZenith: SIMD3(0.18, 0.42, 0.78),
        skyHorizon: SIMD3(0.82, 0.88, 0.92),
        waves: (
            GerstnerWave(direction: normalize(SIMD2( 1.0,  0.2)), amplitude: 0.55, wavelength: 42.0, speed: 0.8, steepness: 0.32),
            GerstnerWave(direction: normalize(SIMD2( 0.7, -0.7)), amplitude: 0.30, wavelength: 22.0, speed: 1.1, steepness: 0.28),
            GerstnerWave(direction: normalize(SIMD2(-0.3,  1.0)), amplitude: 0.18, wavelength: 13.0, speed: 1.5, steepness: 0.25),
            GerstnerWave(direction: normalize(SIMD2(-0.9, -0.4)), amplitude: 0.11, wavelength:  7.5, speed: 1.9, steepness: 0.22),
            GerstnerWave(direction: normalize(SIMD2( 0.2, -1.0)), amplitude: 0.06, wavelength:  4.1, speed: 2.4, steepness: 0.18),
            GerstnerWave(direction: normalize(SIMD2( 0.5,  0.6)), amplitude: 0.03, wavelength:  2.2, speed: 3.0, steepness: 0.14)
        ))

    private let aspect: Float

    init(view: MTKView, isPreview: Bool) throws {
        guard let dev = view.device else { throw RendererError.noLibrary }
        device = dev
        queue = dev.makeCommandQueue()!

        let bundle = Bundle(for: BesaidScreensaverView.self)
        if let url = bundle.url(forResource: "default", withExtension: "metallib") {
            library = try dev.makeLibrary(URL: url)
        } else {
            throw RendererError.noLibrary
        }

        let depthDesc = MTLDepthStencilDescriptor()
        depthDesc.depthCompareFunction = .less
        depthDesc.isDepthWriteEnabled = true
        depthState = dev.makeDepthStencilState(descriptor: depthDesc)!

        vertexDescriptor = Renderer.makeVertexDescriptor()
        waterGrid = WaterGrid(device: dev, extent: 800, divisions: isPreview ? 128 : 256)
        aspect = Float(view.drawableSize.width / max(view.drawableSize.height, 1))

        super.init()
        try buildPipelines(view: view)
        scene.load(device: dev, vertexDescriptor: vertexDescriptor)
        applyPreferences()
    }

    func applyPreferences() {
        switch Preferences.shared.timeOfDay {
        case .dawn:
            uniforms.timeOfDay = 0.15
            uniforms.sunDirection = normalize(SIMD3(0.9, 0.2, 0.3))
            uniforms.skyZenith = SIMD3(0.25, 0.28, 0.55)
            uniforms.skyHorizon = SIMD3(1.00, 0.65, 0.45)
            uniforms.deepColor = SIMD3(0.05, 0.12, 0.28)
            uniforms.shallowColor = SIMD3(0.35, 0.52, 0.62)
        case .noon:
            uniforms.timeOfDay = 0.5
            uniforms.sunDirection = normalize(SIMD3(0.3, 0.9, 0.2))
            uniforms.skyZenith = SIMD3(0.12, 0.38, 0.78)
            uniforms.skyHorizon = SIMD3(0.78, 0.88, 0.95)
            uniforms.deepColor = SIMD3(0.02, 0.18, 0.32)
            uniforms.shallowColor = SIMD3(0.20, 0.68, 0.78)
        case .sunset:
            uniforms.timeOfDay = 0.85
            uniforms.sunDirection = normalize(SIMD3(-0.95, 0.15, 0.2))
            uniforms.skyZenith = SIMD3(0.18, 0.10, 0.32)
            uniforms.skyHorizon = SIMD3(0.98, 0.48, 0.28)
            uniforms.deepColor = SIMD3(0.08, 0.08, 0.25)
            uniforms.shallowColor = SIMD3(0.55, 0.42, 0.48)
        case .night:
            uniforms.timeOfDay = 1.0
            uniforms.sunDirection = normalize(SIMD3(-0.4, 0.6, -0.3))
            uniforms.skyZenith = SIMD3(0.01, 0.02, 0.06)
            uniforms.skyHorizon = SIMD3(0.05, 0.10, 0.22)
            uniforms.deepColor = SIMD3(0.01, 0.04, 0.10)
            uniforms.shallowColor = SIMD3(0.08, 0.18, 0.25)
        }
    }

    private static func makeVertexDescriptor() -> MDLVertexDescriptor {
        let d = MDLVertexDescriptor()
        d.attributes[0] = MDLVertexAttribute(name: MDLVertexAttributePosition,
                                             format: .float3, offset: 0, bufferIndex: 0)
        d.attributes[1] = MDLVertexAttribute(name: MDLVertexAttributeNormal,
                                             format: .float3, offset: 12, bufferIndex: 0)
        d.attributes[2] = MDLVertexAttribute(name: MDLVertexAttributeTextureCoordinate,
                                             format: .float2, offset: 24, bufferIndex: 0)
        d.layouts[0] = MDLVertexBufferLayout(stride: 32)
        return d
    }

    private func buildPipelines(view: MTKView) throws {
        let mtlVD = MTKMetalVertexDescriptorFromModelIO(vertexDescriptor)!

        func make(vs: String, fs: String, vd: MTLVertexDescriptor?) throws -> MTLRenderPipelineState {
            let desc = MTLRenderPipelineDescriptor()
            desc.vertexFunction = library.makeFunction(name: vs)
            desc.fragmentFunction = library.makeFunction(name: fs)
            desc.colorAttachments[0].pixelFormat = view.colorPixelFormat
            desc.depthAttachmentPixelFormat = view.depthStencilPixelFormat
            if let vd = vd { desc.vertexDescriptor = vd }
            return try device.makeRenderPipelineState(descriptor: desc)
        }

        waterPipeline    = try make(vs: "water_vertex",    fs: "water_fragment",    vd: waterGrid.vertexDescriptor)
        skyPipeline      = try make(vs: "sky_vertex",      fs: "sky_fragment",      vd: nil)
        terrainPipeline  = try make(vs: "terrain_vertex",  fs: "terrain_fragment",  vd: mtlVD)
        fallbackPipeline = try make(vs: "fallback_vertex", fs: "fallback_fragment", vd: nil)
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    func draw(in view: MTKView) {
        guard let drawable = view.currentDrawable,
              let rpd = view.currentRenderPassDescriptor,
              let cmd = queue.makeCommandBuffer(),
              let enc = cmd.makeRenderCommandEncoder(descriptor: rpd) else { return }

        let t = Float(CACurrentMediaTime() - startTime)
        uniforms.time = t

        let cam = cameraPath.camera(at: t)
        let view4 = lookAtMatrix(eye: cam.position, target: cam.target,
                                 up: SIMD3(0, 1, 0))
        let proj = perspectiveMatrix(fovy: 1.0,
                                     aspect: Float(view.drawableSize.width / max(view.drawableSize.height, 1)),
                                     near: 0.5, far: 2000)
        uniforms.viewProjection = proj * view4
        uniforms.cameraPosition = cam.position

        enc.setDepthStencilState(depthState)

        // Sky (fullscreen, depth-off effectively — draws at far plane)
        enc.setRenderPipelineState(skyPipeline)
        enc.setVertexBytes(&uniforms, length: MemoryLayout<FrameUniforms>.stride, index: 0)
        enc.setFragmentBytes(&uniforms, length: MemoryLayout<FrameUniforms>.stride, index: 0)
        enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)

        // Terrain (if extracted) or fallback silhouette
        if scene.hasTerrain {
            enc.setRenderPipelineState(terrainPipeline)
            for mesh in scene.terrain {
                var mu = MeshUniforms(model: mesh.model,
                                      normalMatrix: float3x3(mesh.model.columns.0.xyz,
                                                             mesh.model.columns.1.xyz,
                                                             mesh.model.columns.2.xyz),
                                      tint: mesh.tint)
                enc.setVertexBytes(&uniforms, length: MemoryLayout<FrameUniforms>.stride, index: 1)
                enc.setVertexBytes(&mu, length: MemoryLayout<MeshUniforms>.stride, index: 2)
                enc.setFragmentBytes(&uniforms, length: MemoryLayout<FrameUniforms>.stride, index: 0)
                for (i, buf) in mesh.mtkMesh.vertexBuffers.enumerated() {
                    enc.setVertexBuffer(buf.buffer, offset: buf.offset, index: i)
                }
                for sub in mesh.mtkMesh.submeshes {
                    enc.drawIndexedPrimitives(type: sub.primitiveType,
                                              indexCount: sub.indexCount,
                                              indexType: sub.indexType,
                                              indexBuffer: sub.indexBuffer.buffer,
                                              indexBufferOffset: sub.indexBuffer.offset)
                }
            }
        } else {
            enc.setRenderPipelineState(fallbackPipeline)
            enc.setVertexBytes(&uniforms, length: MemoryLayout<FrameUniforms>.stride, index: 0)
            enc.setFragmentBytes(&uniforms, length: MemoryLayout<FrameUniforms>.stride, index: 0)
            enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 24)
        }

        // Water (Gerstner)
        enc.setRenderPipelineState(waterPipeline)
        enc.setVertexBuffer(waterGrid.vertexBuffer, offset: 0, index: 0)
        enc.setVertexBytes(&uniforms, length: MemoryLayout<FrameUniforms>.stride, index: 1)
        enc.setFragmentBytes(&uniforms, length: MemoryLayout<FrameUniforms>.stride, index: 0)
        enc.drawIndexedPrimitives(type: .triangle,
                                  indexCount: waterGrid.indexCount,
                                  indexType: .uint32,
                                  indexBuffer: waterGrid.indexBuffer,
                                  indexBufferOffset: 0)

        enc.endEncoding()
        cmd.present(drawable)
        cmd.commit()
    }
}

struct WaterGrid {
    let vertexBuffer: MTLBuffer
    let indexBuffer: MTLBuffer
    let indexCount: Int
    let vertexDescriptor: MTLVertexDescriptor

    init(device: MTLDevice, extent: Float, divisions: Int) {
        var verts: [SIMD2<Float>] = []
        verts.reserveCapacity((divisions + 1) * (divisions + 1))
        let step = extent / Float(divisions)
        let half = extent * 0.5
        for j in 0...divisions {
            for i in 0...divisions {
                verts.append(SIMD2(Float(i) * step - half,
                                   Float(j) * step - half))
            }
        }
        var indices: [UInt32] = []
        indices.reserveCapacity(divisions * divisions * 6)
        let row = UInt32(divisions + 1)
        for j in 0..<UInt32(divisions) {
            for i in 0..<UInt32(divisions) {
                let a = j * row + i
                let b = a + 1
                let c = a + row
                let d = c + 1
                indices.append(contentsOf: [a, c, b, b, c, d])
            }
        }
        vertexBuffer = device.makeBuffer(bytes: verts,
            length: verts.count * MemoryLayout<SIMD2<Float>>.stride, options: [])!
        indexBuffer = device.makeBuffer(bytes: indices,
            length: indices.count * MemoryLayout<UInt32>.stride, options: [])!
        indexCount = indices.count

        let vd = MTLVertexDescriptor()
        vd.attributes[0].format = .float2
        vd.attributes[0].offset = 0
        vd.attributes[0].bufferIndex = 0
        vd.layouts[0].stride = MemoryLayout<SIMD2<Float>>.stride
        vertexDescriptor = vd
    }
}

extension SIMD4 where Scalar == Float {
    var xyz: SIMD3<Float> { SIMD3(x, y, z) }
}
