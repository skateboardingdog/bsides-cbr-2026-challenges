#!/usr/bin/env python3

"""
p, s secret

register(idv):
    w = (s + idv)^-1 (mod p)

login(idv, w):
    if w * (s + idv) - 1 == 0 (mod p)
        return idv
    else
        reutrn FAIL

We recover p first:

w_i = register(i) = (s + i)^-1 (mod p)
w_j = register(j) = (s + j)^-1 (mod p)

Therefore,

w_i (s + i) - 1 = 0 (mod p)
w_j (s + j) - 1 = 0 (mod p)

We can eliminate s to get:

w_j w_i (s + i) - w_j = 0 (mod p)
w_i w_j (s + j) - w_i = 0 (mod p)

E_ij = w_i w_j (i - j) - (w_j - w_i) = 0 (mod p)

If we do this again for two different identity values, we get two values
that have p as a common factor.

Given p, we can recover s by computing

s = w^-1 - idv (mod p)

for a given idv and w.

We can then compute the admin token and login!
"""

from pwn import *
from math import gcd

conn = process('../publish/server.py')
[conn.recvline() for _ in range(3)]

ids = [1, 2, 3, 4]
ws = []
for idv in ids:
    conn.sendlineafter(b"> ", f"r {idv}".encode())
    line = conn.recvline().strip().decode()
    ws.append(int(line.split()[1]))

E = lambda i, j: ws[i] * ws[j] * (ids[i] - ids[j]) - (ws[j] - ws[i])

p = gcd(E(0, 1), E(1, 2), E(2, 3))
for k in range(10000, 2, -1):
    if p % k == 0:
        p //= k
print(f"recovered {p = }")
s = (pow(ws[0], -1, p) - 1) % p
print(f"recovered {s = }")

admin_token = pow(s + 0x1337, -1, p)
conn.sendlineafter(b"> ", f"l {0x1337} {admin_token}".encode())
print(conn.recvline().decode().split('accept: ')[1])
