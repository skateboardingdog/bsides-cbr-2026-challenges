// g++ -std=c++20 -O0 -g -Wall -Wextra -Wpedantic -fno-pie -no-pie -fcf-protection=none -Wl,--section-start=.x67buffer=0x67676700 -Wl,--section-start=.x67method=0x67677000 -Wl,--no-warn-rwx-segments x67.cpp -o x67
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string_view>

#if !defined(__linux__) || !defined(__x86_64__) || !defined(__GNUC__)
#error "x67 targets GCC/Clang on Linux x86-64."
#endif


inline constexpr std::size_t WORK_SIZE = 0x900;
inline constexpr std::size_t SLOT_SIZE = 8192;

extern "C" {
extern std::uint8_t x67_buffer[WORK_SIZE];
}

/* The linker places these at 0x67676700 and 0x67677000 respectively.
 * x67_buffer is zero-filled BSS. x67_method is an ordinary C++ function in a
 * writable/executable section; x67_decode() replaces its body before main()
 * calls it.
 */
__asm__(
    ".pushsection .x67buffer,\"aw\",@nobits\n"
    ".balign 256\n"
    ".globl x67_buffer\n"
    ".type x67_buffer,@object\n"
    "x67_buffer:\n"
    ".skip 0x900\n"
    ".size x67_buffer,.-x67_buffer\n"
    ".popsection\n"
);

extern "C" [[gnu::noinline, gnu::used,
             gnu::section(".x67method,\"awx\",@progbits#")]]
std::uint32_t x67_method([[maybe_unused]] std::uint8_t *buffer,
                         [[maybe_unused]] std::size_t length,
                         [[maybe_unused]] std::uint32_t value)
{
    return 0;
}

/* Keep the rest of the page file-backed and writable/executable for the decoded
 * method. The generated method currently fits inside this first page. */
__asm__(
    ".pushsection .x67method,\"awx\",@progbits\n"
    ".skip 4096,0\n"
    ".popsection\n"
);


struct Instruction {
    std::uint8_t bytes[7];
};

consteval std::uint32_t hex(std::string_view s)
{
    if (s.size() < 3 || s[0] != '0' || s[1] != 'x')
        throw "expected hexadecimal value";

    std::uint32_t value = 0;
    for (char c : s.substr(2)) {
        unsigned digit;
        if (c >= '0' && c <= '9')
            digit = static_cast<unsigned>(c - '0');
        else if (c >= 'a' && c <= 'f')
            digit = static_cast<unsigned>(c - 'a' + 10);
        else if (c >= 'A' && c <= 'F')
            digit = static_cast<unsigned>(c - 'A' + 10);
        else
            throw "bad hexadecimal digit";
        value = value * 16 + digit;
    }
    return value;
}

consteval std::uint8_t hex8(std::string_view s)
{
    auto value = hex(s);
    if (value > 0xff)
        throw "value does not fit in one byte";
    return static_cast<std::uint8_t>(value);
}

consteval Instruction padded(std::uint8_t opcode)
{
    return {{0x67, 0x67, 0x67, 0x67, 0x67, 0x67, opcode}};
}

consteval Instruction padded_imm8(std::uint8_t opcode, std::uint8_t immediate)
{
    return {{0x67, 0x67, 0x67, 0x67, 0x67, opcode, immediate}};
}

consteval Instruction mem_imm32(std::uint8_t opcode,
                                std::uint8_t displacement,
                                std::uint32_t immediate)
{
    return {{
        opcode, 0x77, displacement,
        static_cast<std::uint8_t>(immediate),
        static_cast<std::uint8_t>(immediate >> 8),
        static_cast<std::uint8_t>(immediate >> 16),
        static_cast<std::uint8_t>(immediate >> 24),
    }};
}

consteval Instruction x67(std::string_view text)
{
    if (text == "cld")            return padded(0xfc);
    if (text == "scasb")          return padded(0xae);
    if (text == "ret")            return padded(0xc3);
    if (text == "xchg eax, esi")  return padded(0x96);
    if (text == "xchg eax, edx")  return padded(0x92);

    constexpr std::string_view sub = "sub al, ";
    constexpr std::string_view xra = "xor al, ";
    if (text.starts_with(sub)) return padded_imm8(0x2c, hex8(text.substr(sub.size())));
    if (text.starts_with(xra)) return padded_imm8(0x34, hex8(text.substr(xra.size())));

    constexpr std::string_view xr = "xor [rdi+";
    if (text.starts_with(xr)) {
        auto split = text.find("], ", xr.size());
        if (split == std::string_view::npos)
            throw "expected: xor [rdi+DISP], IMM32";
        return mem_imm32(0x81,
                         hex8(text.substr(xr.size(), split - xr.size())),
                         hex(text.substr(split + 3)));
    }

    constexpr std::string_view imul = "imul esi, [rdi+";
    if (text.starts_with(imul)) {
        auto split = text.find("], ", imul.size());
        if (split == std::string_view::npos)
            throw "expected: imul esi, [rdi+DISP], IMM32";
        return mem_imm32(0x69,
                         hex8(text.substr(imul.size(), split - imul.size())),
                         hex(text.substr(split + 3)));
    }

    constexpr std::string_view mov = "mov [edi+";
    if (text.starts_with(mov) && text.ends_with("], esi")) {
        auto end = text.size() - std::string_view("], esi").size();
        auto displacement = hex8(text.substr(mov.size(), end - mov.size()));
        return {{0x67, 0x67, 0x67, 0x67, 0x89, 0x77, displacement}};
    }

    constexpr std::string_view ordh = "or dh, [edi+";
    if (text.starts_with(ordh) && text.ends_with("]")) {
        auto displacement = hex8(text.substr(ordh.size(), text.size() - ordh.size() - 1));
        return {{0x67, 0x67, 0x67, 0x67, 0x0a, 0x77, displacement}};
    }

    throw "unknown x67 instruction";
}

consteval unsigned themed_digit(std::uint8_t byte)
{
    switch (byte) {
    case 0x66: return 0;
    case 0x67: return 1;
    case 0x76: return 2;
    case 0x77: return 3;
    default: throw "not an x67 themed byte";
    }
}




/* Every line below is parsed, encoded as one seven-byte x86 instruction,
 * validated for the six-of-seven property, and packed to three bytes entirely
 * at compile time. The readable instruction array exists only during constant
 * evaluation; only the packed bytes are emitted into the binary.
 */
template <std::size_t N>
struct PackedProgram {
    static constexpr std::size_t instruction_count = N;
    std::uint8_t bytes[N * 3];
};

template <std::size_t N>
consteval PackedProgram<N> pack(const Instruction (&source)[N])
{
    PackedProgram<N> packed{};

    for (std::size_t i = 0; i < N; ++i) {
        unsigned odd_position = 7;
        unsigned pattern = 0;
        unsigned themed_count = 0;
        std::uint8_t literal = 0;

        for (unsigned j = 0; j < 7; ++j) {
            std::uint8_t byte = source[i].bytes[j];
            if (byte == 0x66 || byte == 0x67 || byte == 0x76 || byte == 0x77) {
                pattern |= themed_digit(byte) << (2 * themed_count++);
            } else {
                if (odd_position != 7)
                    throw "instruction contains more than one non-themed byte";
                odd_position = j;
                literal = byte;
            }
        }

        if (themed_count != 6 || odd_position == 7)
            throw "instruction must contain exactly six themed bytes";

        unsigned meta = odd_position | (pattern << 3);
        packed.bytes[3 * i + 0] = static_cast<std::uint8_t>(meta);
        packed.bytes[3 * i + 1] = static_cast<std::uint8_t>(meta >> 8);
        packed.bytes[3 * i + 2] = literal;
    }

    return packed;
}

consteval auto make_program()
{
    constexpr Instruction source[] = {
    // DL accumulates a length mismatch; DH accumulates content mismatches.
    x67("cld"),
    x67("xchg eax, esi"),       // AL = input length
    x67("sub al, 0x66"),
    x67("sub al, 0x66"),
    x67("xor al, 0x77"),        // AL = 0 iff length == 67
    x67("xchg eax, edx"),       // DL = length mismatch; EAX = 0

    // Input byte 0: exceptional warm-up round.
    x67("xor [rdi+0x67], 0x67766777"),
    x67("imul esi, [rdi+0x67], 0x76676677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77676676"),
    x67("imul esi, [rdi+0x67], 0x66676667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77666766"),
    x67("or dh, [edi+0x67]"),

    // Input byte 1.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67667777"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77667666"),
    x67("or dh, [edi+0x67]"),

    // Input byte 2.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77767667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76777776"),
    x67("or dh, [edi+0x67]"),

    // Input byte 3.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77676677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76777676"),
    x67("or dh, [edi+0x67]"),

    // Input byte 4.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67777767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76667777"),
    x67("or dh, [edi+0x67]"),

    // Input byte 5.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77667777"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76777767"),
    x67("or dh, [edi+0x67]"),

    // Input byte 6.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66677777"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76766666"),
    x67("or dh, [edi+0x67]"),

    // Input byte 7.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67676677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77777676"),
    x67("or dh, [edi+0x67]"),

    // Input byte 8.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77677667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67766777"),
    x67("or dh, [edi+0x67]"),

    // Input byte 9.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77767677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x66767776"),
    x67("or dh, [edi+0x67]"),

    // Input byte 10.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67767667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67677677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 11.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66676677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77777767"),
    x67("or dh, [edi+0x67]"),

    // Input byte 12.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66777777"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67676776"),
    x67("or dh, [edi+0x67]"),

    // Input byte 13.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67776767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x66667677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 14.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66676777"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77666766"),
    x67("or dh, [edi+0x67]"),

    // Input byte 15.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77676677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67767666"),
    x67("or dh, [edi+0x67]"),

    // Input byte 16.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77676767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76766677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 17.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67677677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77767676"),
    x67("or dh, [edi+0x67]"),

    // Input byte 18.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66677767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67667677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 19.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67766677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x66776666"),
    x67("or dh, [edi+0x67]"),

    // Input byte 20.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77777667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67777677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 21.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x76767777"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77776667"),
    x67("or dh, [edi+0x67]"),

    // Input byte 22.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67676767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77676777"),
    x67("or dh, [edi+0x67]"),

    // Input byte 23.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77666767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x66667677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 24.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x76666667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76676776"),
    x67("or dh, [edi+0x67]"),

    // Input byte 25.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77676667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67767676"),
    x67("or dh, [edi+0x67]"),

    // Input byte 26.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67677767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77676777"),
    x67("or dh, [edi+0x67]"),

    // Input byte 27.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66676667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67777676"),
    x67("or dh, [edi+0x67]"),

    // Input byte 28.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x76676667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76776677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 29.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67767677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77676767"),
    x67("or dh, [edi+0x67]"),

    // Input byte 30.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67776677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67767777"),
    x67("or dh, [edi+0x67]"),

    // Input byte 31.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77777677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x66666776"),
    x67("or dh, [edi+0x67]"),

    // Input byte 32.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66676767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67776677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 33.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67776767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x66766676"),
    x67("or dh, [edi+0x67]"),

    // Input byte 34.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x76677667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67767677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 35.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x76776677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77676666"),
    x67("or dh, [edi+0x67]"),

    // Input byte 36.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x76676767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x66667677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 37.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77666667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67667666"),
    x67("or dh, [edi+0x67]"),

    // Input byte 38.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66677667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76777777"),
    x67("or dh, [edi+0x67]"),

    // Input byte 39.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66766677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76776766"),
    x67("or dh, [edi+0x67]"),

    // Input byte 40.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66767667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76766776"),
    x67("or dh, [edi+0x67]"),

    // Input byte 41.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67777777"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67666766"),
    x67("or dh, [edi+0x67]"),

    // Input byte 42.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66776667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76776666"),
    x67("or dh, [edi+0x67]"),

    // Input byte 43.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67666767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77677677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 44.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x76767667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x66777666"),
    x67("or dh, [edi+0x67]"),

    // Input byte 45.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67766767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77676677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 46.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x76667667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67777776"),
    x67("or dh, [edi+0x67]"),

    // Input byte 47.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x76776677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67676666"),
    x67("or dh, [edi+0x67]"),

    // Input byte 48.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67767667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77676677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 49.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x76776677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x66666677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 50.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x76666767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77667677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 51.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x76666677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77667666"),
    x67("or dh, [edi+0x67]"),

    // Input byte 52.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x67666767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x67767677"),
    x67("or dh, [edi+0x67]"),

    // Input byte 53.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77677667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76666676"),
    x67("or dh, [edi+0x67]"),

    // Input byte 54.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66766767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x66776767"),
    x67("or dh, [edi+0x67]"),

    // Input byte 55.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77777767"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76666777"),
    x67("or dh, [edi+0x67]"),

    // Input byte 56.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77777777"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77667777"),
    x67("or dh, [edi+0x67]"),

    // Input byte 57.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66676777"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76766667"),
    x67("or dh, [edi+0x67]"),

    // Input byte 58.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66676677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76767766"),
    x67("or dh, [edi+0x67]"),

    // Input byte 59.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77776777"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x66766777"),
    x67("or dh, [edi+0x67]"),

    // Input byte 60.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66766777"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x66676767"),
    x67("or dh, [edi+0x67]"),

    // Input byte 61.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77766667"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76667676"),
    x67("or dh, [edi+0x67]"),

    // Input byte 62.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x66777777"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x66777777"),
    x67("or dh, [edi+0x67]"),

    // Input byte 63.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x76776777"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76766667"),
    x67("or dh, [edi+0x67]"),

    // Input byte 64.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77677777"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76766776"),
    x67("or dh, [edi+0x67]"),

    // Input byte 65.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x77676777"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x76676767"),
    x67("or dh, [edi+0x67]"),

    // Input byte 66.
    x67("scasb"),
    x67("imul esi, [rdi+0x67], 0x76666677"),
    x67("mov [edi+0x67], esi"),
    x67("xor [rdi+0x67], 0x77767776"),
    x67("or dh, [edi+0x67]"),

    x67("xchg eax, edx"),
    x67("ret"),

    };
    return pack(source);
}

using Program = decltype(make_program());
inline constexpr std::size_t PROGRAM_INSNS = Program::instruction_count;
inline constexpr std::size_t PACKED_SIZE = sizeof(Program);

static_assert(sizeof(Instruction) == 7);
static_assert(PACKED_SIZE == PROGRAM_INSNS * 3);
static_assert(PROGRAM_INSNS * 7 <= SLOT_SIZE);



extern "C" [[gnu::noinline, gnu::used]]
void x67_decode()
{
    static constexpr auto packed = make_program();
    static constexpr std::uint8_t digit[4] = {0x66, 0x67, 0x76, 0x77};

    const std::uint8_t *in = packed.bytes;
    std::uint8_t *out = reinterpret_cast<std::uint8_t *>(x67_method);

    for (std::size_t i = 0; i < PROGRAM_INSNS; ++i) {
        unsigned meta = in[0] | static_cast<unsigned>(in[1]) << 8;
        unsigned odd = meta & 7;
        unsigned pattern = meta >> 3;
        std::uint8_t literal = in[2];
        unsigned k = 0;

        for (unsigned j = 0; j < 7; ++j) {
            if (j == odd)
                out[j] = literal;
            else
                out[j] = digit[(pattern >> (2 * k++)) & 3];
        }

        in += 3;
        out += 7;
    }
}

int main()
{
    char *input = reinterpret_cast<char *>(x67_buffer + 0x67);

    std::fputs("Please enter the flag: ", stdout);
    std::fflush(stdout);
    if (!std::fgets(input, WORK_SIZE - 0x67, stdin))
        return 1;

    std::size_t length = std::strcspn(input, "\r\n");

    x67_decode();
    std::uint32_t result = x67_method(x67_buffer, length, 0);

    std::puts(result ? "Nope." : "Correct!");
    return result != 0;
}

