// ROP 3 - Chain all the things
//
// Same as ROP 2, but this time you don't get "/bin/sh".
// But you have write-what-where instead, so go and construct your own!
// Remember: a gadget doesn't have to start at the beginning of gadget().
//
// x86-64 / ROP primer: https://ropemporium.com/guide.html
// Compile: gcc rop3.c -w -no-pie -fno-stack-protector -o rop3

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

void gadget() {
    asm("mov %rsi, (%rdi); xchg %rdi, %rsi; pop %rdi; ret;");
}

void vuln(void) {
    char buf[16];
    read(0, buf, 256);
}

int main() {
    setvbuf(stdin,  NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);
    system("echo Welcome to ROP 3");
    vuln();
}
