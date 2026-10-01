#include "redact.h"
#include "esp_heap_caps.h"
#include <stdlib.h>
#include <string.h>

#define GLYPH_W 5
#define GLYPH_H 7

static const uint8_t FONT_A_Z[26][GLYPH_H] = {
    {0x0E,0x11,0x11,0x1F,0x11,0x11,0x11},
    {0x1E,0x11,0x11,0x1E,0x11,0x11,0x1E},
    {0x0E,0x11,0x10,0x10,0x10,0x11,0x0E},
    {0x1E,0x11,0x11,0x11,0x11,0x11,0x1E},
    {0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F},
    {0x1F,0x10,0x10,0x1E,0x10,0x10,0x10},
    {0x0E,0x11,0x10,0x17,0x11,0x11,0x0E},
    {0x11,0x11,0x11,0x1F,0x11,0x11,0x11},
    {0x0E,0x04,0x04,0x04,0x04,0x04,0x0E},
    {0x07,0x01,0x01,0x01,0x11,0x11,0x0E},
    {0x11,0x12,0x14,0x18,0x14,0x12,0x11},
    {0x10,0x10,0x10,0x10,0x10,0x10,0x1F},
    {0x11,0x1B,0x15,0x15,0x11,0x11,0x11},
    {0x11,0x11,0x19,0x15,0x13,0x11,0x11},
    {0x0E,0x11,0x11,0x11,0x11,0x11,0x0E},
    {0x1E,0x11,0x11,0x1E,0x10,0x10,0x10},
    {0x0E,0x11,0x11,0x11,0x15,0x12,0x0D},
    {0x1E,0x11,0x11,0x1E,0x14,0x12,0x11},
    {0x0F,0x10,0x10,0x0E,0x01,0x01,0x1E},
    {0x1F,0x04,0x04,0x04,0x04,0x04,0x04},
    {0x11,0x11,0x11,0x11,0x11,0x11,0x0E},
    {0x11,0x11,0x11,0x11,0x11,0x0A,0x04},
    {0x11,0x11,0x11,0x15,0x15,0x1B,0x11},
    {0x11,0x11,0x0A,0x04,0x0A,0x11,0x11},
    {0x11,0x11,0x0A,0x04,0x04,0x04,0x04},
    {0x1F,0x01,0x02,0x04,0x08,0x10,0x1F},
};

#define RGB565_BLACK 0x0000
#define RGB565_WHITE 0xFFFF

typedef struct {
    uint8_t *caption;
    size_t caption_len;
    int width;
    int height;
    int strip_top;
    int band_top;
    int band_bot;
} redact_cache_t;

static redact_cache_t s_cache;

static inline void put_px(uint8_t *buf, int w, int h, int x, int y, uint16_t color)
{
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    uint8_t *p = buf + ((size_t)y * w + x) * 2;
    p[0] = (uint8_t)(color >> 8);
    p[1] = (uint8_t)(color & 0xFF);
}

static void fill_rect(uint8_t *buf, int w, int h, int x0, int y0, int x1, int y1, uint16_t color)
{
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 > w) x1 = w;
    if (y1 > h) y1 = h;
    for (int y = y0; y < y1; y++)
        for (int x = x0; x < x1; x++)
            put_px(buf, w, h, x, y, color);
}


static void draw_glyph(uint8_t *buf, int w, int h, char c, int ox, int oy, int scale, uint16_t color)
{
    if (c < 'A' || c > 'Z') return;
    const uint8_t *g = FONT_A_Z[c - 'A'];
    for (int row = 0; row < GLYPH_H; row++) {
        for (int col = 0; col < GLYPH_W; col++) {
            if (g[row] & (1 << (GLYPH_W - 1 - col))) {
                fill_rect(buf, w, h,
                          ox + col * scale, oy + row * scale,
                          ox + (col + 1) * scale, oy + (row + 1) * scale, color);
            }
        }
    }
}

static void draw_text(uint8_t *buf, int w, int h, const char *s, int ox, int oy, int scale, uint16_t color)
{
    int x = ox;
    for (const char *p = s; *p; p++) {
        char c = *p;
        if (c >= 'a' && c <= 'z') c = (char)(c - 'a' + 'A');
        draw_glyph(buf, w, h, c, x, oy, scale, color);
        x += (GLYPH_W + 1) * scale;
    }
}

static void get_layout(int w, int h, int *band_top, int *band_bot,
                       int *strip_top, int *text_x, int *text_y, int *scale)
{
    *band_top = h / 3;
    *band_bot = (2 * h) / 3;

    int msg_len = (int)strlen(REDACT_MESSAGE);
    int text_units = msg_len * (GLYPH_W + 1);
    *scale = 1;
    if (text_units > 0) {
        *scale = (w * 9 / 10) / text_units;
        if (*scale < 1) *scale = 1;
    }

    int text_w = text_units * *scale;
    int text_h = GLYPH_H * *scale;
    int pad = 3 * *scale;
    int strip_h = text_h + 2 * pad;

    *strip_top = *band_top - strip_h;
    if (*strip_top < 0) *strip_top = 0;
    *text_x = (w - text_w) / 2;
    if (*text_x < 0) *text_x = 0;
    *text_y = *band_top - pad - text_h;
    if (*text_y < *strip_top + pad) *text_y = *strip_top + pad;
}

bool redact_prepare_rgb565(int w, int h)
{
    if (w <= 0 || h <= 0) return false;
    if (s_cache.caption && s_cache.width == w && s_cache.height == h) return true;

    int band_top, band_bot, strip_top, text_x, text_y, scale;
    get_layout(w, h, &band_top, &band_bot, &strip_top,
               &text_x, &text_y, &scale);

    size_t caption_len = (size_t)(band_top - strip_top) * w * 2;
    uint8_t *caption = heap_caps_malloc(caption_len,
                                        MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!caption) caption = malloc(caption_len);
    if (!caption) return false;

    memset(caption, 0, caption_len);
    draw_text(caption, w, band_top - strip_top, REDACT_MESSAGE,
              text_x, text_y - strip_top, scale, RGB565_WHITE);

    free(s_cache.caption);
    s_cache.caption = caption;
    s_cache.caption_len = caption_len;
    s_cache.width = w;
    s_cache.height = h;
    s_cache.strip_top = strip_top;
    s_cache.band_top = band_top;
    s_cache.band_bot = band_bot;
    return true;
}

void redact_rgb565_middle_third(uint8_t *buf, int w, int h)
{
    if (!buf || w <= 0 || h <= 0) return;

    if (redact_prepare_rgb565(w, h)) {
        uint8_t *caption_dst = buf + (size_t)s_cache.strip_top * w * 2;
        memcpy(caption_dst, s_cache.caption, s_cache.caption_len);
        memset(buf + (size_t)s_cache.band_top * w * 2, 0,
               (size_t)(s_cache.band_bot - s_cache.band_top) * w * 2);
        return;
    }

    int band_top, band_bot, strip_top, text_x, text_y, scale;
    get_layout(w, h, &band_top, &band_bot, &strip_top,
               &text_x, &text_y, &scale);
    memset(buf + (size_t)strip_top * w * 2, 0,
           (size_t)(band_bot - strip_top) * w * 2);
    draw_text(buf, w, h, REDACT_MESSAGE, text_x, text_y, scale, RGB565_WHITE);
}
