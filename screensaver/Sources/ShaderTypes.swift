import simd

struct GerstnerWave {
    var direction: SIMD2<Float>
    var amplitude: Float
    var wavelength: Float
    var speed: Float
    var steepness: Float
}

struct FrameUniforms {
    var viewProjection: float4x4
    var cameraPosition: SIMD3<Float>
    var time: Float
    var sunDirection: SIMD3<Float>
    var timeOfDay: Float          // 0 = dawn, 0.5 = noon, 1 = night
    var deepColor: SIMD3<Float>
    var shallowColor: SIMD3<Float>
    var foamColor: SIMD3<Float>
    var skyZenith: SIMD3<Float>
    var skyHorizon: SIMD3<Float>
    var waves: (GerstnerWave, GerstnerWave, GerstnerWave, GerstnerWave,
                GerstnerWave, GerstnerWave)
}

struct MeshUniforms {
    var model: float4x4
    var normalMatrix: float3x3
    var tint: SIMD3<Float>
}
