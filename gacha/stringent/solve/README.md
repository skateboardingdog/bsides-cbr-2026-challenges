The binary we are given is quite large. Running the `strings` command on it
shows a bunch of flag-looking strings. Running the program without arguments
shows the usage, indicating that the flag is passed as an argument:

```
$ ./stringent
usage: ./stringent <flag>
```

Trying a few of the flag-looking strings returns "Nope." unless you're very
lucky and got the right one by chance.

From here, you can guess that one of the flag-looking strings will be the true
flag. You can alternatively open it up in a disassembler (or try a decompiler,
but it might struggle!) and see that the logic does a bunch of `strcmp` checks
against each of the flag-looking strings that appear.

One approach to finding the right flag is a `bash` loop to try each flag and
see which one prints correct:

```sh
for f in $(strings ./stringent | grep '^skbdg{'); do
    ./stringent "$f" | grep -q Correct && { echo "$f"; break; }
done
```

Another approach is to look through a disassembler or use `objdump` to identify
the block that handles the correct flag. Using
`objdump -d -M intel --no-show-raw-insn stringent` shows that the heavily
repeated "wrong" block looks like this:

```
    11a2:	mov    rax,QWORD PTR [rbp-0x20]
    11a6:	mov    rax,QWORD PTR [rax]
    11a9:	mov    rsi,rax
    11ac:	lea    rax,[rip+0x82e55]        # 84008
    11b3:	mov    rdi,rax
    11b6:	mov    eax,0x0
    11bb:	call   1080 <printf@plt>
    11c0:	mov    eax,0x2
    11c5:	jmp    835e9 <main+0x82460>
    11ca:	mov    DWORD PTR [rbp-0x4],0x0
```

The `lea` instruction is responsible for loading the string, and `objdump`
conveniently calculates the address for us in the comment (`84008` in this
case). This address happens to be the same offset in the binary that the string
appears at.

The last line sets the variable at `rbp-0x4` on the stack to `0x0`, which is
the result used to print correct or nope.

You can then use the `grep` command to find which block sets this to `0x1`:

```
$ objdump -d -M intel --no-show-raw-insn stringent | grep -B7 'DWORD PTR \[rbp-0x4\],0x1'
   43331:	mov    rax,QWORD PTR [rax]
   43334:	lea    rdx,[rip+0x82e3d]        # c6178
   4333b:	mov    rsi,rdx
   4333e:	mov    rdi,rax
   43341:	call   1090 <strcmp@plt>
   43346:	test   eax,eax
   43348:	jne    43351 <main+0x421c8>
   4334a:	mov    DWORD PTR [rbp-0x4],0x1
```

From here, we can run `strings` again with `-t x` which prints the location of
the string, and grep this for the address `c6178`:

```
$ strings -t x ./stringent | grep c6178
  c6178 skbdg{a5b00d57d774f6197d6aec5976d36f11}
```

This reveals the correct flag, which can be checked against the program:

```
$ ./stringent skbdg{a5b00d57d774f6197d6aec5976d36f11}
Correct!
```
