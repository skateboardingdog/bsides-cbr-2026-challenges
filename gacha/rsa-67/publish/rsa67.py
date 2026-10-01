# This is the final boss of the series. You are given the integer part of p^(6/7).
#
# Hint: How many of the top bits of p can you recover? Can you recover the rest?
#
# SageMath is recommended for this challenge.

from Crypto.Util.number import bytes_to_long, getPrime
from gmpy2 import iroot

FLAG = b"skbdg{??????????????????????????????????}"
m = bytes_to_long(FLAG)

p = getPrime(256)
q = getPrime(256)
n = p * q
e = 65537
c = pow(m, e, n)

p67 = int(iroot(p**6, 7)[0])

print(f"{n = }")
print(f"{e = }")
print(f"{c = }")
print(f"{p67 = }")

"""
n = 7202182629848166191658914566003001457751483795584620856835111901303304263504952211013993399973448245877364741537562098590809153440623638773383687363022263
e = 65537
c = 5714427688003899389515016198250334401813386721154379130442076106903838595793778491204674265545257524637861031214521891174085517417865058936030312125923140
p67 = 892597420992830084952632837032489689740253740224086714221869385416
"""
