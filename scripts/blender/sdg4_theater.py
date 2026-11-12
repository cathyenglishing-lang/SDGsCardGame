"""Builds the Waterfront Theater's film set for the SDG 4 stage in Blender, and renders its poster.

    blender -b -P scripts/blender/sdg4_theater.py -- <out.glb> <poster.jpg> <still.png> [samples]

What it makes (Blender 4.2+, tested on 4.5):
  1. theater.glb   the pieces the game adds around the stage that js/world/harbor.js already has: a proscenium
                   (two towers and a header), velvet curtains tied back at both sides, a lattice truss with seven
                   PAR lamps, line-array speakers, floor monitors, side steps and a stage skirt. Ambient occlusion
                   is baked into the vertex colours, so the set has contact shadows without a single shadow map.
  2. poster.jpg    a Cycles render of the whole theater with light beams in haze: the loading screen's backdrop.
  3. still.png     the same frame as a PNG for the documentation.

Coordinates: the game's theater sits at x 18..36, z 2..8, stage top y 0.9 (see harbor.js). Everything below is
written in those game coordinates and converted by P(); the GLB's origin is the game point (27, 0, 5), so the game
places it with position.set(27, 0, 5) and nothing else.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_GLB, OUT_POSTER, OUT_STILL = (argv + [None, None, None])[:3]
SAMPLES = int(argv[3]) if len(argv) > 3 else 96
STAGE_Y = 0.9


def P(x, y, z):
    """Game coordinates (y up, origin 27, 0, 5) → Blender coordinates (z up). glTF export turns them back."""
    return Vector((x - 27.0, -(z - 5.0), y))


# ── a clean scene ──
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
SET = bpy.data.collections.new("set"); scene.collection.children.link(SET)        # what is exported
DRESS = bpy.data.collections.new("dressing"); scene.collection.children.link(DRESS)  # only for the bake and the poster


def material(name, color, rough=0.6, metal=0.0, emit=None, strength=0.0, two_sided=False):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1); b.inputs["Emission Strength"].default_value = strength
    m.use_backface_culling = not two_sided
    return m


M = {
    "frame": material("frame", (0.035, 0.04, 0.05), 0.55, 0.3),
    "frame_trim": material("frame_trim", (0.55, 0.42, 0.2), 0.35, 0.9),
    "velvet": material("velvet", (0.36, 0.03, 0.05), 0.92, 0.0, two_sided=True),
    "rope": material("rope", (0.75, 0.58, 0.22), 0.4, 0.8),
    "truss": material("truss", (0.62, 0.65, 0.68), 0.32, 0.95),
    "can": material("can", (0.02, 0.02, 0.025), 0.45, 0.6),
    "lens": material("lens", (1.0, 0.86, 0.62), 0.2, 0.0, emit=(1.0, 0.82, 0.55), strength=6.0),
    "speaker": material("speaker", (0.02, 0.022, 0.026), 0.7, 0.1),
    "grille": material("grille", (0.07, 0.075, 0.085), 0.5, 0.7),
    "wood": material("wood", (0.16, 0.09, 0.05), 0.5, 0.0),
    "skirt": material("skirt", (0.015, 0.016, 0.02), 0.9, 0.0),
}


def finish(obj, mat, coll=SET, bevel=0.0, smooth=False):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("bevel", "BEVEL"); mod.width = bevel; mod.segments = 2; mod.limit_method = "ANGLE"
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def box(name, center, size, mat, coll=SET, bevel=0.03, rot=(0, 0, 0)):
    """center and size (width x, height y, depth z) in game coordinates; rot in Blender Euler."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=P(*center), rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, mat, coll, bevel)


def tube(name, a, b, r, mat, coll=SET, verts=10):
    pa, pb = P(*a), P(*b); d = pb - pa
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(pa + pb) / 2)
    o = bpy.context.object; o.name = name
    o.rotation_mode = "QUATERNION"; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return finish(o, mat, coll, smooth=True)


def curtain(name, x_in, x_out, y0, y1, z, mat, folds=7, tie=0.42):
    """A drape hanging from y1 to y0 between x_in (towards the stage) and x_out (the tower), gathered by a tie-back
    at `tie` of its height: folds deepen where the cloth is pulled together."""
    cols, rows = 56, 30
    bm = bmesh.new(); grid = []
    for r in range(rows + 1):
        v = r / rows                                           # 0 floor … 1 rail
        pull = 0.58 * math.exp(-((v - tie) / 0.2) ** 2) + 0.12 * (1 - v)     # how far the inner edge is drawn outwards
        row = []
        for c in range(cols + 1):
            u = c / cols                                       # 0 outer edge … 1 inner edge
            x = x_out + (x_in - x_out) * u * (1 - pull)
            depth = (0.16 + 0.22 * pull) * math.sin(u * folds * 2 * math.pi + v * 1.3) * (0.35 + 0.65 * u)
            sag = 0.05 * math.sin(v * math.pi) * u
            row.append(bm.verts.new(P(x, y0 + (y1 - y0) * v - sag, z + depth)))
        grid.append(row)
    for r in range(rows):
        for c in range(cols):
            bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    return finish(o, mat, SET, smooth=True)


# ── proscenium: two towers, a header, a gold trim line ──
for side, x in (("L", 17.0), ("R", 37.0)):
    box(f"tower_{side}", (x, 6.1, 1.9), (1.6, 11.0, 1.5), M["frame"], bevel=0.08)
    box(f"tower_base_{side}", (x, 0.95, 1.95), (1.9, 0.7, 1.8), M["frame"], bevel=0.06)
    box(f"tower_cap_{side}", (x, 11.75, 1.9), (1.9, 0.3, 1.8), M["frame_trim"], bevel=0.05)
    box(f"tower_line_{side}", (x + (0.83 if side == "L" else -0.83), 6.1, 2.6), (0.06, 10.2, 0.06), M["frame_trim"], bevel=0.0)
box("header", (27, 11.15, 1.6), (21.6, 0.9, 0.9), M["frame"], bevel=0.08)
box("header_trim", (27, 10.66, 2.03), (21.0, 0.06, 0.06), M["frame_trim"], bevel=0.0)

# ── curtains, tied back, and a short pelmet over each ──
for side, x_out, x_in in (("L", 17.75, 20.45), ("R", 36.25, 33.55)):
    curtain(f"curtain_{side}", x_in, x_out, STAGE_Y, 10.25, 2.72, M["velvet"])
    cx = (x_out + x_in) / 2
    box(f"pelmet_{side}", (cx, 10.35, 2.72), (abs(x_in - x_out) + 0.3, 0.42, 0.5), M["velvet"], bevel=0.12)
    tx = x_out + (0.55 if side == "L" else -0.55)
    tube(f"tie_{side}", (tx - 0.42, 4.75, 2.95), (tx + 0.42, 4.75, 2.95), 0.05, M["rope"])
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.11, location=P(tx, 4.5, 3.0)); finish(bpy.context.object, M["rope"], smooth=True)

# ── the lattice truss (the game's plain beam sits inside it) with seven PAR lamps ──
X0, X1, TY, TZ, H = 19.6, 34.4, 10.0, 2.0, 0.42
chords = [(dy, dz) for dy in (-H / 2, H / 2) for dz in (-H / 2, H / 2)]
for i, (dy, dz) in enumerate(chords):
    tube(f"chord_{i}", (X0, TY + dy, TZ + dz), (X1, TY + dy, TZ + dz), 0.035, M["truss"], verts=8)
n = 20
for k in range(n):
    xa, xb = X0 + (X1 - X0) * k / n, X0 + (X1 - X0) * (k + 1) / n
    up = k % 2 == 0
    tube(f"web_f_{k}", (xa, TY + (-H / 2 if up else H / 2), TZ + H / 2), (xb, TY + (H / 2 if up else -H / 2), TZ + H / 2), 0.018, M["truss"], verts=6)
    tube(f"web_t_{k}", (xa, TY + H / 2, TZ + (-H / 2 if up else H / 2)), (xb, TY + H / 2, TZ + (H / 2 if up else -H / 2)), 0.018, M["truss"], verts=6)
    if k % 4 == 0:
        for dy in (-H / 2, H / 2):
            tube(f"post_{k}_{dy}", (xa, TY + dy, TZ - H / 2), (xa, TY + dy, TZ + H / 2), 0.018, M["truss"], verts=6)
LAMPS = [(20.6, 21.0), (22.0, 21.5), (24.4, 25.2), (27.0, 27.0), (29.6, 28.8), (32.0, 32.5), (33.4, 33.0)]   # lamp x, where it points on the stage
for i, (lx, tx) in enumerate(LAMPS):
    top = Vector((lx, TY - H / 2, TZ + H / 2 + 0.05)); body = Vector((lx, TY - 0.72, TZ + 0.55))
    aim = (Vector((tx, STAGE_Y, 5.5)) - body).normalized()
    tube(f"yoke_{i}", tuple(top), tuple(body + Vector((0, 0.2, 0))), 0.025, M["can"], verts=6)
    back, front = body - aim * 0.26, body + aim * 0.3
    tube(f"can_{i}", tuple(back), tuple(front), 0.19, M["can"], verts=16)
    tube(f"lens_{i}", tuple(front), tuple(front + aim * 0.02), 0.165, M["lens"], verts=16)
    tube(f"hood_{i}", tuple(front + aim * 0.02), tuple(front + aim * 0.14), 0.2, M["can"], verts=16)

# ── sound: line arrays on the ground beside the stage, wedges on the stage ──
for side, x in (("L", 16.9), ("R", 37.1)):
    for j in range(4):
        box(f"array_{side}_{j}", (x, 0.6 + 0.36 + j * 0.66, 6.7), (0.95, 0.62, 0.8), M["speaker"], bevel=0.04, rot=(math.radians(4 - j * 3), 0, 0))
        box(f"array_grille_{side}_{j}", (x, 0.6 + 0.36 + j * 0.66, 7.11), (0.82, 0.5, 0.03), M["grille"], bevel=0.0, rot=(math.radians(4 - j * 3), 0, 0))
for i, x in enumerate((24.2, 29.8)):
    box(f"wedge_{i}", (x, STAGE_Y + 0.17, 7.25), (0.7, 0.34, 0.5), M["speaker"], bevel=0.05, rot=(math.radians(-28), 0, 0))
    box(f"wedge_grille_{i}", (x, STAGE_Y + 0.25, 7.03), (0.6, 0.26, 0.03), M["grille"], bevel=0.0, rot=(math.radians(-28), 0, 0))

# ── steps at both ends of the stage and a skirt under its front edge ──
for side, x, s in (("L", 17.55, -1), ("R", 36.45, 1)):
    for j in range(3):
        box(f"step_{side}_{j}", (x + s * j * 0.32 - s * 0.32, 0.6 + 0.05 + (2 - j) * 0.1, 5.0), (0.34, 0.1 + (2 - j) * 0.2 - 0.1 + 0.1, 1.8), M["wood"], bevel=0.02)
box("skirt", (27, 0.74, 8.06), (18.6, 0.3, 0.05), M["skirt"], bevel=0.0)

# ── stand-ins for what the game already has (they throw occlusion in the bake and appear in the poster) ──
D = {
    "floor": material("d_floor", (0.2, 0.2, 0.21), 0.85), "stagewood": material("d_stage", (0.2, 0.12, 0.07), 0.45),
    "screen": material("d_screen", (0.02, 0.05, 0.09), 0.3, emit=(0.02, 0.07, 0.14), strength=1.0), "tier": material("d_tier", (0.3, 0.3, 0.31), 0.9),
    "crowd": material("d_crowd", (0.03, 0.035, 0.045), 0.9), "speakerfig": material("d_speaker", (0.5, 0.36, 0.28), 0.7),
    "title": material("d_title", (1, 1, 1), 0.4, emit=(1.0, 0.95, 0.85), strength=7.0), "accent": material("d_accent", (1, 0.4, 0.1), 0.4, emit=(1.0, 0.41, 0.14), strength=8.0),
}
box("ground", (27, 0.3, 14), (90, 0.6, 70), D["floor"], DRESS, bevel=0)
box("stage", (27, 0.75, 5), (18, 0.3, 6), D["stagewood"], DRESS, bevel=0.02)
box("screen_back", (27, 5.4, 1.95), (12.6, 7.3, 0.4), M["frame"], DRESS, bevel=0.03)
box("screen", (27, 5.4, 2.17), (12.0, 6.75, 0.02), D["screen"], DRESS, bevel=0)
for i in range(4):
    box(f"tier_{i}", (27, 0.6 + 0.25 * (i + 1), 9.4 + i * 1.8), (24, 0.5 * (i + 1), 1.8), D["tier"], DRESS, bevel=0.02)


def bake_ao():
    """Join the set into one mesh and bake ambient occlusion into its vertex colours."""
    bpy.ops.object.select_all(action="DESELECT")
    objs = list(SET.objects)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target="MESH")                     # applies the bevels
    bpy.ops.object.join()
    theater = bpy.context.object; theater.name = "theater"
    theater.data.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    theater.data.attributes.active_color = theater.data.color_attributes["Col"]
    theater.data.color_attributes.render_color_index = 0
    scene.cycles.samples = 48
    try:
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
        # AO alone is too strong on a set that the game also lights: lift it so the darkest corner keeps 45 %.
        col = theater.data.color_attributes["Col"]
        for d in col.data:
            v = 0.45 + 0.55 * d.color[0]
            d.color = (v, v, v, 1.0)
        print("[theater] AO baked into vertex colours")
    except Exception as err:                                  # the set still exports, only without baked shadows
        print("[theater] AO bake failed:", err)
    return theater


theater = bake_ao()

if OUT_GLB:
    os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT"); theater.select_set(True); bpy.context.view_layer.objects.active = theater
    kw = dict(filepath=OUT_GLB, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    for extra in (dict(export_vertex_color="ACTIVE", export_all_vertex_colors=False), dict(export_vertex_color="ACTIVE"), dict(export_colors=True), dict()):
        try:
            bpy.ops.export_scene.gltf(**kw, **extra)
            print("[theater] exported", OUT_GLB, os.path.getsize(OUT_GLB), "bytes", extra)
            break
        except TypeError as err:
            print("[theater] export options not accepted:", extra, err)
    print("[theater] triangles:", sum(len(p.vertices) - 2 for p in theater.data.polygons))

# ── the poster: the theater at blue hour, a speaker in the key light, beams in haze ──
if OUT_POSTER or OUT_STILL:
    # the set's vertex-colour AO multiplies its colours in the render too
    for m in theater.data.materials:
        nt = m.node_tree; b = nt.nodes["Principled BSDF"]
        ca = nt.nodes.new("ShaderNodeVertexColor"); ca.layer_name = "Col"
        mix = nt.nodes.new("ShaderNodeMixRGB"); mix.blend_type = "MULTIPLY"; mix.inputs[0].default_value = 1.0
        mix.inputs[1].default_value = b.inputs["Base Color"].default_value
        nt.links.new(ca.outputs["Color"], mix.inputs[2]); nt.links.new(mix.outputs[0], b.inputs["Base Color"])
    # the talk's title on the screen
    def text(body, center, size, mat, weight=0.0):
        bpy.ops.object.text_add(location=P(*center), rotation=(math.radians(90), 0, 0))
        t = bpy.context.object; t.data.body = body; t.data.size = size; t.data.align_x = "CENTER"; t.data.align_y = "CENTER"; t.data.offset = weight
        return finish(t, mat, DRESS)
    text("PECHA KUCHA", (27, 7.5, 2.2), 0.5, D["accent"], 0.004)
    text("Quality Education", (27, 5.95, 2.2), 1.15, D["title"], 0.01)
    text("in Taiwan", (27, 4.6, 2.2), 1.15, D["title"], 0.01)
    text("20 slides  ·  20 seconds each  ·  SDG 4", (27, 3.2, 2.2), 0.42, D["title"])
    # the speaker and a full house, as simple figures
    def figure(name, x, y, z, h, mat):
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.2 * h / 1.7, depth=h * 0.62, location=P(x, y + h * 0.36, z)); finish(bpy.context.object, mat, DRESS, smooth=True)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=8, radius=0.13 * h / 1.7, location=P(x, y + h * 0.8, z)); finish(bpy.context.object, mat, DRESS, smooth=True)
    figure("speaker", 27, STAGE_Y, 5.5, 1.75, D["speakerfig"])
    import random
    random.seed(4)
    for r in range(4):
        x = 16.3
        while x < 37.8:
            if random.random() > 0.12:
                figure(f"aud_{r}_{x:.1f}", x + random.uniform(-0.12, 0.12), 0.6 + 0.5 * (r + 1), 9.75 + r * 1.8, random.uniform(0.95, 1.12), D["crowd"])
            x += 0.95
    # lights: warm key, cool fill, rim, two washes; the PAR lenses glow on their own
    def spot(name, pos, at, watts, color, angle, blend=0.5, size=0.25):
        ld = bpy.data.lights.new(name, "SPOT"); ld.energy = watts; ld.color = color; ld.spot_size = angle; ld.spot_blend = blend; ld.shadow_soft_size = size
        o = bpy.data.objects.new(name, ld); DRESS.objects.link(o); o.location = P(*pos)
        o.rotation_mode = "QUATERNION"; o.rotation_quaternion = (P(*at) - P(*pos)).to_track_quat("-Z", "Y")
        return o
    spot("key", (21.2, 9.4, 11.5), (27, 1.9, 5.4), 5200, (1.0, 0.84, 0.64), math.radians(26))
    spot("rim", (29.8, 9.6, 2.6), (27, 2.2, 5.6), 4200, (1.0, 0.9, 0.74), math.radians(34))
    spot("fill", (33.8, 6.2, 11.2), (27, 1.8, 5.4), 900, (0.62, 0.77, 1.0), math.radians(40))
    for i, (lx, tx) in enumerate(LAMPS):
        c = (1.0, 0.72, 0.4) if i % 2 == 0 else (0.5, 0.72, 1.0)
        spot(f"par_{i}", (lx, TY - 0.72, TZ + 0.9), (tx, STAGE_Y, 5.6), 2600 if i == 3 else 1700, c, math.radians(24 if i == 3 else 20), 0.6, 0.12)
    for x, tx in ((15.5, 19.0), (38.5, 35.0)):                  # the velvet needs its own light to read as red
        spot(f"drape_{x}", (x, 3.2, 10.5), (tx, 5.2, 2.7), 2600, (1.0, 0.78, 0.62), math.radians(38), 0.8, 0.4)
    # the sky at blue hour, and haze so the beams show
    world = bpy.data.worlds.new("dusk"); scene.world = world; world.use_nodes = True
    bg = world.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.012, 0.022, 0.05, 1); bg.inputs[1].default_value = 0.6
    bpy.ops.mesh.primitive_cube_add(size=1, location=P(27, 6.5, 9)); haze = bpy.context.object; haze.scale = (34, 26, 13); haze.name = "haze"
    hm = bpy.data.materials.new("haze"); hm.use_nodes = True; nt = hm.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); vol = nt.nodes.new("ShaderNodeVolumePrincipled"); vol.inputs["Density"].default_value = 0.05; vol.inputs["Anisotropy"].default_value = 0.55
    nt.links.new(vol.outputs["Volume"], out.inputs["Volume"]); finish(haze, hm, DRESS)
    # the camera: from the back row, slightly off the aisle, focused on the speaker
    cam_data = bpy.data.cameras.new("cam"); cam_data.lens = 30; cam_data.dof.use_dof = True; cam_data.dof.aperture_fstop = 2.2
    cam = bpy.data.objects.new("cam", cam_data); DRESS.objects.link(cam); scene.camera = cam
    cam.location = P(24.4, 5.6, 21.5); target = P(27.4, 4.3, 4.0)
    cam.rotation_mode = "QUATERNION"; cam.rotation_quaternion = (target - cam.location).to_track_quat("-Z", "Y")
    cam_data.dof.focus_distance = (P(27, 2.4, 5.5) - cam.location).length
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1280, 720, 100
    scene.cycles.samples = SAMPLES; scene.cycles.use_denoising = True; scene.cycles.volume_step_rate = 2.0; scene.cycles.volume_bounces = 0
    scene.cycles.max_bounces = 4; scene.cycles.use_adaptive_sampling = True
    scene.view_settings.view_transform = "Filmic" if "Filmic" in [v.name for v in type(scene.view_settings).bl_rna.properties["view_transform"].enum_items] else scene.view_settings.view_transform
    try:
        scene.view_settings.look = "Medium High Contrast"
    except TypeError:
        pass
    scene.view_settings.exposure = 0.75
    bpy.ops.render.render()
    img = bpy.data.images["Render Result"]
    if OUT_STILL:
        os.makedirs(os.path.dirname(OUT_STILL), exist_ok=True)
        scene.render.image_settings.file_format = "PNG"; img.save_render(OUT_STILL); print("[theater] still", OUT_STILL)
    if OUT_POSTER:
        os.makedirs(os.path.dirname(OUT_POSTER), exist_ok=True)
        scene.render.image_settings.file_format = "JPEG"; scene.render.image_settings.quality = 84; img.save_render(OUT_POSTER); print("[theater] poster", OUT_POSTER, os.path.getsize(OUT_POSTER), "bytes")
