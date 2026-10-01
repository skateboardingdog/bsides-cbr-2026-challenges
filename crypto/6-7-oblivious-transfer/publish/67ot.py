#!/usr/bin/env python3

import os
from math import prod
from secrets import randbelow
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

FLAG = os.getenvb(b'FLAG', b'skbdg{????????????????????????????????????????????????????????????}')
assert len(FLAG) == 67

print(r'''
╭─────────────────────────────────────────────────────────────────╮
│                                                                 │
│           ___    ▄▄  _ _       _                                │
│          / _ \ ▄█▀  | (_)_   _(_) ___  _   _ ___                │
│         | | | |████▄| | \ \ / / |/ _ \| | | / __|               │
│         | |_| |██ ██| | |\ V /| | (_) | |_| \__ \               │
│          \___/ ▀███▀|_|_| \_/ |_|\___/ \__,_|___/               │
│                out of                     __                    │
│                ▄█▀▀██_ __ __ _ _ __  ___ / _| ___ _ __          │
│                   ▄█▀ '__/ _` | '_ \/ __| |_ / _ \ '__|         │
│                  ▄█▀| | | (_| | | | \__ \  _|  __/ |            │
│                 ▄█▀ |_|  \__,_|_| |_|___/_|  \___|_|            │
│                 ▀                                               │
│                                                                 │
│      Welcome to the 6-out-of-7 Oblivious Transfer service!      │
╰─────────────────────────────────────────────────────────────────╯
''')

# Split the flag into seven shares -- having all seven gives you the flag!
shares = [os.urandom(67) for _ in range(6)]
shares.append(bytes(a^b^c^d^e^f^z for a,b,c,d,e,f,z in zip(*shares,FLAG)))

# Discrete log prime subgroup
p = 2**1279 - 1
q = 581211581_67_345470_67_67_3490730717101265_67
g = pow(67, p//q, p)
assert g != 1 and pow(g, q, p) == 1

# Server-side secret
x = randbelow(q)
h = pow(g, x, p)
print(f'{h = }')

# 6-out-of-7 Oblivious Transfer protocol:
# To receive all shares except i, choose random a[j] and set y[j] = g^a[j] for j != i.
# Then choose y[i] so their product is h. You can decrypt six shares by using h^a[j].
ys = list(map(int, input('Enter ys: ').split(',')))
assert len(ys) == 7 and prod(ys) % p == h, "Invalid ys"

print('Here are the seven encrypted shares:')
for y, share in zip(ys, shares):
    shared_secret = pow(y, x, p)
    key = shared_secret.to_bytes(160)[-32:]
    ct = AES.new(key, AES.MODE_ECB).encrypt(pad(share, 16))
    print(ct.hex())
