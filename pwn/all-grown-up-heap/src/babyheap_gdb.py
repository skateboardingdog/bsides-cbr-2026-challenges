"""
babyheap_gdb.py - on-demand ANSI visualizer for the babyheap allocator.

Usage:
    $ make
    $ gdb ./notemanager
    (gdb) source babyheap_gdb.py
    (gdb) start
    (gdb) babyheap

The command is read-only and idempotent: it never writes target memory or sets
breakpoints.
Run `babyheap` whenever the inferior is stopped.
"""

import re
import struct
import gdb

# ---------------------------------------------------------------- config
# Compile-time constants babyheap does not expose as symbols. Keep these in
# sync with babyheap.c (the ONLY thing that must be kept in sync; struct
# layout and the size table are read live from debug info / symbols).
SLAB_SIZE    = 64 * 1024
REGION_MAGIC = 0xBABE12345678C0DE
KIND_SLAB    = 1
KIND_LARGE   = 2

MASK64    = (1 << 64) - 1
GRID_COLS = 64        # chunks per rendered row
GRID_MAX  = 2048      # slabs bigger than this collapse to run-length by default
MAP_PROBE_CAP = 200000  # safety bound on aligned-address probes

C = {
    "used":  "\033[1;32m",
    "free":  "\033[2;37m",
    "hdr":   "\033[1;36m",
    "flag":  "\033[1;31m",
    "dim":   "\033[2m",
    "reset": "\033[0m",
}


def col(enabled, key, text):
    return f"{C[key]}{text}{C['reset']}" if enabled else text


# ---------------------------------------------------------------- helpers
def _inferior():
    inf = gdb.selected_inferior()
    if inf is None or not inf.is_valid() or inf.pid == 0:
        raise gdb.GdbError("no running inferior - `run` the program first")
    return inf


def _read(inf, addr, n):
    """Length-checked read; returns bytes or raises gdb.MemoryError."""
    return bytes(inf.read_memory(addr, n))


def _u64(b):
    return struct.unpack("<Q", b)[0]


def _hdr_type():
    # The typedef and the underlying struct live only in babyheap's
    # translation unit. Try the typedef, then the struct (a stripped/partial
    # CU sometimes keeps only the tagged type).
    for name in ("region_header_t", "struct region_header"):
        try:
            return gdb.lookup_type(name)
        except gdb.error:
            pass
    # slab_lists is a babyheap-unique global; libc has no such symbol, so it
    # is a reliable "is babyheap actually here?" probe (unlike `malloc`,
    # which libc also defines).
    babyheap_linked = False
    try:
        gdb.parse_and_eval("slab_lists")
        babyheap_linked = True
    except gdb.error:
        pass
    hint = ("babyheap IS linked (slab_lists found) but has no type debug "
            "info - rebuild babyheap with -g (use the Makefile)."
            if babyheap_linked else
            "babyheap is not in this program - link babyheap.o into the "
            "target and start it before running `babyheap`.")
    raise gdb.GdbError(
        "region_header_t not found: " + hint +
        " Check: info sharedlibrary | info types region_header | p &slab_lists")


def _bitmap_offset(hdr_t):
    for f in hdr_t.fields():
        if f.name == "bitmap":
            return f.bitpos // 8
    raise gdb.GdbError("region_header_t has no 'bitmap' field")


def _field(val, name):
    return int(val[name])


def _expected_magic(addr):
    return (REGION_MAGIC ^ addr) & MASK64


def _popcount_bits(buf, nbits):
    """Count set bits among the first nbits bits of buf (LSB-first per byte)."""
    cnt = 0
    full = nbits // 8
    for i in range(full):
        cnt += bin(buf[i]).count("1")
    rem = nbits & 7
    if rem:
        cnt += bin(buf[full] & ((1 << rem) - 1)).count("1")
    return cnt


def human(n):
    units = ["B", "KiB", "MiB", "GiB", "TiB"]
    f = float(n)
    i = 0
    while f >= 1024 and i < len(units) - 1:
        f /= 1024.0
        i += 1
    return f"{n} B" if i == 0 else f"{f:.1f} {units[i]}"


# ---------------------------------------------------------------- model
class Slab:
    __slots__ = ("addr", "ci", "chunk_size", "total", "free_count",
                 "data_off", "map_size", "used_bits", "bitmap", "flags",
                 "readable")

    def __init__(self, addr):
        self.addr = addr
        self.flags = []
        self.readable = True


class Large:
    __slots__ = ("addr", "user", "map_size", "usable")


def _load_slab(inf, hdr_t, hptr_t, bm_off, addr, ci_hint=None):
    s = Slab(addr)
    try:
        v = gdb.Value(addr).cast(hptr_t).dereference()
        magic = _field(v, "magic") & MASK64
        if magic != _expected_magic(addr):
            s.flags.append("CORRUPT(magic)")
        s.ci         = _field(v, "class_index")
        s.chunk_size = _field(v, "chunk_size")
        s.total      = _field(v, "total_chunks")
        s.free_count = _field(v, "free_chunks")
        s.data_off   = _field(v, "data_off")
        s.map_size   = _field(v, "map_size")
        if not (0 < s.total <= SLAB_SIZE):
            s.flags.append("CORRUPT(total_chunks)")
            s.total = max(0, min(s.total, SLAB_SIZE))
        nbytes = (s.total + 7) // 8
        s.bitmap = _read(inf, addr + bm_off, nbytes) if s.total else b""
        s.used_bits = _popcount_bits(s.bitmap, s.total)
        if s.used_bits != s.total - s.free_count:
            s.flags.append(
                f"DESYNC(bitmap used={s.used_bits} vs total-free="
                f"{s.total - s.free_count})")
    except gdb.MemoryError:
        s.readable = False
        s.flags.append("UNREADABLE")
    return s


def collect(inf):
    hdr_t  = _hdr_type()
    hptr_t = hdr_t.pointer()
    bm_off = _bitmap_offset(hdr_t)

    lists = gdb.parse_and_eval("slab_lists")
    lo, hi = lists.type.range()
    num_classes = hi - lo + 1

    try:
        sizes_v = gdb.parse_and_eval("class_sizes")
        class_sizes = [int(sizes_v[i]) for i in range(num_classes)]
    except gdb.error:
        class_sizes = [None] * num_classes

    per_class = [[] for _ in range(num_classes)]
    slab_addrs = set()
    global_flags = []

    for ci in range(num_classes):
        node = int(lists[ci])
        seen = set()
        walked = 0
        while node:
            if node in seen:
                global_flags.append(
                    f"CYCLE in class {ci} slab list @ {node:#x}")
                break
            if walked > 100000:
                global_flags.append(f"RUNAWAY class {ci} slab list")
                break
            seen.add(node)
            slab_addrs.add(node)
            s = _load_slab(inf, hdr_t, hptr_t, bm_off, node)
            per_class[ci].append(s)
            try:
                nxt = int(gdb.Value(node).cast(hptr_t).dereference()["next"])
            except gdb.MemoryError:
                global_flags.append(f"UNREADABLE next @ {node:#x}")
                break
            node = nxt
            walked += 1
        per_class[ci].reverse()  # oldest first for stable pictures

    # Large + orphan discovery by probing SLAB_SIZE-aligned addresses across
    # every mapping (VMAs may be merged, so we cannot trust mapping starts).
    larges = []
    orphan_slabs = []
    probes = 0
    capped = False
    for start, end in get_mappings():
        if capped:
            break
        a = (start + SLAB_SIZE - 1) & ~(SLAB_SIZE - 1)
        while a + 8 <= end:
            if probes >= MAP_PROBE_CAP:
                global_flags.append("probe cap hit; some regions may be hidden")
                capped = True
                break
            probes += 1
            try:
                magic = _u64(_read(inf, a, 8))
            except gdb.MemoryError:
                a += SLAB_SIZE
                continue
            if magic == _expected_magic(a):
                try:
                    v = gdb.Value(a).cast(hptr_t).dereference()
                    kind = _field(v, "kind")
                    if kind == KIND_LARGE:
                        lg = Large()
                        lg.addr = a
                        lg.map_size = _field(v, "map_size")
                        do = _field(v, "data_off")
                        lg.user = a + do
                        lg.usable = lg.map_size - do
                        larges.append(lg)
                    elif kind == KIND_SLAB and a not in slab_addrs:
                        orphan_slabs.append(
                            _load_slab(inf, hdr_t, hptr_t, bm_off, a))
                except gdb.MemoryError:
                    pass
            a += SLAB_SIZE

    try:
        zero_ptr = int(gdb.parse_and_eval("&zero_marker"))
    except gdb.error:
        zero_ptr = None

    return {
        "num_classes": num_classes,
        "class_sizes": class_sizes,
        "per_class": per_class,
        "larges": larges,
        "orphans": orphan_slabs,
        "zero_ptr": zero_ptr,
        "global_flags": global_flags,
    }


def get_mappings():
    """Return list of (start, end) for the inferior's mapped regions."""
    try:
        txt = gdb.execute("info proc mappings", to_string=True)
    except gdb.error:
        return []
    out = []
    for line in txt.splitlines():
        m = re.match(r"\s*(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)", line)
        if m:
            out.append((int(m.group(1), 16), int(m.group(2), 16)))
    return out


# ---------------------------------------------------------------- render
def render_grid(out, s, color, full):
    if not s.readable:
        out.append("    " + col(color, "flag", f"UNREADABLE @ {s.addr:#x}"))
        return
    if s.total > GRID_MAX and not full:
        # Run-length collapse.
        runs = []
        i = 0
        while i < s.total:
            bit = (s.bitmap[i >> 3] >> (i & 7)) & 1
            j = i + 1
            while j < s.total and ((s.bitmap[j >> 3] >> (j & 7)) & 1) == bit:
                j += 1
            label = "used" if bit else "free"
            runs.append(col(color, "used" if bit else "free",
                            f"{label}x{j - i}"))
            i = j
        out.append("    " + " ".join(runs)
                   + col(color, "dim", f"   ({s.total} chunks; `full` for grid)"))
        return
    for row0 in range(0, s.total, GRID_COLS):
        row = []
        for i in range(row0, min(row0 + GRID_COLS, s.total)):
            bit = (s.bitmap[i >> 3] >> (i & 7)) & 1
            row.append(col(color, "used", "#") if bit
                       else col(color, "free", "."))
        lbl = col(color, "dim", f"  {row0}..{row0 + len(row) - 1}")
        out.append("    [" + "".join(row) + "]" + lbl)


def render(model, color=True, only_class=None, show_slabs=True,
           show_large=True, show_sentinel=True, full=False):
    out = []
    nc = model["num_classes"]
    sizes = model["class_sizes"]

    tot_slabs = tot_cap = tot_used = 0
    tot_slab_bytes = 0
    all_flags = list(model["global_flags"])

    if show_slabs:
        for ci in range(nc):
            if only_class is not None and ci != only_class:
                continue
            slabs = model["per_class"][ci]
            csz = sizes[ci]
            cap = sum(s.total for s in slabs if s.readable)
            used = sum(s.used_bits for s in slabs if s.readable)
            tot_slabs += len(slabs)
            tot_cap += cap
            tot_used += used
            tot_slab_bytes += len(slabs) * SLAB_SIZE
            pct = f"{(100 * used / cap):.0f}%" if cap else "-"
            head = (f"class[{ci}]  chunk={csz} B   slabs={len(slabs)}   "
                    f"chunks {used}/{cap} used ({pct})")
            out.append(col(color, "hdr", head))
            for s in slabs:
                fl = ""
                if s.flags:
                    fl = "  " + col(color, "flag", " ".join(s.flags))
                    all_flags += [f"class {ci} @ {s.addr:#x}: {x}"
                                  for x in s.flags]
                if s.readable:
                    out.append(
                        f"  slab @ {s.addr:#x}   {s.total} chunks  "
                        f"used {s.used_bits}  free {s.free_count}  "
                        f"data@+{s.data_off:#x}{fl}")
                else:
                    out.append(f"  slab @ {s.addr:#x}{fl}")
                render_grid(out, s, color, full)
            if slabs:
                out.append("")
        out.append(col(color, "dim", "  legend: # used   . free") + "\n")

    if model["orphans"]:
        out.append(col(color, "flag",
                        f"ORPHAN/leaked slabs not on any class list "
                        f"({len(model['orphans'])}):"))
        for s in model["orphans"]:
            out.append(f"  slab @ {s.addr:#x}  class_index={getattr(s,'ci','?')}"
                       f"  used {getattr(s,'used_bits','?')}/"
                       f"{getattr(s,'total','?')}")
            all_flags.append(f"ORPHAN slab @ {s.addr:#x}")
        out.append("")

    tot_large_bytes = 0
    if show_large:
        lg = model["larges"]
        out.append(col(color, "hdr", f"large allocations ({len(lg)})"))
        for x in sorted(lg, key=lambda z: z.addr):
            tot_large_bytes += x.map_size
            out.append(f"  @ {x.addr:#x}  user {x.user:#x}  "
                       f"map {human(x.map_size)}  usable {x.usable} B")
        if not lg:
            out.append(col(color, "dim", "  (none)"))
        out.append("")

    if show_sentinel:
        z = model["zero_ptr"]
        zt = f"{z:#x}" if z is not None else "<unknown>"
        out.append(col(color, "hdr", "malloc(0) sentinel") +
                   f"  ZERO_PTR = {zt}  " +
                   col(color, "dim", "(not a real allocation)"))
        out.append("")

    upct = f"{(100 * tot_used / tot_cap):.0f}%" if tot_cap else "-"
    out.append(col(color, "hdr", "SUMMARY") +
               f"  slabs={tot_slabs}  large={len(model['larges'])}  "
               f"chunk capacity {tot_cap}  used {tot_used} ({upct})")
    out.append(f"         mapped: slabs {human(tot_slab_bytes)} + large "
               f"{human(tot_large_bytes)} = "
               f"{human(tot_slab_bytes + tot_large_bytes)}")
    out.append(col(color, "dim",
                   "         (capacity utilization is exact; per-request "
                   "internal fragmentation is not recoverable)"))
    if all_flags:
        out.append(col(color, "flag",
                       f"         flags: {len(all_flags)} - "
                       + " | ".join(all_flags[:6])
                       + (" ..." if len(all_flags) > 6 else "")))
    return "\n".join(out)


# ---------------------------------------------------------------- command
class BabyheapCmd(gdb.Command):
    """Visualize the babyheap allocator state.

Usage: babyheap [class N] [slabs] [large] [full] [nocolor]
  (no args)  show slabs, large allocations, the sentinel, and a summary
  class N    show only size class N
  slabs      show only slabs
  large      show only large allocations
  full       render the full grid for large slabs
  nocolor    disable ANSI colour"""

    def __init__(self):
        super().__init__("babyheap", gdb.COMMAND_USER)

    def invoke(self, arg, from_tty):
        toks = arg.split()
        color = "nocolor" not in toks
        full = "full" in toks
        only_class = None
        show_slabs = show_large = show_sentinel = True

        if "class" in toks:
            try:
                only_class = int(toks[toks.index("class") + 1])
            except (IndexError, ValueError):
                raise gdb.GdbError("usage: babyheap class N")
            show_large = show_sentinel = False
        if "slabs" in toks:
            show_large = show_sentinel = False
        if "large" in toks:
            show_slabs = show_sentinel = False

        try:
            inf = _inferior()
            model = collect(inf)
        except gdb.GdbError as e:
            raise
        except Exception as e:  # noqa: BLE001 - never dump a traceback at user
            raise gdb.GdbError(f"babyheap: {e}")

        gdb.write(render(model, color=color, only_class=only_class,
                         show_slabs=show_slabs, show_large=show_large,
                         show_sentinel=show_sentinel, full=full) + "\n")


BabyheapCmd()
print("babyheap visualizer loaded - run `babyheap` at any stop")
