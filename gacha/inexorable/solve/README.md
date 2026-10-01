```asm
# enter your input in the input box below!

.intel_syntax noprefix

.data
input_buf: .space 17
input_fmt: .string "%16s"
yes: .string "correct, flag is skbdg{%s}\n"
no:  .string "wrong\n"

.text
.global main
main:
    sub rsp, 8

    lea rdi, [rip + input_fmt]
    lea rsi, [rip + input_buf]
    xor eax, eax
    call scanf

    lea rdi, [rip + no]

    mov rax, qword ptr [rip + input_buf]
    movabs rcx, 676767676767676767
    xor rax, rcx
    movabs rdx, 0x7a5003fef8471d3d
    cmp rax, rdx
    jne print

    mov rax, qword ptr [rip + input_buf + 8]
    movabs rcx, 0x6767676767676767
    xor rax, rcx
    movabs rdx, 0x46461e0b050a5414
    cmp rax, rdx
    jne print

    lea rdi, [rip + yes]

print:
    lea rsi, [rip + input_buf]
    xor eax, eax
    call printf

    xor eax, eax
    add rsp, 8
    ret
```

The x86-64 assembly program reads 16 bytes of input from the user (using
`scanf`) then performs checks on the inputs to decide whether to print
"correct" or "wrong".

The first check XORs the first 8 bytes with
`676767676767676767` and compares it against `0x7a5003fef8471d3d`. Inverting
this operation reveals what the first 8 bytes of input should be to pass this
check:

```py
>>> (676767676767676767^0x7a5003fef8471d3d).to_bytes(8, "little")
b'b4s1c_4s'
```

The second check does the same thing with a different constant and with the
second 8 bytes of the input. Inverting this as before reveals what the second 8
bytes of input should be:

```py
>>> (0x6767676767676767^0x46461e0b050a5414).to_bytes(8, "little")
b's3mbly!!'
```

Putting these together gives the flag `skbdg{b4s1c_4ss3mbly!!}`.
