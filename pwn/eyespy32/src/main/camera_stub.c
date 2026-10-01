#include "camera.h"
#include "test_card_jpg.h"
#include "test_card_redacted_jpg.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "camera_stub";

esp_err_t camera_init(void)
{
    ESP_LOGI(TAG, "Camera stub initialized (640x480 + 320x240 redacted)");
    return ESP_OK;
}

esp_err_t camera_capture(camera_frame_t *frame)
{
    memset(frame, 0, sizeof(*frame));
    frame->data   = (uint8_t *)test_card_jpg;
    frame->len    = test_card_jpg_len;
    frame->width  = 640;
    frame->height = 480;
    return ESP_OK;
}

esp_err_t camera_capture_redacted(camera_frame_t *frame)
{
    memset(frame, 0, sizeof(*frame));
    frame->data   = (uint8_t *)test_card_redacted_jpg;
    frame->len    = test_card_redacted_jpg_len;
    frame->width  = 320;
    frame->height = 240;
    return ESP_OK;
}

void camera_release_frame(camera_frame_t *frame)
{
    memset(frame, 0, sizeof(*frame));
}

const char *camera_get_type(void)
{
    return "stub";
}
