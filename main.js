import { default as gulls } from "./gulls/gulls.js";
import { default as Mouse } from "./gulls/helpers/mouse.js";
import { Pane } from "https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.min.js";

const error_overlay = document.getElementById("error-overlay");
const error_message = document.getElementById("error-message");

function show_error(msg) {
  error_message.textContent = msg;
  error_overlay.classList.add("visible");
}

const info_overlay = document.getElementById("info-overlay");
const info_message = document.getElementById("info-message");

function show_info(msg) {
  info_message.textContent = msg;
  info_overlay.classList.add("visible");
}

function hide_info() {
  info_message.textContent = "";
  info_overlay.classList.remove("visible");
}

const print = console.log;

function sim_behavior(sim) {
  switch (sim) {
    case 1: return `
  switch (u32(pheromone)) {
    case 0u: {
      v_ant.dir += select(-0.25, 0.25, v_ant.flag == 0.0);
      pheremones[p_index] = 1.0;
    }
    default: {
      v_ant.dir += select(0.25, -0.25, v_ant.flag == 0.0);
      pheremones[p_index] = 0.0;
    }
  }`;
    case 2: return `
  switch (u32(pheromone)) {
    case 0u: {
      v_ant.dir += select(-0.25, 0.25, v_ant.flag == 0.0);
      pheremones[p_index] = 1.0;
    }
    case 1u: {
      v_ant.dir += select(0.5, -0.5, v_ant.flag == 0.0);
      pheremones[p_index] = 2.0;
    }
    default: {
      v_ant.dir += select(0.25, -0.25, v_ant.flag == 0.0);
      pheremones[p_index] = 0.0;
    }
  }`;

    default: return `
  switch (u32(pheromone)) {
    case 0u: {
      v_ant.dir += select(-0.25, 0.25, v_ant.flag == 0.0);
      pheremones[p_index] = 1.0;
    }
    case 1u: {
      v_ant.dir += select(0.5, 0.0, v_ant.flag == 0.0);
      pheremones[p_index] = 2.0;
    }
    case 2u: {
      v_ant.dir += select(-0.5, 0.25, v_ant.flag == 0.0);
      pheremones[p_index] = 3.0;
    }
    case 3u: {
      v_ant.dir += select(0.25, -0.5, v_ant.flag == 0.0);
      pheremones[p_index] = 4.0;
    }
    default: {
      v_ant.dir += select(0.0, 0.5, v_ant.flag == 0.0);
      pheremones[p_index] = 0.0;
    }
  }`;
  }
}

async function init_web_gpu() {
  show_info("Press number buttons 1 to 3 to select behaviour");

  const selected_sim = await (() => {
    return new Promise((resolve) => {
      const handler = (e) => {
        const num = Number(e.key);
        if (num >= 1 && num <= 3) {
          resolve(num);
        } else {
          window.addEventListener("keydown", handler, { once: true });
        }
      };
      window.addEventListener("keydown", handler, { once: true });
    });
  })();

  print(selected_sim);
  hide_info();

  const sg = await gulls.init();
  const workgroup_size = 64;
  const num_agents = 256 / 4;
  const dispatch_count = [num_agents / workgroup_size, 1, 1];
  const grid_size = 2;
  const starting_area = 0.3;

  const width = Math.round(window.innerWidth / grid_size);
  const height = Math.round(window.innerHeight / grid_size);

  const render_shader =
    gulls.constants.vertex +
    `
@group(0) @binding(0) var<storage> pheromones: array<f32>;
@group(0) @binding(1) var<storage> render: array<f32>;

@fragment 
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let grid_pos = floor(pos.xy / ${grid_size}.0);

  let pidx = grid_pos.y * ${width}.0 + grid_pos.x;
  let p_sample = pheromones[u32(pidx)];
  let p = select(
    vec3(p_sample),
    select(
      vec3(0.0, 0.5, 0.5),
      select(vec3(0.75, 0.75, 0.75), vec3(0.67, 0.60, 0.70), p_sample > 3.0),
      p_sample > 2.0
    ),
    p_sample > 1.0
  );
  let v = render[u32(pidx)];
  let out = select(p, select(vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), v == 1.0), v != 0.0);

  return vec4f(out, 1.0);
}`;

  const compute_shader = `
struct V_ant {
  pos: vec2f,
  dir: f32,
  flag: f32
}

@group(0) @binding(0) var<storage, read_write> v_ants: array<V_ant>;
@group(0) @binding(1) var<storage, read_write> pheremones: array<f32>;
@group(0) @binding(2) var<storage, read_write> render: array<f32>;

fn pheromone_index(v_ant_pos: vec2f) -> u32 {
  let width = ${width}.0;
  return u32(abs(v_ant_pos.y % ${height}.0) * width + v_ant_pos.x);
}

@compute
@workgroup_size(${workgroup_size}, 1, 1)

fn cs(@builtin(global_invocation_id) cell: vec3u) {
  let pi2 = ${Math.PI * 2};
  var v_ant: V_ant = v_ants[cell.x];

  let p_index = pheromone_index(v_ant.pos);
  let pheromone = pheremones[p_index];

  ${sim_behavior(selected_sim)}

  let dir = vec2f(sin(v_ant.dir * pi2), cos(v_ant.dir * pi2));

  v_ant.pos = round(v_ant.pos + dir);

  v_ants[cell.x] = v_ant;

  render[p_index] = v_ant.flag + 1.0;
}`;

  const num_properties = 4;
  const pheromones = new Float32Array(width * height);
  const v_ants_render = new Float32Array(width * height);
  const v_ants = new Float32Array(num_agents * num_properties);

  const offset = 0.5 - starting_area / 2.0;
  for (let i = 0; i < num_agents * num_properties; i += num_properties) {
    v_ants[i + 0]     = Math.floor((offset + Math.random() * starting_area) * width);
    v_ants[i + 1] = Math.floor((offset + Math.random() * starting_area) * height);
    v_ants[i + 2] = 0;
    v_ants[i + 3] = Math.round(Math.random());
  }

  const pheromones_b = sg.buffer(pheromones);
  const v_ants_b = sg.buffer(v_ants);
  const render_b = sg.buffer(v_ants_render);

  const render = await sg.render({
    shader: render_shader,
    data: [pheromones_b, render_b],
  });

  const compute = sg.compute({
    shader: compute_shader,
    data: [v_ants_b, pheromones_b, render_b],
    onframe() {
      render_b.clear();
    },
    dispatchCount: dispatch_count,
    times: 25,
  });

  sg.run(compute, render);
}

init_web_gpu().catch((err) => {
  show_error(String(err));
  console.error(err);
});
