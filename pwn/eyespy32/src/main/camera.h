#pragma once

#include "esp_err.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct {
    uint8_t *data;
    size_t len;
    int width;
    int height;


    void *_handle;
    bool  _owned;
} camera_frame_t;

esp_err_t camera_init(void);
esp_err_t camera_capture(camera_frame_t *frame);
esp_err_t camera_capture_redacted(camera_frame_t *frame);
void camera_release_frame(camera_frame_t *frame);
const char *camera_get_type(void);
