// ROP 1 - Baby's first ROP
//
// vuln() has a stack overflow: it reads 256 bytes into a 16-byte buffer.
// This lets your overwrite the "saved return address" with somewhere of your choosing.
// Conveniently, win() gives you a shell from which you can "cat flag.txt" or similar.
//
// Python + pwntools is highly recommended for this task. Something like:
//     from pwn import *
//     io = process('./rop1') # or later: io = remote('HOST', PORT)
//     offset = ??
//     win_address = 0x??????
//     payload = b'A' * offset + p64(win_address)
//     io.sendafter(b'ROP 1', payload)
//     io.interactive()
//
// What's left then is to open up a debugger/disassembler in order to:
//     1. Find the offset from buf to the saved return address
//     2. Find the address of win()
//
// x86-64 / ROP primer: https://ropemporium.com/guide.html
// Compile: gcc rop1.c -w -no-pie -fno-stack-protector -o rop1

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

__attribute__((force_align_arg_pointer))
void win() {
    system("/bin/sh");
}

void vuln(void) {
    char buf[16];
    read(0, buf, 256);
}

int main() {
    setvbuf(stdin,  NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);
    system("echo Welcome to ROP 1");
    vuln();
}
