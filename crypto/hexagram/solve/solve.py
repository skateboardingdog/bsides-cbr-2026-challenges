#!/usr/bin/env python3

# This challenge is based on some weird quirks in Python's standard
# base64 library.
#
# By default, the library does two weird things:
# - it ignores any byte that isn't part of the expected base64 character set
# - if the base64 string ends in padding, it ignores anything after the padding character
#
# These idiosyncrasies go away if you pass `validate=True`, which some
# applications forget because it's non-default. The latter behaviour was fixed
# in a breaking change in Feb 2026
# (https://github.com/python/cpython/issues/145264), but this hasn't been
# backported to older Python versions.
#
# In a crypto context, this lenient parsing allows us to do two things:
# - If a base64 string ends in padding, we can stuff arbitrary data after it and
#   still have it decode to its orignal value. This allows us to insert
#   uncontrolled data after a base64 string and still have it decode without
#   errors.
# - If we need to have uncontrolled random data in the middle of base64 string,
#   we have good chance (~1% for a 128-bit block) that our random data will contain no valid base64
#   characters, and hence decode to the empty string. Using this, we can insert
#   uncontrolled data inside a base64 string without causing errors.


from pwn import *
import os
import json
import string

from base64 import b64decode, b64encode, urlsafe_b64decode, urlsafe_b64encode
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad


BLOCK_SIZE = 16


def split_blocks(b):
    return [b[i : i + BLOCK_SIZE] for i in range(0, len(b), BLOCK_SIZE)]


def join_blocks(b):
    return b"".join(b)


def submit(conn, queries):
    to_send = b" ".join(q.hex().encode() for q in queries)
    conn.sendlineafter(b"what is your answer: ", to_send)

    answer = recv_value(conn, b"very interesting:").split()
    return answer


def oracle(conn, prefix, suffixes):
    query = [prefix + s for s in suffixes]
    answer = submit(conn, query)
    return [a != "unknown" for a in answer]


def ecb_decrypt_block(conn, prefix, ct_block):
    intermediate = bytearray(BLOCK_SIZE)

    for pad_val in range(1, BLOCK_SIZE + 1):
        pos = BLOCK_SIZE - pad_val
        base = bytearray(BLOCK_SIZE)

        for i in range(pos + 1, BLOCK_SIZE):
            base[i] = intermediate[i] ^ pad_val

        candidates = []
        for guess in range(256):
            crafted = bytearray(base)
            crafted[pos] = guess
            candidates.append(bytes(crafted))

        results = oracle(conn, prefix, [c + ct_block for c in candidates])

        found = False
        for guess, ok in enumerate(results):
            if ok:
                intermediate[pos] = guess ^ pad_val
                found = True
                break

        if not found:
            raise RuntimeError(f"not valid {pos = }, {pad_val = }")

    return bytes(intermediate)


def cbc_encrypt(conn, prefix, plaintext):
    blocks = split_blocks(plaintext)
    n = len(blocks)

    C = [None] * n
    C[n - 1] = os.urandom(BLOCK_SIZE)

    prev = C[n - 1]
    for i in range(n - 1, 0, -1):
        C[i - 1] = xor(ecb_decrypt_block(conn, prefix, prev), blocks[i])
        prev = C[i - 1]

    iv = xor(ecb_decrypt_block(conn, prefix, C[0]), blocks[0])
    return iv, b"".join(C)


def cbc_decrypt(conn, prefix, ciphertext):
    blocks = split_blocks(ciphertext)

    plaintext = b""
    for i in range(1, len(blocks)):
        prev_block, cur_block = blocks[i - 1], blocks[i]
        intermediate = ecb_decrypt_block(conn, prefix, cur_block)
        plain_block = xor(intermediate, prev_block)
        plaintext += plain_block
        print("plaintext = ", b64decode(plaintext))

    return b64decode(plaintext)


def aes128kw_unwrap(conn, prefix, wrapped, iv=bytes.fromhex("A6A6A6A6A6A6A6A6")):
    n = len(wrapped) // 8 - 1
    A = wrapped[:8]
    R = [wrapped[8 + 8 * i : 16 + 8 * i] for i in range(n)]

    for j in range(5, -1, -1):
        for i in range(n, 0, -1):
            t = n * j + i
            t_bytes = t.to_bytes(8, "big")
            A_xor_t = xor(A, t_bytes)
            B = ecb_decrypt_block(conn, prefix, A_xor_t + R[i - 1])
            A = B[:8]
            R[i - 1] = B[8:]

    if A != iv:
        raise RuntimeError("wrong iv")

    return b"".join(R)


def recv_value(conn, prefix):
    return conn.recvline_startswith(prefix).decode().split(":")[-1].strip()


def main():
    conn = name = passphrase = None
    # keep trying new connections until we get a name such that
    # jose(name) ends in a padding character
    while True:
        conn = connect("localhost", 1337)
        name = recv_value(conn, b"your name is:")
        if len(name) not in {1, 6, 8, 10, 15, 17, 19, 24, 26}:
            break
    passphrase = recv_value(conn, b"your passphrase is:")
    prefix = bytes.fromhex(recv_value(conn, b"here is your initialisation:"))

    # use decrypt oracle to get JWE
    pt = b'{"ciphertext' + cbc_decrypt(conn, prefix, prefix)
    jwe = json.loads(pt.decode())

    # use the decrpypt oracle again to get the unwrapped key
    key = aes128kw_unwrap(conn, prefix, urlsafe_b64decode(jwe["encrypted_key"]))

    # use the key to encrypt a json blob with the passphrase
    iv = urlsafe_b64decode(jwe["iv"])
    cipher = AES.new(mode=AES.MODE_GCM, nonce=iv, key=key)
    cipher.update(jwe["protected"].encode())
    ct, tag = (
        urlsafe_b64encode(b).rstrip(b"=").decode()
        for b in cipher.encrypt_and_digest(passphrase.encode())
    )
    new_jwe = jwe | {"ciphertext": ct, "tag": tag}

    # we can't control the iv, so we don't have control over the first block
    # it's a ~1/100 chance for a random block to have no valid base64 chars.
    # so this is tractable to brute force.
    new_pt = b64encode(json.dumps(new_jwe).encode())
    iv, send = cbc_encrypt(conn, prefix, pad(bytes(16) + new_pt, BLOCK_SIZE))
    while True:
        candidates = [os.urandom(16) + send for _ in range(1000)]
        answer = submit(conn, candidates)
        for a in answer:
            if "skbdg" in a:
                print(a)
                return


if __name__ == "__main__":
    main()
