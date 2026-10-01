#!/usr/bin/env python3

import os, secrets
from Crypto.Util.number import getPrime

FLAG = os.getenv("FLAG", "skbdg{testflag}")

ADMIN_ID = 0x1337

p = getPrime(768)
s = secrets.randbelow(p)

def register(idv):
    if not (0 <= idv < (1 << 64)):
        print("error: invalid id")
        return
    if idv == ADMIN_ID:
        print("error: invalid id")
        return
    try:
        w = pow(s + idv, -1, p)
        print(f"token: {w}")
    except ValueError:
        print("error: something went wrong")
        return


def login(idv, w):
    if (w * (s + idv) - 1) % p != 0:
        print("error: invalid credential")
        return
    if idv == ADMIN_ID:
        print(f"accept: {FLAG}")
    else:
        print("accept: welcome member!")


def main():
    print("login page!")
    print("[r]egister <id>")
    print("[l]ogin <id> <token>")
    while True:
        inp = input("> ")
        cmd, *args = inp.split()
        match cmd.lower():
            case "r":
                idv = int(args[0])
                register(idv)
            case "l":
                idv = int(args[0])
                token = int(args[1])
                login(idv, token)

if __name__ == "__main__":
    main()
