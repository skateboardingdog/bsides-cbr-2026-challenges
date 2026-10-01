#pragma once

#include <stdint.h>
#include <stdbool.h>

#define REDACT_MESSAGE "please upgrade for full image"

bool redact_prepare_rgb565(int w, int h);
void redact_rgb565_middle_third(uint8_t *buf, int w, int h);
