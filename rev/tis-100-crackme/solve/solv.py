key = [20, 221, 174, 83, 164, 215, 72, 206, 197, 120, 240, 106, 29, 64, 47, 93]

def prefix_sum(xs):
    acc = 0
    out = []
    for x in xs:
        acc = (acc + x) % 256
        out.append(acc)
    return out

def pack(bs):
    x = 0
    for b in bs:
        x = (x << 1) | b
    return x

enc = [255 - x for x in prefix_sum(key)][::-1]
enc = [int(x) for x in ''.join([bin(x)[2:].zfill(8) for x in enc])]

xs = []
prev = 0

for b in enc:
    prev ^= b
    xs.append(prev)

for i in range(0, len(xs), 2):
    xs[i], xs[i + 1] = xs[i + 1], xs[i]

sums = [pack(xs[i:i + 8]) for i in range(0, len(xs), 8)]

pw = [sums[0]]

for i in range(1, len(sums)):
    pw.append((sums[i] - sums[i - 1]) & 0xff)

print(bytes(pw).decode())
