# skateboarding dog restaurant - reference solve

## Build

Build the exploit statically using `musl-gcc` and `linux-7.2` kernel headers.

```
musl-gcc -static -O2 -s -I<path/to/kernel/uapi/include> -o exploit exploit.c
```

For musl you need the kernel UAPI headers (e.g. `make headers_install INSTALL_HDR_PATH=uapi_hdr` from a kernel tree, then `-Iuapi_hdr/include`).

## How it works (kinda TL;DR because its too hard to explain)

The module mirrors my RxRPC vulnerability that I found and showcased with Pumpkin at ZeroDay Cloud (CVE-2026-23066):

The vulnerability here is that `ring_bell()` checks `list_empty(&order->rail_link)` without holding `rail_lock`, which can race with `serve_dish()`'s `list_del_init()` + requeue `list_add()`. Winning the race leaves a corrupted order stuck on the rail with a self-referential link:

```
rail.next = &order->rail_link
rail.prev = &order->rail_link
order->rail_link.next = &order->rail_link
order->rail_link.prev = &order->rail_link
```

`list_empty()` then always reports "empty", so every announcement takes a reference that is never released. 

The exploit stages are as follows:

1. **Race** - Use `/dev/shm` to extend the race window, and attempt to win the race described above. If the race is won, polling the order will still cause it to return non-empty after removing all dishes from it.
2. **Refcount oracle** - `SKDBG_PEEK_KITCHEN` reveals the leaked refcount.
3. **put_order() primitive** - `SKDBG_SERVE_DISH(buf=NULL, 1, MSG_DONTWAIT)` causes `skb_copy_datagram_iter()` in `inner_serve_dish()` to return`-EFAULT`, which immediately calls `put_order()`. We repeat this until the refcount of the corrupted UAF order is 1.
4. **UAF** - `SKDBG_READY_ORDER` completes the order, and `SKDBG_SERVE_DISH` is used to free the order. It still remains on the kitchen's rail though, leading to UAF from now onwards.
5. **Cross-cache** - 2048-byte orders means order-3 slabs. Free the filler orders in the right order so the UAF order's RCU callback runs last and the empty slab is freed back to the page allocator (the RCU callbacks can run on either CPU, so ring allocations alternate CPUs).
6. **Reclaim** - packet rings are used to map the UAF order's slab into userspace and reclaim it. Then, a new fresh order + a dish causes `ring_bell()` to be called, and this then writes into the `rail.prev` of the corrupted UAF order. Use the packet ringbuffer mapping to read this kernel pointer.
7. **Arbitrary read** -  Forge a fake order + fake dish (`fake_dish->cb->data = target - 8`, `dish_offset = 8`) and read any kernel address via `skb_copy_datagram_iter()`.
8. **KASLR Bypass** - `IDT_VIRT_ADDR` is the fixed virtual address of the IDT (the CPU entry area is not randomized even with KASLR). The first IDT entry points to `&asm_exc_divide_error`, which we read to leak the kernel virtual base address.
9. **Arbitrary write** - with `dish_offset = 0`, `inner_serve_dish()` calls `order->waiter->serve(order, fake_dish)`. Fake a `waiter` structure and set `.serve` to `__seq_puts`. This type-confuses the fake dish as `struct seq_file`. Set the type confused `seq_file->buf` pointer to `&core_pattern`, and overwrite `core_pattern` with `|/proc/%P/fd/666 %P ` using `__seq_puts()`. 
10. **Root** - The exploit memfds itself onto fd 666 before it starts, so the next fork + segfault at this point makes the kernel execute it as root.
