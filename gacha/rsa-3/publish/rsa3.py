# p and q are rather close together. What would Fermat do?
#
# Python's math.isqrt() may be useful.

from Crypto.Util.number import bytes_to_long, getPrime, isPrime
from random import getrandbits

FLAG = b"skbdg{??????????????????????????}"
m = bytes_to_long(FLAG)

p = getPrime(256)
q = p + getrandbits(67)
while not isPrime(q):
    q += 1

n = p * q
e = 65537
c = pow(m, e, n)

print(f"{n = }")
print(f"{e = }")
print(f"{c = }")

"""
n = 4208695110591946870017709165399700537435209583234331619934118559559738325046125643728237049906595862627007123874891613316102936385594660643440792119908571
e = 65537
c = 2130907772194912086047823718371884804446332622810989238824474170574461278316970112785657420282405794496656925199632552643400054439291828812006042077411861
"""
