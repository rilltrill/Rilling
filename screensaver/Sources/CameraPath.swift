import simd

struct CameraPath {
    private let waypoints: [SIMD3<Float>] = [
        SIMD3( 60, 18,  90),
        SIMD3(  0, 14, 120),
        SIMD3(-70, 16,  85),
        SIMD3(-95, 22,  10),
        SIMD3(-50, 28, -60),
        SIMD3( 30, 24, -70),
        SIMD3( 90, 20,   0),
    ]
    private let lookAt = SIMD3<Float>(0, 6, 0)
    private let period: Float = 180.0

    func camera(at time: Float) -> (position: SIMD3<Float>, target: SIMD3<Float>) {
        let n = waypoints.count
        let t = (time.truncatingRemainder(dividingBy: period) / period) * Float(n)
        let i = Int(t) % n
        let f = t - Float(Int(t))

        let p0 = waypoints[(i - 1 + n) % n]
        let p1 = waypoints[i]
        let p2 = waypoints[(i + 1) % n]
        let p3 = waypoints[(i + 2) % n]
        let pos = catmullRom(p0, p1, p2, p3, f)

        let bob = SIMD3<Float>(0, sin(time * 0.15) * 0.6, 0)
        let target = lookAt + SIMD3<Float>(sin(time * 0.05) * 6,
                                           cos(time * 0.07) * 2,
                                           cos(time * 0.05) * 6)
        return (pos + bob, target)
    }

    private func catmullRom(_ p0: SIMD3<Float>, _ p1: SIMD3<Float>,
                            _ p2: SIMD3<Float>, _ p3: SIMD3<Float>,
                            _ t: Float) -> SIMD3<Float> {
        let t2 = t * t
        let t3 = t2 * t
        return 0.5 * ((2 * p1)
                   + (-p0 + p2) * t
                   + (2*p0 - 5*p1 + 4*p2 - p3) * t2
                   + (-p0 + 3*p1 - 3*p2 + p3) * t3)
    }
}
