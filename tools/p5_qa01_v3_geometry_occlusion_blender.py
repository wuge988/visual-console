from __future__ import annotations

import argparse
import hashlib
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--base-scene", required=True)
    p.add_argument("--source-sc01", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--blend-output", required=True)
    return p.parse_args(argv)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        pass


def image_subject_bbox(sc01_image: bpy.types.Image) -> tuple[int, int, int, int]:
    w, h = sc01_image.size
    pixels = list(sc01_image.pixels)
    min_x, min_y = w, h
    max_x = max_y = -1
    for y in range(h):
        row = y * w * 4
        for x in range(w):
            a = pixels[row + x * 4 + 3]
            if a > 0.05:
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
    if max_x < min_x or max_y < min_y:
        raise RuntimeError("V3_SC01_ALPHA_EMPTY")
    return min_x, min_y, max_x + 1, max_y + 1


def world_from_pixel(px: float, py_top: float, w: int, h: int, world_w: float, world_h: float) -> tuple[float, float]:
    x = (px / w - 0.5) * world_w
    y = (0.5 - py_top / h) * world_h
    return x, y


def configure_render_engine(scene: bpy.types.Scene) -> str:
    """Select Eevee by capability rather than Blender major-version folklore.

    Blender 4.x exposed the transitional identifier BLENDER_EEVEE_NEXT, while
    Blender 5.2 LTS exposes BLENDER_EEVEE again. Probe the identifiers directly
    so the proof remains compatible without guessing from bpy.app.version.
    """
    failures: list[str] = []
    for candidate in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = candidate
            return candidate
        except (TypeError, ValueError) as exc:
            failures.append(f"{candidate}={exc}")
    raise RuntimeError("V3_EEVEE_ENGINE_UNAVAILABLE:" + " | ".join(failures))


def configure_color_management(scene: bpy.types.Scene) -> None:
    # AgX is the Blender 5.x photoreal default. Set only the transform and leave
    # the installation's valid look enum untouched to avoid version-specific
    # look identifiers becoming another physical-gate failure.
    try:
        scene.view_settings.view_transform = "AgX"
    except (TypeError, ValueError):
        pass


def make_image_material(name: str, image: bpy.types.Image) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for n in list(nodes):
        nodes.remove(n)
    out = nodes.new("ShaderNodeOutputMaterial")
    try:
        emission = nodes.new("ShaderNodeEmission")
    except RuntimeError:
        emission = nodes.new("ShaderNodeBsdfPrincipled")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    if emission.bl_idname == "ShaderNodeEmission":
        links.new(tex.outputs["Color"], emission.inputs["Color"])
        emission.inputs["Strength"].default_value = 1.0
        links.new(emission.outputs["Emission"], out.inputs["Surface"])
    else:
        emission.inputs["Base Color"].default_value = (1, 1, 1, 1)
        emission.inputs["Roughness"].default_value = 1.0
        links.new(tex.outputs["Color"], emission.inputs["Base Color"])
        if "Emission Color" in emission.inputs:
            links.new(tex.outputs["Color"], emission.inputs["Emission Color"])
            emission.inputs["Emission Strength"].default_value = 1.0
        links.new(emission.outputs["BSDF"], out.inputs["Surface"])
    return mat


def add_plane(name: str, width: float, height: float, z: float, material: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_plane_add(size=2.0, location=(0, 0, z))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (width / 2.0, height / 2.0, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj


def make_principled(name: str, base: tuple[float, float, float, float], roughness: float, specular: float = 0.25) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        raise RuntimeError("V3_PRINCIPLED_BSDF_MISSING")
    bsdf.inputs["Base Color"].default_value = base
    bsdf.inputs["Roughness"].default_value = roughness
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = specular
    elif "Specular" in bsdf.inputs:
        bsdf.inputs["Specular"].default_value = specular
    return mat


def add_rock(name: str, location: tuple[float, float, float], scale: tuple[float, float, float], material: bpy.types.Material, seed: int) -> bpy.types.Object:
    random.seed(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = (
        math.radians(random.uniform(-18, 18)),
        math.radians(random.uniform(-22, 22)),
        math.radians(random.uniform(-28, 28)),
    )
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mesh = obj.data
    for v in mesh.vertices:
        co = v.co
        jitter = 1.0 + 0.09 * math.sin(co.x * 5.7 + seed) + 0.06 * math.sin(co.y * 7.1 + seed * 0.37) + 0.04 * math.sin(co.z * 9.3)
        v.co *= jitter
    bevel = obj.modifiers.new("micro_bevel", "BEVEL")
    bevel.width = 0.025
    bevel.segments = 2
    obj.data.materials.append(material)
    return obj


def add_leaf(name: str, location: tuple[float, float, float], scale: tuple[float, float, float], rotation_z: float, material: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = (math.radians(72), math.radians(-12), math.radians(rotation_z))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj


def add_stem(a: Vector, b: Vector, radius: float, material: bpy.types.Material, name: str) -> None:
    vec = b - a
    length = vec.length
    mid = (a + b) / 2
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius, depth=length, location=mid)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = vec.to_track_quat("Z", "Y")
    obj.data.materials.append(material)


def main() -> int:
    args = parse_args()
    base_path = Path(args.base_scene).resolve()
    sc01_path = Path(args.source_sc01).resolve()
    out_path = Path(args.output).resolve()
    blend_path = Path(args.blend_output).resolve()
    if not base_path.is_file() or not sc01_path.is_file():
        raise RuntimeError("V3_REQUIRED_INPUT_MISSING")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    blend_path.parent.mkdir(parents=True, exist_ok=True)

    clear_scene()
    base_img = bpy.data.images.load(str(base_path), check_existing=False)
    sc01_img = bpy.data.images.load(str(sc01_path), check_existing=False)
    w, h = base_img.size
    if tuple(sc01_img.size) != (w, h):
        raise RuntimeError(f"V3_IMAGE_DIMENSION_MISMATCH:base={tuple(base_img.size)}:sc01={tuple(sc01_img.size)}")

    bbox = image_subject_bbox(sc01_img)
    bx0, by0_bottom, bx1, by1_bottom = bbox
    # bpy image alpha coordinates are bottom-origin; convert to top-origin for screen mapping.
    by0_top = h - by1_bottom
    by1_top = h - by0_bottom
    bw = bx1 - bx0
    bh = by1_top - by0_top

    world_w = 4.0
    world_h = world_w * h / w

    scene = bpy.context.scene
    selected_engine = configure_render_engine(scene)
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    scene.render.filepath = str(out_path)
    configure_color_management(scene)

    # Orthographic camera maps world coordinates directly to the photographic backplate.
    bpy.ops.object.camera_add(location=(0, 0, 6.0))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = world_h
    camera.rotation_euler = (0, 0, 0)
    scene.camera = camera

    back_mat = make_image_material("backplate_mat", base_img)
    add_plane("aquarium_backplate", world_w, world_h, 0.0, back_mat)

    # Coordinate helpers tied to the exact SC01 alpha bounding box.
    def subject_xy(nx: float, ny: float) -> tuple[float, float]:
        px = bx0 + bw * nx
        py = by0_top + bh * ny
        return world_from_pixel(px, py, w, h, world_w, world_h)

    basalt = make_principled("basalt", (0.055, 0.064, 0.058, 1.0), 0.92, 0.16)
    basalt2 = make_principled("basalt2", (0.085, 0.079, 0.068, 1.0), 0.88, 0.18)
    substrate = make_principled("substrate", (0.075, 0.052, 0.033, 1.0), 0.98, 0.08)
    leaf_dark = make_principled("leaf_dark", (0.028, 0.115, 0.048, 1.0), 0.72, 0.22)
    leaf_mid = make_principled("leaf_mid", (0.045, 0.175, 0.062, 1.0), 0.68, 0.24)
    stem_mat = make_principled("stem", (0.035, 0.095, 0.035, 1.0), 0.82, 0.12)

    # True foreground support stones. Their Z is closer to camera than the backplate,
    # so visible overlap is guaranteed by the renderer rather than inferred by diffusion.
    rx1, ry1 = subject_xy(0.18, 0.84)
    rx2, ry2 = subject_xy(0.37, 0.89)
    rx3, ry3 = subject_xy(0.08, 0.92)
    add_rock("support_stone_A", (rx1, ry1, 0.42), (0.34, 0.22, 0.18), basalt, 11)
    add_rock("support_stone_B", (rx2, ry2, 0.38), (0.27, 0.18, 0.16), basalt2, 17)
    add_rock("support_stone_C", (rx3, ry3, 0.35), (0.22, 0.14, 0.13), basalt, 23)

    # Substrate mound in front of the lowest silhouette, plus small grains.
    sx, sy = subject_xy(0.27, 0.985)
    add_rock("substrate_mound", (sx, sy, 0.28), (0.82, 0.10, 0.10), substrate, 31)
    random.seed(44)
    for i in range(28):
        gx = sx + random.uniform(-0.74, 0.74)
        gy = sy + random.uniform(-0.05, 0.08)
        gz = 0.32 + random.uniform(-0.015, 0.02)
        s = random.uniform(0.012, 0.032)
        add_rock(f"grain_{i:02d}", (gx, gy, gz), (s * 1.4, s, s * 0.8), substrate if i % 3 else basalt2, 100 + i)

    # Two attached epiphyte clusters. Leaves deliberately extend across the wood edge.
    clusters = [
        (0.18, 0.62, -18),
        (0.46, 0.67, 24),
    ]
    for ci, (nx, ny, base_rot) in enumerate(clusters):
        cx, cy = subject_xy(nx, ny)
        root = Vector((cx, cy, 0.47))
        for li in range(6):
            ang = math.radians(base_rot + (li - 2.5) * 18)
            dist = 0.13 + 0.028 * li
            lx = cx + math.cos(ang) * dist
            ly = cy + math.sin(ang) * dist * 0.72
            lz = 0.49 + 0.012 * (li % 3)
            add_leaf(
                f"leaf_{ci}_{li}",
                (lx, ly, lz),
                (0.075 + 0.006 * (li % 2), 0.030 + 0.004 * (li % 3), 0.012),
                math.degrees(ang),
                leaf_mid if li % 2 else leaf_dark,
            )
            add_stem(root, Vector((lx, ly, lz)), 0.007, stem_mat, f"stem_{ci}_{li}")

    # Soft underwater-like key/fill lights for the foreground proxies.
    bpy.ops.object.light_add(type="AREA", location=(-2.0, 2.4, 4.2))
    key = bpy.context.object
    key.data.energy = 520
    key.data.shape = "RECTANGLE"
    key.data.size = 4.5
    key.rotation_euler = (math.radians(12), math.radians(-10), math.radians(-28))

    bpy.ops.object.light_add(type="AREA", location=(2.3, -0.8, 3.6))
    fill = bpy.context.object
    fill.data.energy = 170
    fill.data.size = 3.5
    fill.rotation_euler = (math.radians(24), math.radians(8), math.radians(145))

    world = bpy.data.worlds.new("World") if bpy.data.worlds.get("World") is None else bpy.data.worlds["World"]
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is None:
        raise RuntimeError("V3_WORLD_BACKGROUND_NODE_MISSING")
    bg.inputs["Color"].default_value = (0.015, 0.025, 0.022, 1.0)
    bg.inputs["Strength"].default_value = 0.15

    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)

    if not out_path.is_file():
        raise RuntimeError("V3_RENDER_OUTPUT_MISSING")
    print("P5_QA01_V3_GEOMETRY_RENDER=PASS")
    print(f"blender_version={bpy.app.version_string}")
    print(f"render_engine={selected_engine}")
    print(f"base_scene_sha256={sha256(base_path)}")
    print(f"source_sc01_sha256={sha256(sc01_path)}")
    print(f"render_sha256={sha256(out_path)}")
    print(f"render_file={out_path}")
    print(f"blend_file={blend_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
