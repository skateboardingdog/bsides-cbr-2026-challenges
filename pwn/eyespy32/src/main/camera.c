#include "camera.h"
#include "redact.h"
#include "esp_camera.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "img_converters.h"
#include "jpeg_decoder.h"
#include <stdlib.h>
#include <string.h>

static const char *TAG = "camera";

#define REDACT_QUALITY  12
#define CAMERA_WIDTH    640
#define CAMERA_HEIGHT   480
#define REDACT_WIDTH    (CAMERA_WIDTH / 2)
#define REDACT_HEIGHT   (CAMERA_HEIGHT / 2)
#define JPEG_WORK_SIZE  3100
#define REDACT_JPEG_MAX (128 * 1024)

static uint8_t *s_rgb_buf;
static uint8_t *s_redacted_jpg;
static uint8_t s_jpeg_work[JPEG_WORK_SIZE] __attribute__((aligned(4)));

typedef struct {
    uint8_t *buf;
    size_t capacity;
    size_t len;
    bool overflow;
} jpeg_sink_t;

static size_t jpeg_sink_write(void *arg, size_t index, const void *data, size_t len)
{
    jpeg_sink_t *sink = arg;
    if (index > sink->capacity || len > sink->capacity - index) {
        sink->overflow = true;
        return 0;
    }
    memcpy(sink->buf + index, data, len);
    sink->len = index + len;
    return len;
}

static bool decode_redacted_rgb565(const uint8_t *jpg, size_t jpg_len,
                                   uint8_t *rgb, size_t rgb_len)
{
    esp_jpeg_image_cfg_t cfg = {
        .indata = (uint8_t *)jpg,
        .indata_size = jpg_len,
        .outbuf = rgb,
        .outbuf_size = rgb_len,
        .out_format = JPEG_IMAGE_FORMAT_RGB565,


        .out_scale = JPEG_IMAGE_SCALE_1_2,
        .flags.swap_color_bytes = 1,
        .advanced.working_buffer = s_jpeg_work,
        .advanced.working_buffer_size = sizeof(s_jpeg_work),
    };
    esp_jpeg_image_output_t output = {0};
    return esp_jpeg_decode(&cfg, &output) == ESP_OK &&
           output.width == REDACT_WIDTH && output.height == REDACT_HEIGHT &&
           output.output_len == rgb_len;
}

static camera_config_t camera_config = {
    .pin_pwdn = 32,
    .pin_reset = -1,
    .pin_xclk = 0,
    .pin_sccb_sda = 26,
    .pin_sccb_scl = 27,
    .pin_d7 = 35,
    .pin_d6 = 34,
    .pin_d5 = 39,
    .pin_d4 = 36,
    .pin_d3 = 21,
    .pin_d2 = 19,
    .pin_d1 = 18,
    .pin_d0 = 5,
    .pin_vsync = 25,
    .pin_href = 23,
    .pin_pclk = 22,

    .xclk_freq_hz = 20000000,
    .ledc_timer = LEDC_TIMER_0,
    .ledc_channel = LEDC_CHANNEL_0,

    .pixel_format = PIXFORMAT_JPEG,
    .frame_size = FRAMESIZE_VGA,
    .jpeg_quality = 12,
    .fb_count = 2,
    .grab_mode = CAMERA_GRAB_LATEST,
    .fb_location = CAMERA_FB_IN_PSRAM,
};

esp_err_t camera_init(void)
{
    esp_err_t err = esp_camera_init(&camera_config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Camera init failed: 0x%x", err);
        return err;
    }

    s_rgb_buf = heap_caps_malloc((size_t)REDACT_WIDTH * REDACT_HEIGHT * 2,
                                 MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    s_redacted_jpg = heap_caps_malloc(REDACT_JPEG_MAX,
                                      MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!s_rgb_buf || !s_redacted_jpg) {
        free(s_rgb_buf);
        free(s_redacted_jpg);
        s_rgb_buf = NULL;
        s_redacted_jpg = NULL;
        esp_camera_deinit();
        ESP_LOGE(TAG, "Failed to allocate redaction buffers");
        return ESP_ERR_NO_MEM;
    }

    if (!redact_prepare_rgb565(REDACT_WIDTH, REDACT_HEIGHT)) {
        ESP_LOGW(TAG, "Caption cache unavailable; using direct redaction fallback");
    }
    ESP_LOGI(TAG, "Camera initialized (OV2640)");
    return ESP_OK;
}

esp_err_t camera_capture(camera_frame_t *frame)
{
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
        ESP_LOGE(TAG, "Camera capture failed");
        return ESP_FAIL;
    }
    frame->data    = fb->buf;
    frame->len     = fb->len;
    frame->width   = fb->width;
    frame->height  = fb->height;
    frame->_handle = fb;
    frame->_owned  = false;
    return ESP_OK;
}

esp_err_t camera_capture_redacted(camera_frame_t *frame)
{
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) return ESP_FAIL;

    int source_w = fb->width;
    int source_h = fb->height;
    size_t rgb_len = (size_t)REDACT_WIDTH * REDACT_HEIGHT * 2;

    if (!s_rgb_buf || !s_redacted_jpg ||
        source_w != CAMERA_WIDTH || source_h != CAMERA_HEIGHT) {
        esp_camera_fb_return(fb);
        ESP_LOGE(TAG, "Unexpected frame size %dx%d", source_w, source_h);
        return ESP_FAIL;
    }


    bool ok = decode_redacted_rgb565(fb->buf, fb->len, s_rgb_buf, rgb_len);
    esp_camera_fb_return(fb);
    if (!ok) return ESP_FAIL;

    redact_rgb565_middle_third(s_rgb_buf, REDACT_WIDTH, REDACT_HEIGHT);

    jpeg_sink_t sink = {
        .buf = s_redacted_jpg,
        .capacity = REDACT_JPEG_MAX,
    };
    ok = fmt2jpg_cb(s_rgb_buf, rgb_len, REDACT_WIDTH, REDACT_HEIGHT, PIXFORMAT_RGB565,
                    REDACT_QUALITY, jpeg_sink_write, &sink);
    if (!ok || sink.overflow) {
        ESP_LOGE(TAG, "Redacted JPEG encode failed%s",
                 sink.overflow ? " (output too large)" : "");
        return ESP_FAIL;
    }

    frame->data    = s_redacted_jpg;
    frame->len     = sink.len;
    frame->width   = REDACT_WIDTH;
    frame->height  = REDACT_HEIGHT;
    frame->_handle = NULL;
    frame->_owned  = false;
    return ESP_OK;
}

void camera_release_frame(camera_frame_t *frame)
{
    if (frame->_owned) {
        free(frame->_handle);
    } else if (frame->_handle) {
        esp_camera_fb_return((camera_fb_t *)frame->_handle);
    }
    memset(frame, 0, sizeof(*frame));
}

const char *camera_get_type(void)
{
    return "ov2640";
}
