#include <metal_stdlib>
using namespace metal;

struct GerstnerWave {
    float2 direction;
    float  amplitude;
    float  wavelength;
    float  speed;
    float  steepness;
};

struct FrameUniforms {
    float4x4 viewProjection;
    float3   cameraPosition;
    float    time;
    float3   sunDirection;
    float    timeOfDay;
    float3   deepColor;
    float3   shallowColor;
    float3   foamColor;
    float3   skyZenith;
    float3   skyHorizon;
    GerstnerWave waves[6];
};

struct MeshUniforms {
    float4x4 model;
    float3x3 normalMatrix;
    float3   tint;
};

// ─── Gerstner water displacement ────────────────────────────────────────────
static float3 gerstnerDisplace(float2 xz, constant FrameUniforms& u, thread float3& normalOut) {
    float3 pos = float3(xz.x, 0.0, xz.y);
    float3 nAcc = float3(0, 1, 0);
    for (int i = 0; i < 6; ++i) {
        GerstnerWave w = u.waves[i];
        float k = 2.0 * M_PI_F / max(w.wavelength, 0.001);
        float c = sqrt(9.81 / k);
        float2 d = normalize(w.direction);
        float f = k * (dot(d, xz) - c * w.speed * u.time);
        float a = w.amplitude;
        float q = w.steepness / (k * a * 6.0);
        pos.x += q * a * d.x * cos(f);
        pos.z += q * a * d.y * cos(f);
        pos.y += a * sin(f);
        float wa = k * a;
        nAcc.x -= d.x * wa * cos(f);
        nAcc.z -= d.y * wa * cos(f);
        nAcc.y -= q * wa * sin(f);
    }
    normalOut = normalize(nAcc);
    return pos;
}

// ─── Sky (fullscreen triangle) ──────────────────────────────────────────────
struct SkyOut {
    float4 position [[position]];
    float2 ndc;
};

vertex SkyOut sky_vertex(uint vid [[vertex_id]],
                         constant FrameUniforms& u [[buffer(0)]]) {
    float2 p = float2((vid == 2) ? 3.0 : -1.0,
                      (vid == 1) ? 3.0 : -1.0);
    SkyOut o;
    o.position = float4(p, 1.0, 1.0);
    o.ndc = p;
    return o;
}

static float3 stars(float2 dir, float time) {
    float2 g = floor(dir * 180.0);
    float n = fract(sin(dot(g, float2(12.9898, 78.233))) * 43758.5453);
    float tw = 0.5 + 0.5 * sin(time * (2.0 + n * 4.0) + n * 31.0);
    float s = smoothstep(0.995, 1.0, n) * tw;
    return float3(s);
}

static float3 cloudBand(float2 uv, float time) {
    float x = uv.x + time * 0.01;
    float y = uv.y * 3.0;
    float v = sin(x * 2.3 + sin(y * 1.7)) * 0.5 + 0.5;
    v *= sin(x * 5.1 + time * 0.03) * 0.5 + 0.5;
    v *= smoothstep(0.05, 0.35, uv.y) * (1.0 - smoothstep(0.6, 0.95, uv.y));
    return float3(v);
}

fragment float4 sky_fragment(SkyOut in [[stage_in]],
                             constant FrameUniforms& u [[buffer(0)]]) {
    float2 uv = in.ndc * 0.5 + 0.5;
    float3 sky = mix(u.skyHorizon, u.skyZenith,
                     smoothstep(0.0, 0.8, uv.y));

    // Sun disk
    float3 dir = normalize(float3(in.ndc.x, max(in.ndc.y, -0.1), -1.0));
    float sunAmt = pow(max(dot(dir, normalize(u.sunDirection)), 0.0), 320.0);
    sky += sunAmt * float3(1.4, 1.15, 0.85);

    // Clouds (fade at night)
    float dayAmt = 1.0 - smoothstep(0.85, 1.0, u.timeOfDay);
    float3 cloud = cloudBand(uv + float2(0, 0), u.time) * dayAmt * 0.55;
    sky += cloud * mix(float3(0.95), float3(1.1, 0.6, 0.4),
                       step(0.8, u.timeOfDay));

    // Stars at night
    float nightAmt = smoothstep(0.85, 1.0, u.timeOfDay);
    sky += stars(in.ndc, u.time) * nightAmt * 1.2;

    return float4(sky, 1.0);
}

// ─── Water ──────────────────────────────────────────────────────────────────
struct WaterIn { float2 xz [[attribute(0)]]; };
struct WaterOut {
    float4 position [[position]];
    float3 worldPos;
    float3 normal;
};

vertex WaterOut water_vertex(WaterIn in [[stage_in]],
                             constant FrameUniforms& u [[buffer(1)]]) {
    float3 n;
    float3 wp = gerstnerDisplace(in.xz, u, n);
    WaterOut o;
    o.position = u.viewProjection * float4(wp, 1.0);
    o.worldPos = wp;
    o.normal = n;
    return o;
}

fragment float4 water_fragment(WaterOut in [[stage_in]],
                               constant FrameUniforms& u [[buffer(0)]]) {
    float3 N = normalize(in.normal);
    float3 V = normalize(u.cameraPosition - in.worldPos);
    float3 L = normalize(u.sunDirection);
    float3 H = normalize(V + L);

    // Fresnel (Schlick)
    float cosTheta = saturate(dot(N, V));
    float F0 = 0.02;
    float fres = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);

    // Reflected sky dir → approximate sky colour
    float3 R = reflect(-V, N);
    float rUp = saturate(R.y * 0.5 + 0.5);
    float3 skyRefl = mix(u.skyHorizon, u.skyZenith, rUp);
    float sunGlint = pow(max(dot(R, L), 0.0), 260.0) * 3.0;
    skyRefl += sunGlint * float3(1.4, 1.15, 0.85);

    // Depth-ish tint from vertical view component
    float depth = saturate(1.0 - abs(V.y));
    float3 waterTint = mix(u.shallowColor, u.deepColor, depth);

    // Subsurface scattering approx: backlit wave crests
    float sss = pow(saturate(dot(-L, V) * 0.5 + 0.5), 3.0);
    waterTint += sss * u.shallowColor * 0.35;

    // Blinn specular
    float spec = pow(max(dot(N, H), 0.0), 180.0);
    float3 sunCol = mix(float3(1.4, 1.15, 0.85), float3(0.1, 0.2, 0.4),
                       smoothstep(0.85, 1.0, u.timeOfDay));

    // Foam on steep wave tops (y-normal deviation)
    float crest = smoothstep(0.82, 0.98, 1.0 - N.y);
    float foam = crest * 0.9;

    float3 col = mix(waterTint, skyRefl, fres) + sunCol * spec;
    col = mix(col, u.foamColor, foam);

    // Gentle exposure
    col = col / (col + 1.0);
    return float4(col, 1.0);
}

// ─── Terrain (textured meshes from extraction) ──────────────────────────────
struct TerrainIn {
    float3 position [[attribute(0)]];
    float3 normal   [[attribute(1)]];
    float2 uv       [[attribute(2)]];
};
struct TerrainOut {
    float4 position [[position]];
    float3 worldPos;
    float3 normal;
    float2 uv;
};

vertex TerrainOut terrain_vertex(TerrainIn in [[stage_in]],
                                 constant FrameUniforms& u [[buffer(1)]],
                                 constant MeshUniforms&  m [[buffer(2)]]) {
    float4 wp = m.model * float4(in.position, 1.0);
    TerrainOut o;
    o.position = u.viewProjection * wp;
    o.worldPos = wp.xyz;
    o.normal = normalize(m.normalMatrix * in.normal);
    o.uv = in.uv;
    return o;
}

fragment float4 terrain_fragment(TerrainOut in [[stage_in]],
                                 constant FrameUniforms& u [[buffer(0)]]) {
    float3 N = normalize(in.normal);
    float3 L = normalize(u.sunDirection);
    float ndl = saturate(dot(N, L));
    float3 ambient = mix(u.skyHorizon, u.skyZenith, 0.5) * 0.35;
    float3 col = float3(0.58, 0.52, 0.38) * (ambient + ndl * 1.1);
    col = col / (col + 1.0);
    return float4(col, 1.0);
}

// ─── Fallback silhouette (when no extracted terrain is present) ─────────────
struct FallbackOut {
    float4 position [[position]];
    float3 color;
};

vertex FallbackOut fallback_vertex(uint vid [[vertex_id]],
                                   constant FrameUniforms& u [[buffer(0)]]) {
    // 8 triangles forming a rough island cone + palm silhouette
    const float3 verts[24] = {
        // cone (island)
        float3(-40, 0, -40), float3( 40, 0, -40), float3(  0, 14,   0),
        float3( 40, 0, -40), float3( 40, 0,  40), float3(  0, 14,   0),
        float3( 40, 0,  40), float3(-40, 0,  40), float3(  0, 14,   0),
        float3(-40, 0,  40), float3(-40, 0, -40), float3(  0, 14,   0),
        // palm trunk
        float3(-1.2, 14,  0), float3( 1.2, 14,  0), float3( 0, 34, 0),
        float3( 1.2, 14,  0), float3( 0, 14,  1.2), float3( 0, 34, 0),
        float3( 0, 14,  1.2), float3(-1.2, 14, 0), float3( 0, 34, 0),
        float3(-1.2, 14, 0), float3( 0, 14, -1.2), float3( 0, 34, 0),
    };
    float3 p = verts[vid];
    FallbackOut o;
    o.position = u.viewProjection * float4(p, 1.0);
    float ndl = saturate(dot(normalize(p + float3(0.01)), normalize(u.sunDirection)));
    o.color = mix(float3(0.30, 0.26, 0.18), float3(0.58, 0.52, 0.36), ndl);
    return o;
}

fragment float4 fallback_fragment(FallbackOut in [[stage_in]]) {
    return float4(in.color, 1.0);
}
