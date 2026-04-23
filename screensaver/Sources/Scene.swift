import Metal
import MetalKit
import ModelIO
import simd

struct Mesh {
    let mtkMesh: MTKMesh
    let tint: SIMD3<Float>
    let model: float4x4
}

final class Scene {
    private(set) var terrain: [Mesh] = []
    private(set) var hasTerrain = false

    private var assetDir: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory,
                                 in: .userDomainMask)
            .first?.appendingPathComponent("BesaidScreensaver")
    }

    func load(device: MTLDevice, vertexDescriptor: MDLVertexDescriptor) {
        guard let dir = assetDir else { return }
        let candidates = ["besaid.usdz", "besaid.usdc", "besaid.obj"]
        for name in candidates {
            let url = dir.appendingPathComponent(name)
            guard FileManager.default.fileExists(atPath: url.path) else { continue }
            let bufferAllocator = MTKMeshBufferAllocator(device: device)
            let asset = MDLAsset(url: url,
                                 vertexDescriptor: vertexDescriptor,
                                 bufferAllocator: bufferAllocator)
            asset.loadTextures()
            for i in 0..<asset.count {
                guard let mdl = asset.object(at: i) as? MDLMesh else { continue }
                do {
                    let m = try MTKMesh(mesh: mdl, device: device)
                    terrain.append(Mesh(mtkMesh: m,
                                        tint: SIMD3(0.72, 0.68, 0.55),
                                        model: matrix_identity_float4x4))
                    hasTerrain = true
                } catch {
                    NSLog("BesaidScreensaver: mesh load failed: \(error)")
                }
            }
            if hasTerrain { return }
        }
    }
}

func perspectiveMatrix(fovy: Float, aspect: Float, near: Float, far: Float) -> float4x4 {
    let y = 1 / tan(fovy * 0.5)
    let x = y / aspect
    let z = far / (near - far)
    return float4x4(columns: (
        SIMD4( x,  0,  0,  0),
        SIMD4( 0,  y,  0,  0),
        SIMD4( 0,  0,  z, -1),
        SIMD4( 0,  0,  z * near, 0)
    ))
}

func lookAtMatrix(eye: SIMD3<Float>, target: SIMD3<Float>, up: SIMD3<Float>) -> float4x4 {
    let z = normalize(eye - target)
    let x = normalize(cross(up, z))
    let y = cross(z, x)
    let t = SIMD3<Float>(-dot(x, eye), -dot(y, eye), -dot(z, eye))
    return float4x4(columns: (
        SIMD4(x.x, y.x, z.x, 0),
        SIMD4(x.y, y.y, z.y, 0),
        SIMD4(x.z, y.z, z.z, 0),
        SIMD4(t.x, t.y, t.z, 1)
    ))
}
