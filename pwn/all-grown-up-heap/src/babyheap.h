/*
 * babyheap.h — public API for the babyheap teaching allocator.
 *
 * babyheap intentionally defines the standard C allocation functions so the
 * implementation can be linked directly into a target, as shown in the Makefile.
 */
#ifndef BABYHEAP_H
#define BABYHEAP_H

#include <stddef.h>

void *malloc(size_t size);
void  free(void *ptr);
void *calloc(size_t nmemb, size_t size);
void *realloc(void *ptr, size_t size);

#endif /* BABYHEAP_H */
