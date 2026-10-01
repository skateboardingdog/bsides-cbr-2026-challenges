#!/usr/bin/env python3

import os
import secrets
import json
from base64 import b64decode, b64encode
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from joserfc.jwk import OctKey
from joserfc import jwe

FLAG = os.getenv("FLAG", "skbdg{test_flag}")
KEY = secrets.token_bytes(16)
IV = secrets.token_bytes(16)
JWE_KEY = OctKey.import_key(KEY)


def randb64():
    length = secrets.randbelow(10) + 5
    return b64encode(secrets.token_bytes(length)).decode()


def json_dumps(o):
    return json.dumps(o, sort_keys=True).encode()


def encrypt(pt):
    cipher = AES.new(mode=AES.MODE_CBC, key=KEY, iv=IV)
    ciphertext = cipher.encrypt(pad(pt, cipher.block_size))
    return ciphertext


def decrypt(ct):
    cipher = AES.new(mode=AES.MODE_CBC, key=KEY, iv=IV)
    plaintext = unpad(cipher.decrypt(ct), cipher.block_size)
    return plaintext


def jose(pt):
    obj = jwe.FlattenedJSONEncryption({"enc": "A128GCM"}, pt.encode())
    obj.add_recipient({"alg": "A128KW"}, None)
    return jwe.encrypt_json(obj, JWE_KEY)


def unjose(obj):
    return jwe.decrypt_json(obj, JWE_KEY)


def hexagramify(pt):
    return encrypt(b64encode(json_dumps(jose(pt))))


def unhexagramify(ct, passphrase):
    try:
        answer = unjose(json.loads(b64decode(decrypt(ct)))).plaintext
        if answer == passphrase.encode():
            return FLAG
        else:
            return "hmm"
    except Exception as e:
        return "unknown"


def main():
    print("-- are you in harmony with the 64 hexagrams? -- ")

    name = f"name|{randb64()}"
    passphrase = f"pass|{randb64()}"

    print(f"your name is: {name}")
    print(f"your passphrase is: {passphrase}")
    print("here is your initialisation:", hexagramify(name).hex())

    while True:
        query = map(bytes.fromhex, input("what is your answer: ").split())
        answer = " ".join(unhexagramify(q, passphrase) for q in query)
        print("very interesting:", answer)


if __name__ == "__main__":
    main()
