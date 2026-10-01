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
