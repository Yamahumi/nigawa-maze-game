#!/usr/bin/env python3
"""Convert OSM roads around Hankyu Nigawa Station into a playable maze grid."""
from __future__ import annotations

import json
import math
import xml.etree.ElementTree as ET
from collections import deque
from pathlib import Path

OSM_PATH = Path("/tmp/nigawa-osm/map-wide.osm")
OUT_PATH = Path("/workspace/iphone-maze-game/nigawa-maze.json")

# Wikipedia / OSM confirmed coordinates
STATION_WIKI = (34.7752389, 135.3569806)
CELL_M = 22.0  # meters per tile — playable on a phone with a following camera

# highway values treated as walkable corridors
WALKABLE = {
    "residential",
    "unclassified",
    "living_street",
    "pedestrian",
    "secondary",
    "tertiary",
    "tertiary_link",
    "primary",
    "primary_link",
    "footway",
    "path",
    "steps",
    "cycleway",
    "service",
}

# slightly thicker corridors for bigger streets
WIDE = {"secondary", "tertiary", "tertiary_link", "primary", "primary_link", "pedestrian"}

LANDMARKS = [
    {
        "id": "station",
        "name": "仁川駅",
        "lat": 34.7747939,
        "lon": 135.3569799,
        "osm": "node/346649198",
        "kind": "station",
        "role": "start_safe",
        "bonus": 500,
    },
    {
        "id": "nursery",
        "name": "仁川ウエル保育園",
        "lat": 34.7813651,
        "lon": 135.3509496,
        "osm": "node/9047445070",
        "kind": "nursery",
        "role": "safe",
        "bonus": 800,
    },
    {
        "id": "mandai",
        "name": "万代",
        "lat": 34.7742954,
        "lon": 135.3646092,
        "osm": "node/7025294528",
        "kind": "shop",
        "role": "bonus",
        "bonus": 1000,
        "placement": "user",
        "note": "ユーザー指定：駅からの距離を約60%にし、さらに西へ。旧スナップ (95,48) → (69,48)。EXTENTは元のOSM位置で固定。",
    },
    {
        "id": "racecourse",
        "name": "阪神競馬場",
        "lat": 34.7801348,
        "lon": 135.3635340,
        "osm": "relation/21889276",
        "kind": "racecourse",
        "role": "safe",
        "bonus": 1200,
    },
    {
        "id": "mcdonalds",
        "name": "マクドナルド",
        "lat": 34.7812613,
        "lon": 135.3574410,
        "osm": "node/5297336928",
        "kind": "shop",
        "role": "bonus",
        "bonus": 700,
        "note": "最寄り店舗（鹿塩二丁目／中津浜線）",
    },
    {
        "id": "benten",
        "name": "弁天池",
        "lat": 34.7762975,
        "lon": 135.3552237,
        "osm": "way/110536806",
        "kind": "pond",
        "role": "bonus",
        "bonus": 800,
    },
    {
        "id": "coop",
        "name": "コープ",
        "lat": 34.7750356,
        "lon": 135.3575555,
        "osm": "node/5297344126",
        "kind": "shop",
        "role": "bonus",
        "bonus": 600,
        "note": "最寄り店舗（仁川北三丁目／桝塚線）",
    },
    {
        "id": "ohsho",
        "name": "大阪王将",
        "lat": 34.7754185,
        "lon": 135.3582794,
        "osm": "way/724487679",
        "kind": "restaurant",
        "role": "bonus",
        "bonus": 700,
        "note": "最寄り店舗（仁川北二丁目／生瀬門戸荘線）",
    },
    {
        "id": "school",
        "name": "市立仁川小学校",
        "lat": 34.7798290,
        "lon": 135.3533009,
        "osm": "way/104223606",
        "kind": "school",
        "role": "safe",
        "bonus": 800,
        "placement": "user",
        "note": "ユーザー指定：OSMのスナップ先 (20,20) から東へ2マスの道路 (22,20) へ移動。安全地帯のまま。",
    },
    {
        "id": "jhs",
        "name": "宝塚市立宝塚第一中学校",
        "lat": 34.7816570,
        "lon": 135.3484892,
        "osm": "way/104223597",
        "kind": "school",
        "role": "safe",
        "bonus": 800,
        "note": "OSMの宝塚市立宝塚第一中学校。敷地の東端はマップ西端付近。最寄り道路 (3,11) はウエルほいくえんの北西（西へ10・北へ1）。中心はマップ外 cell≈(-1,13)。",
    },
    {
        "id": "hoshi",
        "name": "ホシのびょういん",
        "lat": 34.7758304,
        "lon": 135.3573891,
        "osm": "way/262505388",
        "kind": "hospital",
        "role": "safe",
        "bonus": 800,
        "note": "クリニック本体はOSMに未登録。星空こども・アレルギークリニックはさらら仁川北館（way/262505388）内（駅の北東、徒歩約30秒）。建物中心から最寄り道路へスナップ。",
    },
    {
        "id": "dentist",
        "name": "うえは歯科医院",
        "lat": 34.7728138,
        "lon": 135.3597848,
        "osm": "node/10301968220",
        "kind": "dentist",
        "role": "bonus",
        "bonus": 600,
        "note": "駅の南にある唯一の amenity=dentist（南東へ約338m）。",
    },
    {
        "id": "home",
        "name": "いえ",
        "lat": 34.7744930,
        "lon": 135.3549851,
        "osm": None,
        "kind": "home",
        "role": "safe",
        "bonus": 500,
        "placement": "user",
        "note": "ユーザー指定：べんてんいけの左下（南西）の行き止まり道路マス (29,47)。旧位置 (35,44) から移動。",
    },
    {
        "id": "pannel",
        "name": "パンネル",
        "lat": 34.7802242,
        "lon": 135.3530603,
        "osm": None,
        "kind": "bakery",
        "role": "bonus",
        "bonus": 600,
        "placement": "user",
        "note": "ユーザー指定：小学校のすぐ西の道路 (21,18)。学校移動に合わせて東へずらした。",
    },
    {
        "id": "kumon",
        "name": "くもん",
        "lat": 34.7802242,
        "lon": 135.3525791,
        "osm": None,
        "kind": "juku",
        "role": "bonus",
        "bonus": 500,
        "placement": "user",
        "note": "ユーザー指定：パンネルの西の道路 (19,18)。学校移動に合わせてずらした。",
    },
    {
        "id": "lawson",
        "name": "ローソン",
        "lat": 34.7802242,
        "lon": 135.3523385,
        "osm": None,
        "kind": "convenience",
        "role": "bonus",
        "bonus": 500,
        "placement": "user",
        "note": "ユーザー指定：くもんのすぐ西の道路 (18,18)。左から ローソン・くもん・パンネル・しょうがっこう。",
    },
    {
        "id": "kumano",
        "name": "くまのじんじゃ",
        "lat": 34.7756788,
        "lon": 135.3554663,
        "osm": None,
        "kind": "shrine",
        "role": "bonus",
        "bonus": 700,
        "placement": "user",
        "note": "ユーザー指定：べんてんいけのすぐ北の道路マス（31,41）。近傍にOSMの熊野神社はなし。",
    },
    {
        "id": "laundry",
        "name": "コインランドリー",
        "lat": 34.7764693,
        "lon": 135.3573911,
        "osm": None,
        "kind": "laundry",
        "role": "bonus",
        "bonus": 500,
        "placement": "user",
        "note": "ユーザー指定：ホシのびょういんのすぐ北の道路 (39,37)。",
    },
    {
        "id": "bigboy",
        "name": "ビッグボーイ",
        "lat": 34.7806195,
        "lon": 135.3573911,
        "osm": None,
        "kind": "restaurant",
        "role": "bonus",
        "bonus": 600,
        "placement": "user",
        "note": "ユーザー指定：マクドナルドのすぐ南の道路 (39,16)。OSM位置は使わない。",
    },
    {
        "id": "cocokara",
        "name": "ココカラファイン",
        "lat": 34.7742954,
        "lon": 135.3638874,
        "osm": "node/7025294529",
        "kind": "pharmacy",
        "role": "bonus",
        "bonus": 600,
        "placement": "user",
        "note": "OSM node/7025294529（万代の隣、生スナップは (95,48)）を追加したあと、マンダイと同じく駅から約60%・西へ移動して (66,48)。",
    },
    {
        "id": "piano",
        "name": "ピアノきょうしつ",
        "lat": 34.7758764,
        "lon": 135.3542633,
        "osm": None,
        "kind": "piano",
        "role": "bonus",
        "bonus": 600,
        "placement": "user",
        "note": "ユーザー指定：いえ(29,47)とにがわしょうがっこう(22,20)の中間付近。理想セル(25,33)は壁のため、最も近い南北の道路 (26,40)。",
    },
    {
        "id": "swimming",
        "name": "スイミングスクール",
        "lat": 34.7725167,
        "lon": 135.3597971,
        "osm": None,
        "kind": "pool",
        "role": "bonus",
        "bonus": 600,
        "placement": "user",
        "note": "ユーザー指定：はいしゃ(49,55)の南の道路。(49,56)は壁のため、同じ列の最寄り歩行マス (49,57)。",
    },
]


def meters_per_deg(lat: float) -> tuple[float, float]:
    m_lat = 111320.0
    m_lon = 111320.0 * math.cos(math.radians(lat))
    return m_lat, m_lon


def parse_ways(path: Path):
    tree = ET.parse(path)
    root = tree.getroot()
    nodes: dict[str, tuple[float, float]] = {}
    for el in root:
        if el.tag == "node":
            nodes[el.get("id")] = (float(el.get("lat")), float(el.get("lon")))
    ways = []
    for el in root:
        if el.tag != "way":
            continue
        tags = {t.get("k"): t.get("v") for t in el if t.tag == "tag"}
        hw = tags.get("highway")
        if hw not in WALKABLE:
            continue
        if hw == "service" and tags.get("service") in {"parking_aisle", "driveway", "parking"}:
            continue
        pts = []
        for nd in el:
            if nd.tag == "nd" and nd.get("ref") in nodes:
                pts.append(nodes[nd.get("ref")])
        if len(pts) >= 2:
            ways.append((hw, pts))
    return ways


# The playable window is fixed by these map-defining landmarks plus padding.
# Later pins already inside the window must not grow it another 280m.
EXTENT_IDS = {
    "station", "nursery", "racecourse", "mcdonalds",
    "benten", "coop", "ohsho", "school",
}

# Original 万代 OSM pin so moving the playable マンダイ west does not shrink the map.
EXTENT_ANCHORS = [
    {"lat": 34.7753683, "lon": 135.3707962},
]


def landmark_bounds_m(cell_m: float):
    """Playable window: extent-landmark bbox plus ~280m padding (not the full length of roads)."""
    m_lat, m_lon = meters_per_deg(STATION_WIKI[0])
    xs, ys = [], []
    for lm in LANDMARKS:
        if lm["id"] not in EXTENT_IDS:
            continue
        x = (lm["lon"] - STATION_WIKI[1]) * m_lon
        y = (STATION_WIKI[0] - lm["lat"]) * m_lat
        xs.append(x)
        ys.append(y)
    for an in EXTENT_ANCHORS:
        x = (an["lon"] - STATION_WIKI[1]) * m_lon
        y = (STATION_WIKI[0] - an["lat"]) * m_lat
        xs.append(x)
        ys.append(y)
    pad = 280.0
    return min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad, m_lat, m_lon




def peel_blobs(grid):
    """Remove interior corridor cells when doing so does not break 4-connectivity."""
    h, w = len(grid), len(grid[0])

    def corridor(x, y):
        return 0 <= x < w and 0 <= y < h and grid[y][x] == 0

    def would_split(x, y):
        # After removing (x,y), are the 4-adjacent corridor neighbors still connected
        # to each other via a path that stays in the 8-neighborhood?
        nbrs = [(nx, ny) for nx, ny in ((x+1,y), (x-1,y), (x,y+1), (x,y-1)) if corridor(nx, ny)]
        if len(nbrs) <= 1:
            return False
        # BFS in 8-neighborhood excluding (x,y)
        start = nbrs[0]
        seen = {start}
        q = [start]
        while q:
            cx, cy = q.pop()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = cx + dx, cy + dy
                    if abs(nx - x) > 1 or abs(ny - y) > 1:
                        continue
                    if (nx, ny) == (x, y):
                        continue
                    if not corridor(nx, ny) or (nx, ny) in seen:
                        continue
                    seen.add((nx, ny))
                    q.append((nx, ny))
        return not all(n in seen for n in nbrs)

    changed = True
    peeled = 0
    while changed:
        changed = False
        victims = []
        for y in range(h):
            for x in range(w):
                if grid[y][x] != 0:
                    continue
                n4 = sum(1 for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)) if corridor(nx, ny))
                n8 = sum(1 for dx in (-1,0,1) for dy in (-1,0,1)
                         if not (dx==0 and dy==0) and corridor(x+dx, y+dy))
                # only peel clearly fat cells
                if n4 < 3 and n8 < 6:
                    continue
                if would_split(x, y):
                    continue
                victims.append((x, y))
        for x, y in victims:
            if grid[y][x] != 0:
                continue
            if would_split(x, y):
                continue
            grid[y][x] = 1
            peeled += 1
            changed = True
    print(f"peeled {peeled} blob cells; corridors {sum(c==0 for row in grid for c in row)}")
    return grid


def zhang_suen_thin(grid, protected=None):
    """Thin corridor blobs to 1-cell-wide centerlines. 0=corridor, 1=wall."""
    h, w = len(grid), len(grid[0])
    prot = set(protected or [])
    # work on a binary image where 1 = corridor (foreground)
    img = [[0 if grid[y][x] == 1 else 1 for x in range(w)] for y in range(h)]

    def nhood(x, y):
        # P2..P9 clockwise from north
        pts = [
            (x, y - 1), (x + 1, y - 1), (x + 1, y), (x + 1, y + 1),
            (x, y + 1), (x - 1, y + 1), (x - 1, y), (x - 1, y - 1),
        ]
        vals = []
        for nx, ny in pts:
            if 0 <= nx < w and 0 <= ny < h:
                vals.append(img[ny][nx])
            else:
                vals.append(0)
        return vals

    def transitions(vals):
        s = 0
        for i in range(8):
            if vals[i] == 0 and vals[(i + 1) % 8] == 1:
                s += 1
        return s

    changed = True
    passes = 0
    while changed and passes < 40:
        changed = False
        passes += 1
        for step in (0, 1):
            mark = []
            for y in range(h):
                for x in range(w):
                    if img[y][x] != 1:
                        continue
                    if (x, y) in prot:
                        continue
                    p = nhood(x, y)
                    bp = sum(p)
                    if not (2 <= bp <= 6):
                        continue
                    if transitions(p) != 1:
                        continue
                    if step == 0:
                        if p[0] * p[2] * p[4] != 0:
                            continue
                        if p[2] * p[4] * p[6] != 0:
                            continue
                    else:
                        if p[0] * p[2] * p[6] != 0:
                            continue
                        if p[0] * p[4] * p[6] != 0:
                            continue
                    mark.append((x, y))
            for x, y in mark:
                img[y][x] = 0
                changed = True
    # write back
    out = [[1 if img[y][x] == 0 else 0 for x in range(w)] for y in range(h)]
    print(f"thinned in {passes} passes; corridors {sum(c==0 for row in out for c in row)}")
    return out


def rasterize(ways, cell_m: float):
    minx, miny, maxx, maxy, m_lat, m_lon = landmark_bounds_m(cell_m)
    # First pass: collect all corridor points in meter space relative to station
    # x east, y south (so grid row increases downward like canvas)
    segs = []
    for hw, pts in ways:
        xy = []
        for lat, lon in pts:
            x = (lon - STATION_WIKI[1]) * m_lon
            y = (STATION_WIKI[0] - lat) * m_lat
            xy.append((x, y))
        segs.append((hw, xy))
    print(f"clip window x[{minx:.0f},{maxx:.0f}] y[{miny:.0f},{maxy:.0f}] m")

    width = int(math.ceil((maxx - minx) / cell_m)) + 1
    height = int(math.ceil((maxy - miny) / cell_m)) + 1
    print(f"raw grid {width}x{height}  bounds x[{minx:.0f},{maxx:.0f}] y[{miny:.0f},{maxy:.0f}] m")

    grid = [[1 for _ in range(width)] for _ in range(height)]  # 1=wall, 0=corridor

    def plot(cx, cy, thick=0):
        for dy in range(-thick, thick + 1):
            for dx in range(-thick, thick + 1):
                x, y = cx + dx, cy + dy
                if 0 <= x < width and 0 <= y < height:
                    grid[y][x] = 0

    def to_cell(x, y):
        return int((x - minx) / cell_m), int((y - miny) / cell_m)

    def walk(x0, y0, x1, y1, thick):
        c0, r0 = to_cell(x0, y0)
        c1, r1 = to_cell(x1, y1)
        n = max(abs(c1 - c0), abs(r1 - r0), 1)
        for i in range(n + 1):
            t = i / n
            plot(int(round(c0 + (c1 - c0) * t)), int(round(r0 + (r1 - r0) * t)), thick)

    for hw, xy in segs:
        for i in range(len(xy) - 1):
            walk(xy[i][0], xy[i][1], xy[i + 1][0], xy[i + 1][1], 0)

    origin = {
        "minx": minx,
        "miny": miny,
        "cell_m": cell_m,
        "m_lat": m_lat,
        "m_lon": m_lon,
        "lat0": STATION_WIKI[0],
        "lon0": STATION_WIKI[1],
    }
    return grid, origin


def latlon_to_cell(lat, lon, origin):
    x = (lon - origin["lon0"]) * origin["m_lon"]
    y = (origin["lat0"] - lat) * origin["m_lat"]
    c = int((x - origin["minx"]) / origin["cell_m"])
    r = int((y - origin["miny"]) / origin["cell_m"])
    return c, r


def neighbors4(x, y, w, h):
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h:
            yield nx, ny


def nearest_corridor(grid, x, y, max_r=40):
    h, w = len(grid), len(grid[0])
    if 0 <= x < w and 0 <= y < h and grid[y][x] == 0:
        return x, y, 0
    q = deque([(x, y, 0)])
    seen = {(x, y)}
    while q:
        cx, cy, d = q.popleft()
        if d > max_r:
            break
        for nx, ny in neighbors4(cx, cy, w, h):
            if (nx, ny) in seen:
                continue
            seen.add((nx, ny))
            if grid[ny][nx] == 0:
                return nx, ny, d
            q.append((nx, ny, d + 1))
    return None


def components(grid):
    h, w = len(grid), len(grid[0])
    comp_id = [[-1] * w for _ in range(h)]
    comps = []
    cid = 0
    for y in range(h):
        for x in range(w):
            if grid[y][x] != 0 or comp_id[y][x] != -1:
                continue
            cells = []
            q = deque([(x, y)])
            comp_id[y][x] = cid
            while q:
                cx, cy = q.popleft()
                cells.append((cx, cy))
                for nx, ny in neighbors4(cx, cy, w, h):
                    if grid[ny][nx] == 0 and comp_id[ny][nx] == -1:
                        comp_id[ny][nx] = cid
                        q.append((nx, ny))
            comps.append(cells)
            cid += 1
    return comp_id, comps


def astar_carve(grid, start, goal):
    """Carve a shortest path through walls (and existing corridors) between two cells."""
    h, w = len(grid), len(grid[0])
    sx, sy = start
    gx, gy = goal

    def heur(x, y):
        return abs(x - gx) + abs(y - gy)

    # Prefer walking existing corridors (cost 1) over carving walls (cost 4)
    import heapq

    pq = [(heur(sx, sy), 0, sx, sy)]
    came = {(sx, sy): None}
    gbest = {(sx, sy): 0}
    found = False
    while pq:
        _, g, x, y = heapq.heappop(pq)
        if (x, y) == (gx, gy):
            found = True
            break
        if g != gbest[(x, y)]:
            continue
        for nx, ny in neighbors4(x, y, w, h):
            step = 1 if grid[ny][nx] == 0 else 4
            ng = g + step
            if ng < gbest.get((nx, ny), 1e18):
                gbest[(nx, ny)] = ng
                came[(nx, ny)] = (x, y)
                heapq.heappush(pq, (ng + heur(nx, ny), ng, nx, ny))
    if not found:
        return False
    cur = (gx, gy)
    carved = 0
    while cur is not None:
        x, y = cur
        if grid[y][x] == 1:
            grid[y][x] = 0
            carved += 1
        cur = came[cur]
    return carved


def connect_landmarks(grid, points):
    """Ensure all landmark (and start) cells are in one connected component."""
    comp_id, comps = components(grid)
    # pick the component of the station (first point) as the main one
    main = points[0]
    mid = comp_id[main[1]][main[0]]
    for p in points[1:]:
        cid = comp_id[p[1]][p[0]]
        if cid == mid:
            continue
        # connect p to nearest cell of main component
        best = None
        best_d = 1e18
        for cx, cy in comps[mid]:
            d = abs(cx - p[0]) + abs(cy - p[1])
            if d < best_d:
                best_d = d
                best = (cx, cy)
        carved = astar_carve(grid, p, best)
        print(f"  carved path from {p} to main comp at {best} (dist {best_d}, carved {carved})")
        # refresh after carve
        comp_id, comps = components(grid)
        mid = comp_id[main[1]][main[0]]
    return components(grid)


def crop(grid, keep_cells, pad=2):
    xs = [x for x, y in keep_cells]
    ys = [y for x, y in keep_cells]
    h, w = len(grid), len(grid[0])
    x0 = max(0, min(xs) - pad)
    x1 = min(w, max(xs) + pad + 1)
    y0 = max(0, min(ys) - pad)
    y1 = min(h, max(ys) + pad + 1)
    new = [row[x0:x1] for row in grid[y0:y1]]
    return new, x0, y0


def intersections(grid):
    h, w = len(grid), len(grid[0])
    out = []
    for y in range(h):
        for x in range(w):
            if grid[y][x] != 0:
                continue
            n = sum(1 for nx, ny in neighbors4(x, y, w, h) if grid[ny][nx] == 0)
            if n >= 3:
                out.append((x, y, n))
    return out


def farthest_cells(grid, start, k=4):
    h, w = len(grid), len(grid[0])
    dist = {(start[0], start[1]): 0}
    q = deque([start])
    while q:
        x, y = q.popleft()
        for nx, ny in neighbors4(x, y, w, h):
            if grid[ny][nx] == 0 and (nx, ny) not in dist:
                dist[(nx, ny)] = dist[(x, y)] + 1
                q.append((nx, ny))
    ranked = sorted(dist.items(), key=lambda kv: -kv[1])
    picks = []
    used = set()
    for (x, y), d in ranked:
        if any(abs(x - ux) + abs(y - uy) < 8 for ux, uy in used):
            continue
        picks.append((x, y, d))
        used.add((x, y))
        if len(picks) >= k:
            break
    return picks, len(dist)


def latlon_to_cell_origin(lat, lon, origin):
    x = (lon - origin["lon0"]) * origin["m_lon"]
    y = (origin["lat0"] - lat) * origin["m_lat"]
    c = int((x - origin["minx"]) / origin["cell_m"])
    r = int((y - origin["miny"]) / origin["cell_m"])
    return c, r


def cells_in_poly(cell_pts, width, height):
    if len(cell_pts) < 3:
        return []
    xs = [p[0] for p in cell_pts]
    ys = [p[1] for p in cell_pts]
    minx, maxx = int(math.floor(min(xs))), int(math.ceil(max(xs)))
    miny, maxy = int(math.floor(min(ys))), int(math.ceil(max(ys)))
    minx, miny = max(0, minx), max(0, miny)
    maxx, maxy = min(width - 1, maxx), min(height - 1, maxy)
    out = []
    n = len(cell_pts)
    for y in range(miny, maxy + 1):
        for x in range(minx, maxx + 1):
            cx, cy = x + 0.5, y + 0.5
            inside = False
            j = n - 1
            for i in range(n):
                xi, yi = cell_pts[i]
                xj, yj = cell_pts[j]
                if ((yi > cy) != (yj > cy)) and (cx < (xj - xi) * (cy - yi) / (yj - yi + 1e-15) + xi):
                    inside = not inside
                j = i
            if inside:
                out.append((x, y))
    return out


def stitch_rings(parts):
    leftover = [list(p) for p in parts]
    rings = []
    while leftover:
        ring = leftover.pop()
        changed = True
        while changed and leftover:
            changed = False
            for i, part in enumerate(leftover):
                if ring[-1] == part[0]:
                    ring += part[1:]
                    leftover.pop(i)
                    changed = True
                    break
                if ring[-1] == part[-1]:
                    ring += list(reversed(part[:-1]))
                    leftover.pop(i)
                    changed = True
                    break
                if ring[0] == part[-1]:
                    ring = part + ring[1:]
                    leftover.pop(i)
                    changed = True
                    break
                if ring[0] == part[0]:
                    ring = list(reversed(part)) + ring[1:]
                    leftover.pop(i)
                    changed = True
                    break
        rings.append(ring)
    return rings


def build_area_labels(osm_path, grid, origin):
    """Rasterize large named OSM areas (racecourse) for on-block labels."""
    width, height = len(grid[0]), len(grid)
    tree = ET.parse(osm_path)
    root = tree.getroot()
    nodes = {}
    for el in root:
        if el.tag == "node":
            nodes[el.get("id")] = (float(el.get("lat")), float(el.get("lon")))
    ways = {}
    for el in root:
        if el.tag != "way":
            continue
        nds = [nd.get("ref") for nd in el if nd.tag == "nd"]
        pts = [nodes[i] for i in nds if i in nodes]
        ways[el.get("id")] = pts

    # 阪神競馬場 relation/21889276
    rel = None
    for el in root:
        if el.tag == "relation" and el.get("id") == "21889276":
            rel = el
            break
    if rel is None:
        print("WARN: racecourse relation/21889276 not in OSM extract")
        return [], []

    outers, inners = [], []
    for m in rel:
        if m.tag != "member" or m.get("type") != "way":
            continue
        pts = ways.get(m.get("ref"))
        if not pts:
            continue
        (inners if m.get("role") == "inner" else outers).append(pts)

    def to_cells(pts):
        return [latlon_to_cell_origin(lat, lon, origin) for lat, lon in pts]

    cells = set()
    for ring in stitch_rings(outers):
        cells.update(cells_in_poly(to_cells(ring), width, height))
    for ring in stitch_rings(inners):
        cells.difference_update(cells_in_poly(to_cells(ring), width, height))

    # only solid wall cells (the no-entry block)
    wall_cells = [(x, y) for x, y in cells if 0 <= y < height and 0 <= x < width and grid[y][x] == 1]
    print(f"racecourse area: polygon={len(cells)} wall={len(wall_cells)}")
    if not wall_cells:
        return [], []

    # distance to nearest corridor, for interior label placement
    from collections import deque
    inf = 99
    dist = [[inf] * width for _ in range(height)]
    q = deque()
    wallset = set(wall_cells)
    for y in range(height):
        for x in range(width):
            if grid[y][x] != 1:
                dist[y][x] = 0
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and dist[ny][nx] == inf:
                dist[ny][nx] = dist[y][x] + 1
                q.append((nx, ny))

    # horizontal runs for compact fill
    by_row = {}
    for x, y in wall_cells:
        by_row.setdefault(y, []).append(x)
    runs = []
    for y in sorted(by_row):
        xs = sorted(by_row[y])
        start = prev = xs[0]
        for x in xs[1:]:
            if x == prev + 1:
                prev = x
                continue
            runs.append([y, start, prev])
            start = prev = x
        runs.append([y, start, prev])

    # repeat labels across the interior so a follow-camera always sees one
    labels = []
    used = []
    # sort interior-first
    interiors = [(dist[y][x], x, y) for x, y in wall_cells if dist[y][x] >= 3]
    interiors.sort(key=lambda t: (-t[0], t[2], t[1]))
    # seed a coarse grid
    if interiors:
        xs = [x for _, x, _ in interiors]
        ys = [y for _, _, y in interiors]
        for y in range(min(ys), max(ys) + 1, 8):
            for x in range(min(xs), max(xs) + 1, 10):
                # pick nearest interior cell with enough spacing
                best = None
                best_d = 1e9
                for d, cx, cy in interiors:
                    md = abs(cx - x) + abs(cy - y)
                    if md < best_d:
                        best_d = md
                        best = (cx, cy, d)
                if best is None or best_d > 6:
                    continue
                cx, cy, d = best
                if any(abs(cx - ux) + abs(cy - uy) < 8 for ux, uy in used):
                    continue
                if d < 3:
                    continue
                used.append((cx, cy))
                labels.append({
                    "id": "racecourse-area",
                    "name": "はんしんけいばじょう",
                    "kind": "racecourse",
                    "icon": "horse",
                    "x": cx,
                    "y": cy,
                })
    print(f"racecourse area labels: {len(labels)} at {[(lm['x'], lm['y']) for lm in labels]}")

    fills = [{
        "id": "racecourse-area",
        "name": "はんしんけいばじょう",
        "osm": "relation/21889276",
        "kind": "racecourse",
        "color": "#2b5d3a",
        "edge": "#8fd4a0",
        "runs": runs,
    }]
    return fills, labels



def main():
    print("parsing", OSM_PATH)
    ways = parse_ways(OSM_PATH)
    print("walkable ways", len(ways))
    grid, origin = rasterize(ways, CELL_M)
    # Keep the raw road raster (no thinning). Dense Japanese streets may form
    # slightly wide corridors, which plays better on a phone.

    # Snap the station onto a corridor and take its connected street network
    # as the only playable component (no long carves through building blocks).
    station = LANDMARKS[0]
    sc, sr = latlon_to_cell(station["lat"], station["lon"], origin)
    snap0 = nearest_corridor(grid, sc, sr, max_r=80)
    if snap0 is None:
        raise SystemExit("station has no nearby road")
    sx0, sy0, d0 = snap0
    grid[sy0][sx0] = 0
    station["raw_cell"] = [sc, sr]
    station["cell"] = [sx0, sy0]
    station["snap_cells"] = d0
    station["snap_meters"] = round(d0 * CELL_M, 1)
    print(f"landmark {station['name']}: raw={(sc,sr)} snapped=({sx0},{sy0}) dist={d0} cells ({d0*CELL_M:.0f}m)")

    comp_id, comps = components(grid)
    mid = comp_id[sy0][sx0]
    main_cells = comps[mid]
    main_set = set(main_cells)
    print(f"station component size {len(main_cells)}")

    def nearest_in_main(c, r):
        best = None
        best_d = 1e18
        for x, y in main_cells:
            d = abs(x - c) + abs(y - r)
            if d < best_d:
                best_d = d
                best = (x, y)
        return best, best_d

    lm_cells = [(sx0, sy0)]
    for lm in LANDMARKS[1:]:
        c, r = latlon_to_cell(lm["lat"], lm["lon"], origin)
        (sx, sy), d = nearest_in_main(c, r)
        print(f"landmark {lm['name']}: raw={(c,r)} nearest-road-in-network=({sx},{sy}) dist={d} cells ({d*CELL_M:.0f}m)")
        lm["raw_cell"] = [c, r]
        lm["cell"] = [sx, sy]
        lm["snap_cells"] = d
        lm["snap_meters"] = round(d * CELL_M, 1)
        lm_cells.append((sx, sy))

    start = (sx0, sy0)

    # Drop tiny disconnected components (keep only main)
    h, w = len(grid), len(grid[0])
    for y in range(h):
        for x in range(w):
            if grid[y][x] == 0 and comp_id[y][x] != mid:
                grid[y][x] = 1

    cropped, ox, oy = crop(grid, main_cells, pad=2)
    print(f"cropped offset ({ox},{oy}) -> {len(cropped[0])}x{len(cropped)}")

    def adj(p):
        return [p[0] - ox, p[1] - oy]

    for lm in LANDMARKS:
        lm["cell"] = adj(lm["cell"])
        lm["raw_cell"] = adj(lm["raw_cell"])

    start = tuple(LANDMARKS[0]["cell"])
    far, reachable = farthest_cells(cropped, start, k=12)
    print("reachable", reachable, "far samples", far[:4])
    # Spread 4 enemies: prefer cells near other landmarks, else far quadrants.
    enemies = []
    used = {start}
    for lm in LANDMARKS[1:]:
        lx, ly = lm["cell"]
        # a corridor neighbor a few steps away from the landmark
        cand = None
        best = 1e9
        for x, y, d in far:
            md = abs(x - lx) + abs(y - ly)
            if 2 <= md <= 12 and all(abs(x-ux)+abs(y-uy) >= 6 for ux, uy in used):
                if md < best:
                    best = md
                    cand = (x, y, d)
        if cand:
            enemies.append(cand)
            used.add((cand[0], cand[1]))
        if len(enemies) >= 4:
            break
    for x, y, d in far:
        if len(enemies) >= 4:
            break
        if all(abs(x-ux)+abs(y-uy) >= 8 for ux, uy in used):
            enemies.append((x, y, d))
            used.add((x, y))
    print("enemy seeds", enemies)

    inters = intersections(cropped)
    # Power pellets: prefer 4-way intersections far from each other and not on landmarks
    lmset = {tuple(lm["cell"]) for lm in LANDMARKS}
    fours = [(x, y) for x, y, n in inters if n >= 3 and (x, y) not in lmset and (x, y) != start]
    fours.sort(key=lambda p: -(abs(p[0] - start[0]) + abs(p[1] - start[1])))
    pellets = []
    for p in fours:
        if any(abs(p[0] - qx) + abs(p[1] - qy) < 10 for qx, qy in pellets):
            continue
        pellets.append(list(p))
        if len(pellets) >= 8:
            break
    print("power pellets", len(pellets), "intersections", len(inters))

    ch, cw = len(cropped), len(cropped[0])
    corridor_n = sum(1 for y in range(ch) for x in range(cw) if cropped[y][x] == 0)
    print("corridor tiles", corridor_n)

    # Sparse dots so a real-map stage is finishable (~Pac-Man length x 1.5).
    blocked = {tuple(LANDMARKS[0]["cell"])} | {tuple(lm["cell"]) for lm in LANDMARKS}
    blocked |= {tuple(p) for p in pellets}
    dot_cells = []
    for y in range(ch):
        for x in range(cw):
            if cropped[y][x] != 0 or (x, y) in blocked:
                continue
            if (x + y) % 3 == 0:
                dot_cells.append([x, y])
    print("dot cells", len(dot_cells))

    # ASCII preview (downsampled)
    print("\n--- preview ---")
    marks = {}
    letters = {"station": "S", "nursery": "N", "mandai": "M", "racecourse": "R", "mcdonalds": "K", "benten": "P", "coop": "C", "ohsho": "O", "school": "E", "hoshi": "H", "dentist": "D", "home": "I", "pannel": "B", "kumon": "U", "kumano": "J", "lawson": "L", "jhs": "T", "laundry": "W", "bigboy": "Y", "cocokara": "F", "piano": "A", "swimming": "V"}
    for lm in LANDMARKS:
        marks[tuple(lm["cell"])] = letters[lm["id"]]
    for x, y in pellets:
        marks[(x, y)] = "o"
    step_x = max(1, cw // 80)
    step_y = max(1, ch // 40)
    for y in range(0, ch, step_y):
        row = []
        for x in range(0, cw, step_x):
            if (x, y) in marks:
                row.append(marks[(x, y)])
            elif cropped[y][x] == 1:
                row.append("#")
            else:
                row.append(".")
        print("".join(row))

    origin_out = {
        "lat0": origin["lat0"],
        "lon0": origin["lon0"],
        "minx": origin["minx"] + ox * CELL_M,
        "miny": origin["miny"] + oy * CELL_M,
        "m_lat": origin["m_lat"],
        "m_lon": origin["m_lon"],
        "cell_m": CELL_M,
    }
    area_fills, area_labels = build_area_labels(OSM_PATH, cropped, origin_out)

    data = {
        "name": "にがわステージ",
        "attribution": "© OpenStreetMap contributors",
        "source": "OpenStreetMap, extracted around Hankyu Nigawa Station",
        "cellMeters": CELL_M,
        "stationWiki": {"lat": STATION_WIKI[0], "lon": STATION_WIKI[1]},
        "width": cw,
        "height": ch,
        "grid": ["".join("#" if c == 1 else " " for c in row) for row in cropped],
        "landmarks": LANDMARKS,
        "playerStart": list(start),
        "enemyStarts": [[e[0], e[1]] for e in enemies],
        "powerPellets": pellets,
        "corridorTiles": corridor_n,
        "dots": dot_cells,
        "origin": {
            "lat0": origin["lat0"],
            "lon0": origin["lon0"],
            "minx": origin["minx"] + ox * CELL_M,
            "miny": origin["miny"] + oy * CELL_M,
        },
        "areaFills": area_fills,
        "areaLabels": area_labels,
    }
    OUT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", OUT_PATH, "bytes", OUT_PATH.stat().st_size)


if __name__ == "__main__":
    main()
