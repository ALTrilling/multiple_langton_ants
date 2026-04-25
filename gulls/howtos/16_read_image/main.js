import { default as gulls } from '../../gulls.js'

const W = window.innerWidth, H = window.innerHeight

const render_shader = gulls.constants.vertex + `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

@fragment 
fn fs( @builtin(position) pos : vec4f ) -> @location(0) vec4f {
  let p = pos.xy / vec2f(${W}., ${H}.);

  let fb = textureSample( tex, smp, p );

  return fb; 
}`

const sg = await gulls.init()
const url = 'https://cataas.com/cat'

sg.run( 
  await sg.render({ 
    shader:render_shader, 
    data:[ 
      sg.sampler(), 
      await sg.image( url )  
    ] 
  }) 
)
