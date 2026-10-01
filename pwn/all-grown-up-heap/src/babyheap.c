/*
 * babyheap.c — a single-file slab allocator for teaching.
 *
 * See babyheap.md for the challenge overview and allocator background.
 *
 * Hard rule: babyheap interposes the real malloc, so NOTHING on any code path
 * here may call a function that itself allocates. We use only mmap/munmap,
 * memcpy/memset, and write/abort (the error path). No printf, no stdio.
 *
 * MUST be compiled with -fno-builtin (see Makefile). Otherwise the compiler
 * recognizes the malloc()+memset() inside calloc() as the "calloc idiom" and
 * rewrites it into a call to calloc() — infinite self-recursion.
 */

#define _GNU_SOURCE          /* MAP_ANONYMOUS under -std=c11 */

#include "babyheap.h"

#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>     /* abort */
#include <string.h>     /* memcpy, memset — these do not allocate */
#include <unistd.h>     /* write */
#include <errno.h>
#include <sys/mman.h>   /* mmap, munmap */

/* --------------------------------------------------------- Size classes */
/* Size classes: power-of-two bins 16 .. 4096.                            */

#define ALIGN        16u
#define MIN_CLASS    16u
#define MAX_CLASS    4096u
#define NUM_CLASSES  9
#define SLAB_SIZE    (64u * 1024u)        /* slab size AND slab alignment  */

static const uint32_t class_sizes[NUM_CLASSES] = {
    16, 32, 64, 128, 256, 512, 1024, 2048, 4096
};

#define REGION_MAGIC  0xBABE12345678C0DEull
#define KIND_SLAB     1u
#define KIND_LARGE    2u

/* -------------------------------------------------------- Region header */
/* The header that begins every slab and every large mapping.             */

typedef struct region_header {
    uint64_t  magic;          /* REGION_MAGIC ^ (uintptr_t)self            */
    uint32_t  kind;           /* KIND_SLAB | KIND_LARGE                    */
    uint32_t  class_index;    /* slab: index into class_sizes              */
    uint32_t  chunk_size;     /* slab: bytes per chunk                     */
    uint32_t  total_chunks;   /* slab: chunks in this slab                 */
    uint32_t  free_chunks;    /* slab: chunks currently free               */
    uint32_t  data_off;       /* byte offset of first chunk / user data    */
    size_t    map_size;       /* bytes to munmap (slab or large)           */
    struct region_header *next; /* slab: next slab of the same class       */
    uint8_t   bitmap[];       /* slab: 1 bit per chunk, 1 == in use        */
} region_header_t;

/* Per-class list of slabs. Single-threaded, so a plain global is fine. */
static region_header_t *slab_lists[NUM_CLASSES];

/* malloc(0) sentinel: unique, non-NULL, and never dereferenced. */
static char  zero_marker;
#define ZERO_PTR ((void *)&zero_marker)

/* ------------------------------------------------------------------ */
/* Small helpers.                                                      */

static inline size_t align_up(size_t v, size_t a) {
    return (v + (a - 1)) & ~(a - 1);
}

static inline uint64_t header_magic(region_header_t *h) {
    return REGION_MAGIC ^ (uintptr_t)h;
}

static int bit_get(const uint8_t *bm, uint32_t i) {
    return (bm[i >> 3] >> (i & 7)) & 1;
}
static void bit_set(uint8_t *bm, uint32_t i) {
    bm[i >> 3] |= (uint8_t)(1u << (i & 7));
}
static void bit_clear(uint8_t *bm, uint32_t i) {
    bm[i >> 3] &= (uint8_t)~(1u << (i & 7));
}

/* Loud, non-allocating death for caller bugs. */
static void emit(const char *s, size_t n) {
    while (n) {
        ssize_t w = write(2, s, n);
        if (w <= 0) break;
        s += w; n -= (size_t)w;
    }
}
static void die(const char *msg) {
    emit("babyheap: ", 10);
    emit(msg, strlen(msg));
    emit("\n", 1);
    abort();
}

/* Smallest class index whose size >= max(size, MIN_CLASS); -1 if oversized. */
static int size_class_index(size_t size) {
    size_t need = size < MIN_CLASS ? MIN_CLASS : size;
    for (int i = 0; i < NUM_CLASSES; i++)
        if (class_sizes[i] >= need)
            return i;
    return -1;
}

/* ------------------------------------------------------- Memory mapping */
/* mmap a `len`-byte region aligned to `align` by over-mapping and        */
/* trimming the unaligned prefix and the unused suffix.                   */

static void *mmap_aligned(size_t len, size_t align) {
    size_t over = len + align;
    void *base = mmap(NULL, over, PROT_READ | PROT_WRITE,
                      MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (base == MAP_FAILED)
        return NULL;

    uintptr_t start   = (uintptr_t)base;
    uintptr_t aligned = align_up(start, align);

    size_t prefix = (size_t)(aligned - start);
    size_t suffix = over - prefix - len;

    if (prefix)
        munmap((void *)start, prefix);
    if (suffix)
        munmap((void *)(aligned + len), suffix);

    return (void *)aligned;
}

/* Recover the region header from any user pointer. */
static inline region_header_t *header_of(void *ptr) {
    return (region_header_t *)((uintptr_t)ptr & ~((uintptr_t)SLAB_SIZE - 1));
}

/* ------------------------------------------------------- Slab allocation */
/* Create and initialize a new slab for size class `ci`.                    */

static region_header_t *slab_create(int ci) {
    region_header_t *h = mmap_aligned(SLAB_SIZE, SLAB_SIZE);
    if (!h)
        return NULL;                       /* mmap zeroed the whole slab */

    uint32_t cs  = class_sizes[ci];
    size_t   hdr = sizeof(region_header_t);

    /*
     * The bitmap size depends on the chunk count and vice versa. Start from
     * the no-bitmap upper bound and walk down; the loop body runs only a
     * couple of times because one chunk dwarfs its single bitmap byte.
     */
    uint32_t n = (uint32_t)((SLAB_SIZE - align_up(hdr, ALIGN)) / cs);
    size_t   data_off;
    for (;;) {
        size_t bm_bytes = (n + 7) / 8;
        data_off = align_up(hdr + bm_bytes, ALIGN);
        if (data_off + (size_t)n * cs <= SLAB_SIZE)
            break;
        n--;
    }

    h->magic        = header_magic(h);
    h->kind         = KIND_SLAB;
    h->class_index  = (uint32_t)ci;
    h->chunk_size   = cs;
    h->total_chunks = n;
    h->free_chunks  = n;
    h->data_off     = (uint32_t)data_off;
    h->map_size     = SLAB_SIZE;

    h->next = slab_lists[ci];
    slab_lists[ci] = h;
    return h;
}

/* ------------------------------------------------------ Large allocation */
/* Oversized requests get their own SLAB_SIZE-aligned mapping.             */

static void *large_alloc(size_t size) {
    size_t data_off = align_up(sizeof(region_header_t), ALIGN);
    size_t need     = data_off + size;
    if (need < size)                       /* overflow */
        { errno = ENOMEM; return NULL; }
    size_t map_size = align_up(need, SLAB_SIZE);

    region_header_t *h = mmap_aligned(map_size, SLAB_SIZE);
    if (!h)
        { errno = ENOMEM; return NULL; }

    h->magic    = header_magic(h);
    h->kind     = KIND_LARGE;
    h->data_off = (uint32_t)data_off;
    h->map_size = map_size;

    return (uint8_t *)h + data_off;
}

/* --------------------------------------------------------------- malloc */

void *malloc(size_t size) {
    if (size == 0)
        return ZERO_PTR;
    if (size > MAX_CLASS)
        return large_alloc(size);

    int ci = size_class_index(size);       /* always valid here */

    region_header_t *slab = slab_lists[ci];
    while (slab && slab->free_chunks == 0)
        slab = slab->next;
    if (!slab) {
        slab = slab_create(ci);
        if (!slab)
            { errno = ENOMEM; return NULL; }
    }

    for (uint32_t i = 0; i < slab->total_chunks; i++) {
        if (!bit_get(slab->bitmap, i)) {
            bit_set(slab->bitmap, i);
            slab->free_chunks--;
            return (uint8_t *)slab + slab->data_off + (size_t)i * slab->chunk_size;
        }
    }
    /* free_chunks said there was room but the scan disagrees. */
    die("internal: slab free count inconsistent with bitmap");
    return NULL;                           /* unreachable */
}

/* ----------------------------------------------------------------- free */

void free(void *ptr) {
    if (!ptr || ptr == ZERO_PTR)
        return;

    region_header_t *h = header_of(ptr);
    if (h->magic != header_magic(h))
        die("invalid free: bad or corrupted region header");

    if (h->kind == KIND_LARGE) {
        munmap(h, h->map_size);
        return;
    }
    if (h->kind != KIND_SLAB)
        die("invalid free: unknown region kind");

    uintptr_t data = (uintptr_t)h + h->data_off;
    if ((uintptr_t)ptr < data)
        die("invalid free: pointer before chunk area");

    size_t off = (uintptr_t)ptr - data;
    if (off % h->chunk_size != 0)
        die("invalid free: pointer not on a chunk boundary");

    uint32_t i = (uint32_t)(off / h->chunk_size);
    if (i >= h->total_chunks)
        die("invalid free: pointer past end of slab");
    if (!bit_get(h->bitmap, i))
        die("invalid free: double free");

    bit_clear(h->bitmap, i);
    h->free_chunks++;
    /* Slab retention: emptied slabs are kept on purpose. */
}

/* ------------------------------------------------------ calloc / realloc */

void *calloc(size_t nmemb, size_t size) {
    if (nmemb && size > (size_t)-1 / nmemb)
        { errno = ENOMEM; return NULL; }   /* multiplication overflow */

    size_t total = nmemb * size;
    void *p = malloc(total);
    if (p && p != ZERO_PTR)
        memset(p, 0, total);               /* reused chunks aren't zero */
    return p;
}

void *realloc(void *ptr, size_t size) {
    if (ptr == NULL || ptr == ZERO_PTR)
        return malloc(size);
    if (size == 0) {
        free(ptr);
        return ZERO_PTR;
    }

    region_header_t *h = header_of(ptr);
    if (h->magic != header_magic(h))
        die("invalid realloc: bad or corrupted region header");

    size_t old_usable;
    if (h->kind == KIND_LARGE) {
        old_usable = h->map_size - h->data_off;
        /* Still oversized and still fits the existing mapping: keep it. */
        if (size > MAX_CLASS && size <= old_usable)
            return ptr;
    } else if (h->kind == KIND_SLAB) {
        old_usable = h->chunk_size;
        int ci = size_class_index(size);
        if (ci >= 0 && (uint32_t)ci == h->class_index)
            return ptr;                    /* same class: grow/shrink in place */
    } else {
        die("invalid realloc: unknown region kind");
        return NULL;                       /* unreachable */
    }

    void *q = malloc(size);
    if (!q)
        return NULL;                       /* original ptr left intact */
    memcpy(q, ptr, size < old_usable ? size : old_usable);
    free(ptr);
    return q;
}
