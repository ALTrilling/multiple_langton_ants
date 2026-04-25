@group(0) @binding(0) var<uniform> res:   vec2f;
@group(0) @binding(1) var<storage> state: array<f32>;

@fragment 
fn fs( @builtin(position) pos : vec4f ) -> @location(0) vec4f {
  let idx = u32(pos.y) * u32(res.x) + u32(pos.x);
  let v = state[ idx ];
  return vec4f( v,v,v, 1.);
}
