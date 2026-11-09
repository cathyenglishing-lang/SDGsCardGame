"""Renders the poker-chip pictures of the Pecha Kucha Card Game with Blender (4.5 LTS).

    blender --background --python scripts/blender/render_chips.py -- frontend/assets/chips

Output (transparent PNG, the soft shadow on the table included):
    stack-1.png, stack-3.png, stack-5.png, stack-8.png, stack-12.png   a pile of n gold chips,
                                                                      all framed alike so the piles share one baseline
    chip.png                                                           one chip seen from above (icon)
The game picks the pile from the student's chip balance (frontend/pages/pecha_kucha_builder.html, pkChipTier).
Everything is built here from scratch (no .blend file), so the pictures can be made again or restyled
by editing the colours below.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

OUT = os.path.abspath(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else os.path.abspath("frontend/assets/chips")
STACKS = (1, 3, 5, 8, 12)
RADIUS, THICK, GAP = 1.0, 0.17, 0.004
GOLD, GOLD_DARK, IVORY = (0.72, 0.36, 0.02, 1), (0.50, 0.23, 0.012, 1), (0.93, 0.88, 0.76, 1)   # linear RGB
INSERTS = 8          # ivory inserts round the edge
random.seed(7)       # the same piles every time


def material(name, rgba, rough=0.42, metal=0.0, coat=0.25):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rgba
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = coat
    return m


def chip_mesh(mats):
    """One chip: edge and outer face band striped gold / ivory, a thin ivory ring, a darker gold centre."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=96, radius1=RADIUS, radius2=RADIUS, depth=THICK)
    for cap in [f for f in bm.faces if len(f.verts) > 4]:
        bmesh.ops.inset_region(bm, faces=[cap], thickness=RADIUS * 0.24, depth=0)      # outer band, striped like the edge
        bmesh.ops.inset_region(bm, faces=[cap], thickness=RADIUS * 0.06, depth=0)      # thin ivory ring
        bmesh.ops.inset_region(bm, faces=[cap], thickness=RADIUS * 0.02, depth=-0.012)  # centre sits a hair lower
    for f in bm.faces:
        c = f.calc_center_median()
        r = math.hypot(c.x, c.y)
        side = abs(f.normal.z) < 0.5 and r > RADIUS * 0.95
        if side or r > RADIUS * 0.80:
            sector = (math.atan2(c.y, c.x) % (2 * math.pi)) / (2 * math.pi) * INSERTS
            f.material_index = 1 if (sector % 1.0) < 0.34 else 0
        elif r > RADIUS * 0.715:
            f.material_index = 1
        else:
            f.material_index = 2
        f.smooth = True
    mesh = bpy.data.meshes.new("chip")
    bm.to_mesh(mesh)
    bm.free()
    for m in mats:
        mesh.materials.append(m)
    if hasattr(mesh, "set_sharp_from_angle"):
        mesh.set_sharp_from_angle(angle=math.radians(40))
    return mesh


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.compression = 90
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.5, 0.5, 0.62, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.3
    scene.world = world
    return scene


def add_light(scene, name, location, energy, size, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.size, data.color = energy, size, color
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, 0.6)) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(obj)


def add_camera(scene, location, target, ortho_scale):
    data = bpy.data.cameras.new("camera")
    data.type = "ORTHO"
    data.ortho_scale = ortho_scale
    cam = bpy.data.objects.new("camera", data)
    cam.location = location
    cam.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam


def add_table(scene):
    """An invisible table that only catches the shadow, so the pile sits on whatever is behind the picture."""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=12)
    mesh = bpy.data.meshes.new("table")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("table", mesh)
    obj.is_shadow_catcher = True
    scene.collection.objects.link(obj)


def build_stack(scene, mesh, count):
    for i in range(count):
        obj = bpy.data.objects.new(f"chip{i}", mesh)
        jitter = 0.0 if i == 0 else 0.045
        obj.location = (random.uniform(-jitter, jitter), random.uniform(-jitter, jitter), THICK / 2 + i * (THICK + GAP))
        obj.rotation_euler = (0, 0, random.uniform(0, 2 * math.pi))
        bevel = obj.modifiers.new("bevel", "BEVEL")
        bevel.width, bevel.segments, bevel.limit_method, bevel.angle_limit = 0.022, 3, "ANGLE", math.radians(50)
        scene.collection.objects.link(obj)


def render(scene, name, width, height):
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = width, height, 100
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print("rendered", scene.render.filepath)


def main():
    os.makedirs(OUT, exist_ok=True)
    tallest = max(STACKS) * (THICK + GAP)
    for count in STACKS:
        scene = reset_scene()
        mats = [material("gold", GOLD, 0.36, 0.2), material("ivory", IVORY, 0.5), material("centre", GOLD_DARK, 0.42, 0.2)]
        build_stack(scene, chip_mesh(mats), count)
        add_table(scene)
        add_light(scene, "key", (-3.2, -3.6, 6.5), 260, 4.0, (1.0, 0.96, 0.9))
        add_light(scene, "fill", (4.5, -2.0, 3.0), 70, 5.0, (0.8, 0.85, 1.0))
        add_light(scene, "rim", (1.5, 4.5, 3.5), 110, 3.0, (1.0, 0.9, 0.75))
        # Same camera for every pile: framed for the tallest one, looking down at about 32 degrees.
        add_camera(scene, (0, -7.5, 4.7 + tallest / 2), (0, 0, tallest / 2 - 0.05), 3.35)
        render(scene, f"stack-{count}.png", 360, 440)
    scene = reset_scene()
    mats = [material("gold", GOLD, 0.36, 0.2), material("ivory", IVORY, 0.5), material("centre", GOLD_DARK, 0.42, 0.2)]
    build_stack(scene, chip_mesh(mats), 1)
    add_table(scene)
    add_light(scene, "key", (-2.5, -2.5, 6.0), 190, 4.0, (1.0, 0.96, 0.9))
    add_light(scene, "fill", (3.5, 2.0, 5.0), 80, 5.0, (0.8, 0.85, 1.0))
    add_camera(scene, (0, -0.001, 6), (0, 0, 0), 2.35)
    render(scene, "chip.png", 192, 192)


main()
