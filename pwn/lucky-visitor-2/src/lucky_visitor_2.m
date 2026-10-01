// clang lucky_visitor_2.m -fno-stack-protector -O0 -fobjc-arc -fmodules -arch arm64 -isysroot $(xcrun --sdk iphoneos --show-sdk-path) -o lucky_visitor_2
#include <stdio.h>
#include <objc/message.h>

@import Foundation;

@interface NSData (Stdin)

+ (NSString *)stdinPath;
+ (NSData *)stdinData;
+ (void)getStdinBytes:(void *)bytes length:(NSUInteger)length;

@end

@implementation NSData (Stdin)

+ (NSString *)stdinPath {
    return @"/dev/stdin";
}

+ (NSData *)stdinData {
    NSString *path = [self stdinPath];

    // just pretend iOS has /dev/stdin
    NSFileHandle *handle = [path isEqualToString:@"/dev/stdin"]
        ? [NSFileHandle fileHandleWithStandardInput]
        : [NSFileHandle fileHandleForReadingAtPath:path];
    return [handle availableData];
}

+ (void)getStdinBytes:(void *)bytes length:(NSUInteger)length {
    [[self stdinData] getBytes:bytes length:length];
}

@end

char address[0x50] = {0};

int main(int argc, char *argv[], char *envp[]) {
    setbuf(stdin, NULL);
    setbuf(stdout, NULL);

    NSItemProvider *iphone;
    char fruit[20];

    printf("Congratulations, you've won a FREE iPhone 18 for being visitor "
           "number %ld and customer number %ld! Please answer a short survey "
           "to claim your prize.\n",
           (unsigned long)&main, (unsigned long)&objc_msgSend);

    printf("What is your favourite fruit? ");
    [NSData getStdinBytes:fruit length:0x20];

    printf("Where should we send your prize? ");
    [NSData getStdinBytes:address length:0x50];

    puts("Thank you for your information. Enjoy your prize :)");
}
