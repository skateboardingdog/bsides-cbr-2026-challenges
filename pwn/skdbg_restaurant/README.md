skdbg_restaurant
======================

- **Category**: pwn
- **Difficulty**: hard
- **Author**: Faith

Welcome to the restaurant!  The kitchen at /dev/skdbg_restaurant takes orders,
adds dishes to them, calls them up when they are ready, and serves them to 
customers - but only ever from the first order on the rail.

You are a customer with `CAP_NET_RAW`.  The flag is in /flag, and only the
head chef (root) can read it. The kernel is the current mainline kernel
(linux-7.2).

---

### Handout files

- [./publish/challenge.zip](./publish/challenge.zip)
