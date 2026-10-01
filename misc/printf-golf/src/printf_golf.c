// gcc -O0 -g -no-pie -fno-stack-protector -Wl,-z,norelro printf_golf.c -o printf_golf

#include <stdio.h>
#include <unistd.h>

int main(void) {
    char buf[4096];
    ssize_t n = read(STDIN_FILENO, buf, sizeof(buf) - 1);

    if (n <= 0) {
        return 0;
    }

    buf[n] = '\0';
    printf(buf);
    return 0;
}
