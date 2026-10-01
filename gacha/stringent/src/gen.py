import os

FLAG_IDX = 6767
NFLAGS = 13337

lines = [
    "#include <stdio.h>",
    "#include <string.h>",
    "",
    "int main(int argc, char **argv)",
    "{",
    "    if (argc != 2) {",
    '        printf("usage: %s <flag>\\n", argv[0]);',
    "        return 2;",
    "    }",
    "",
    "    int result = 0;",
    "",
]

flags = ["skbdg{" + os.getrandom(16).hex() + "}" for _ in range(NFLAGS)]
for i, f in enumerate(flags):
    value = 1 if i == FLAG_IDX else 0
    lines.append(f'    if (strcmp(argv[1], "{f}") == 0) result = {value};')

lines += [
    "",
    "    if (result)",
    '        puts("Correct!");',
    "    else",
    '        puts("Nope.");',
    "",
    "    return !result;",
    "}",
]

open("stringent.c", "w").write("\n".join(lines) + "\n")
open("flag.txt", "w").write(flags[FLAG_IDX])
