from sage.all import *
from pwn import *
from Crypto.Cipher import AES
from sage.groups.generic import discrete_log

p = 2**1279 - 1
q = 581211581_67_345470_67_67_3490730717101265_67
F = GF(p, proof=False)
g = F(67)**(p//q)
es = [34934, 35791, 66457, 93367, 102241, 228479]

ys = [F(3)**(p//e) for e in es]
io = remote('localhost', 1337)
io.readuntil(b'h = ')
h = GF(p)(io.readline())
ys.append(h/prod(ys))

io.sendline(','.join(map(str,ys)).encode())
io.readline()
cts = [bytes.fromhex(io.readline().decode()) for _ in range(7)]

res = [next(i for i in range(e) if AES.new((y**i).to_bytes()[-32:], AES.MODE_ECB).decrypt(ct).endswith(b'\r'*13)) for e, y, ct in zip(es, ys, cts)]

pes = prod(es)
c = crt(res,es)
x = discrete_log(h/g**c, g**pes, ord=q, bounds=(0, (q-c)//pes))*pes + c
assert g**x == h

pts = [AES.new((y**x).to_bytes()[-32:], AES.MODE_ECB).decrypt(ct) for y,ct in zip(ys,cts)]
pt = bytes(a^b^c^d^e^f^z for a,b,c,d,e,f,z in zip(*pts))
print(pt)