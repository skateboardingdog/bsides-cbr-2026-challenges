// ROP 2 - Using your first gadget
//
// Same overflow as ROP 1, but now there's no win(). You have to assemble it yourself.
//
// In the x86-64 ABI the first argument is in RDI.
// You can use the "pop rdi" gadget to pop a value from the stack into RDI.
// So your payload is roughly [ gadget address | binsh address | system@plt ].
//
// Note that the stack might need to be 16-byte aligned to use system().
// In that case just pad it with an extra ret gadget to shift the stack 8 bytes.
//
// x86-64 / ROP primer: https://ropemporium.com/guide.html
// Compile: gcc rop2.c -w -no-pie -fno-stack-protector -o rop2

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

char binsh[] = "/bin/sh";

void gadget() {
    asm("pop %rdi; ret;");
}

void vuln(void) {
    char buf[16];
    read(0, buf, 256);
}

int main() {
    setvbuf(stdin,  NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);
    system("echo Welcome to ROP 2");
    vuln();
}
