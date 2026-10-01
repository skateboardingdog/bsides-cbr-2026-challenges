#include <stdio.h>
#include <stdlib.h>
#include <pthread.h>
#include <unistd.h>

#define TSIZE 0x940

void win() {
    system("/bin/sh");
}

void *thread_func(void *arg) {
    pthread_t self = pthread_self();

    printf("My pthread @ %p: ", (void*)self);

    for (size_t i = 0; i < TSIZE; i++) {
        printf("%02x", ((unsigned char*)self)[i]);
    }
    printf("\n");

    puts("Now, give me your pthread:");
    read(0, (void*)self, TSIZE);

    pthread_exit(NULL);
    return NULL;
}

int main() {
    setvbuf(stdout, NULL, _IONBF, 0);
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);

    pthread_t t;
    pthread_create(&t, NULL, thread_func, win);
    pthread_join(t, NULL);
    return 0;
}
