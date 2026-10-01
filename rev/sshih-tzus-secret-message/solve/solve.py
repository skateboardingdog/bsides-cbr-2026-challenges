import argparse
import asyncio
import asyncssh
import logging

from asyncssh.packet import SSHPacketHandler
from asyncssh.connection import SSHConnection
from asyncssh.packet import SSHPacket


"""
Idea is that SSH allows for custom SSH messages - https://www.rfc-editor.org/info/rfc4250/

This challenge is based on tinyssh, which is open source - https://github.com/janmojzis/tinyssh/tree/master

This makes navigating the binary when reversing much easier. But this challenge has been modified so that post authentication, only one SSH message type is accepted.

Simply send the custom message type to win.
"""
CUSTOM_MESSAGE = 0x70
SSH_FLAG = 0x71

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("-k", "--key", required=True)
    parser.add_argument("-u", "--user", required=True)
    parser.add_argument("-H", "--host", required=True)
    parser.add_argument("-p", "--port", type=int, default=22)
    args = parser.parse_args()

    # sketchy patch to override default asyncssh behaviour
    orig_init = SSHPacket.__init__
    def patched_init(self, packet):
        if packet:
            pkttype = packet[0]
            if pkttype == SSH_FLAG:
                print(f"{packet[5:].decode()}")
        return orig_init(self, packet)
    SSHPacket.__init__ = patched_init

    async with asyncssh.connect(
        args.host,
        port=args.port,
        username=args.user,
        client_keys=[args.key],
        client_factory=lambda: asyncssh.SSHClient(),
        known_hosts=None,
    ) as conn:
        conn.set_keepalive(1)
        conn.send_packet(CUSTOM_MESSAGE)
        await conn.wait_closed()

if __name__ == "__main__":
    asyncio.run(main())