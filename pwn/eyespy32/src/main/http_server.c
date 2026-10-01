#include "http_server.h"
#include "auth.h"
#include "camera.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <stdio.h>
#include <string.h>

static const char *TAG = "http_server";

#ifndef CONFIG_CAMERA_REGULAR_STREAM_FPS
#define CONFIG_CAMERA_REGULAR_STREAM_FPS 3
#endif

extern const uint8_t index_html_start[] asm("_binary_index_html_start");
extern const uint8_t index_html_end[] asm("_binary_index_html_end");

static esp_err_t send_json_error(httpd_req_t *req, int status,
                                 const char *msg) {
  char buf[128];
  int len = snprintf(buf, sizeof(buf), "{\"error\":\"%s\"}", msg);
  httpd_resp_set_status(req, status == 401   ? "401 Unauthorized"
                             : status == 409 ? "409 Conflict"
                             : status == 400 ? "400 Bad Request"
                                             : "403 Forbidden");
  httpd_resp_set_type(req, "application/json");
  httpd_resp_send(req, buf, len);
  return ESP_FAIL;
}

static const auth_session_t *require_auth(httpd_req_t *req) {
  const auth_session_t *s = auth_get_session(req);
  if (!s) {
    send_json_error(req, 401, "Authentication required");
    return NULL;
  }
  return s;
}

static int read_full_body(httpd_req_t *req, uint8_t *buf, size_t buf_size) {
  int total = req->content_len;
  if (total <= 0 || (size_t)total > buf_size)
    return -1;
  int got = 0;
  while (got < total) {
    int n = httpd_req_recv(req, (char *)buf + got, total - got);
    if (n <= 0)
      return -1;
    got += n;
  }
  return got;
}

static int hex_digit(uint8_t c) {
  if (c >= '0' && c <= '9')
    return c - '0';
  if (c >= 'a' && c <= 'f')
    return 10 + c - 'a';
  if (c >= 'A' && c <= 'F')
    return 10 + c - 'A';
  return -1;
}

static int form_get_value(const uint8_t *body, size_t body_len, const char *key,
                          uint8_t *out, size_t out_max, size_t *out_len) {
  size_t key_len = strlen(key);
  size_t i = 0;
  while (i < body_len) {
    size_t kstart = i;
    while (i < body_len && body[i] != '=' && body[i] != '&')
      i++;
    bool match = (i - kstart == key_len) && (i < body_len) &&
                 (body[i] == '=') && (memcmp(&body[kstart], key, key_len) == 0);
    if (match) {
      i++;
      size_t out_idx = 0;
      while (i < body_len && body[i] != '&') {
        uint8_t b;
        if (body[i] == '+') {
          b = ' ';
          i++;
        } else if (body[i] == '%' && i + 2 < body_len) {
          int h = hex_digit(body[i + 1]);
          int l = hex_digit(body[i + 2]);
          if (h < 0 || l < 0)
            return -1;
          b = (uint8_t)((h << 4) | l);
          i += 3;
        } else {
          b = body[i++];
        }
        if (out_idx >= out_max)
          return -1;
        out[out_idx++] = b;
      }
      *out_len = out_idx;
      return (int)out_idx;
    }

    while (i < body_len && body[i] != '&')
      i++;
    if (i < body_len)
      i++;
  }
  return -1;
}

static const char *tier_str(user_tier_t t) {
  return (t == USER_TIER_REGULAR) ? "regular" : "premium";
}

static esp_err_t index_handler(httpd_req_t *req) {
  httpd_resp_set_type(req, "text/html");
  httpd_resp_send(req, (const char *)index_html_start,
                  index_html_end - index_html_start);
  return ESP_OK;
}

static esp_err_t register_handler(httpd_req_t *req) {
  uint8_t body[1024];
  int blen = read_full_body(req, body, sizeof(body));
  if (blen < 0)
    return send_json_error(req, 400, "Missing or oversized body");

  uint8_t username[AUTH_MAX_USERNAME];
  uint8_t password[AUTH_MAX_PASSWORD];
  size_t ulen = 0, plen = 0;
  if (form_get_value(body, blen, "username", username, sizeof(username),
                     &ulen) < 0 ||
      form_get_value(body, blen, "password", password, sizeof(password),
                     &plen) < 0) {
    return send_json_error(req, 400, "Missing username or password");
  }

  esp_err_t err =
      auth_register(username, ulen, password, plen, USER_TIER_REGULAR);
  switch (err) {
  case ESP_OK:
    break;
  case ESP_ERR_INVALID_ARG:
    return send_json_error(req, 400,
                           "Username or password length out of range");
  case ESP_ERR_INVALID_STATE:
    return send_json_error(req, 409, "Username already taken");
  case ESP_ERR_NO_MEM:
    return send_json_error(req, 400, "User table full");
  default:
    return send_json_error(req, 400, "Failed to register");
  }

  httpd_resp_set_type(req, "application/json");
  httpd_resp_sendstr(req, "{\"status\":\"ok\"}");
  return ESP_OK;
}

static esp_err_t login_handler(httpd_req_t *req) {
  uint8_t body[1024];
  int blen = read_full_body(req, body, sizeof(body));
  if (blen < 0)
    return send_json_error(req, 400, "Missing or oversized body");

  uint8_t username[AUTH_MAX_USERNAME];
  uint8_t password[AUTH_MAX_PASSWORD];
  size_t ulen = 0, plen = 0;
  if (form_get_value(body, blen, "username", username, sizeof(username),
                     &ulen) < 0 ||
      form_get_value(body, blen, "password", password, sizeof(password),
                     &plen) < 0) {
    return send_json_error(req, 400, "Missing username or password");
  }

  const char *token = auth_login(username, ulen, password, plen);
  if (!token) {
    ESP_LOGW(TAG, "Failed login attempt (ulen=%u)", (unsigned)ulen);
    return send_json_error(req, 401, "Invalid credentials");
  }

  char resp[64];
  int resp_len = snprintf(resp, sizeof(resp), "{\"token\":\"%s\"}", token);
  ESP_LOGI(TAG, "Login OK (ulen=%u)", (unsigned)ulen);
  httpd_resp_set_type(req, "application/json");
  httpd_resp_send(req, resp, resp_len);
  return ESP_OK;
}

static esp_err_t user_handler(httpd_req_t *req) {
  const auth_session_t *s = require_auth(req);
  if (!s)
    return ESP_FAIL;

  char buf[64];
  int len = sprintf(buf, "{\"tier\":\"%s\",\"username\":\"%s\"}",
                    tier_str(s->tier), s->username);
  httpd_resp_set_type(req, "application/json");
  httpd_resp_send(req, buf, len);
  return ESP_OK;
}

static esp_err_t do_capture(const auth_session_t *s, camera_frame_t *frame) {
  if (s->tier == USER_TIER_REGULAR) {
    return camera_capture_redacted(frame);
  }
  return camera_capture(frame);
}

static esp_err_t capture_handler(httpd_req_t *req) {
  const auth_session_t *s = require_auth(req);
  if (!s)
    return ESP_FAIL;

  camera_frame_t frame;
  if (do_capture(s, &frame) != ESP_OK) {
    httpd_resp_send_500(req);
    return ESP_FAIL;
  }

  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Content-Disposition",
                     "inline; filename=capture.jpg");
  httpd_resp_send(req, (const char *)frame.data, frame.len);

  camera_release_frame(&frame);
  return ESP_OK;
}

#define MJPEG_BOUNDARY "frame"
#define MJPEG_CONTENT_TYPE "multipart/x-mixed-replace;boundary=" MJPEG_BOUNDARY
#define MJPEG_PART_HEADER                                                      \
  "--" MJPEG_BOUNDARY                                                          \
  "\r\nContent-Type: image/jpeg\r\nContent-Length: %zu\r\n\r\n"
#define MJPEG_PART_FOOTER "\r\n"

static esp_err_t stream_handler(httpd_req_t *req) {
  const auth_session_t *s = require_auth(req);
  if (!s)
    return ESP_FAIL;

  esp_err_t err;
  char part_header[128];

  httpd_resp_set_type(req, MJPEG_CONTENT_TYPE);
  httpd_resp_set_hdr(req, "Cache-Control", "no-cache");

  int target_fps = (s->tier == USER_TIER_REGULAR)
                       ? CONFIG_CAMERA_REGULAR_STREAM_FPS
                       : CONFIG_CAMERA_STREAM_FPS;
  TickType_t frame_period = pdMS_TO_TICKS(1000 / target_fps);
  if (frame_period == 0)
    frame_period = 1;
  TickType_t next_frame = xTaskGetTickCount();

  while (true) {
    camera_frame_t frame;
    err = do_capture(s, &frame);
    if (err != ESP_OK) {
      ESP_LOGE(TAG, "Stream capture failed");
      break;
    }

    int hdr_len = snprintf(part_header, sizeof(part_header), MJPEG_PART_HEADER,
                           frame.len);

    err = httpd_resp_send_chunk(req, part_header, hdr_len);
    if (err != ESP_OK) {
      camera_release_frame(&frame);
      break;
    }

    err = httpd_resp_send_chunk(req, (const char *)frame.data, frame.len);
    if (err != ESP_OK) {
      camera_release_frame(&frame);
      break;
    }

    err = httpd_resp_send_chunk(req, MJPEG_PART_FOOTER,
                                strlen(MJPEG_PART_FOOTER));
    camera_release_frame(&frame);
    if (err != ESP_OK)
      break;

    vTaskDelayUntil(&next_frame, frame_period);
  }

  return ESP_OK;
}

static const httpd_uri_t uri_index = {
    .uri = "/", .method = HTTP_GET, .handler = index_handler};
static const httpd_uri_t uri_register = {
    .uri = "/register", .method = HTTP_POST, .handler = register_handler};
static const httpd_uri_t uri_login = {
    .uri = "/login", .method = HTTP_POST, .handler = login_handler};
static const httpd_uri_t uri_user = {
    .uri = "/user", .method = HTTP_GET, .handler = user_handler};
static const httpd_uri_t uri_capture = {
    .uri = "/capture", .method = HTTP_GET, .handler = capture_handler};
static const httpd_uri_t uri_stream = {
    .uri = "/stream", .method = HTTP_GET, .handler = stream_handler};

httpd_handle_t start_webserver(void) {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = CONFIG_WEBSERVER_PORT;
  config.max_uri_handlers = 12;
  config.stack_size = 8192;
  config.lru_purge_enable = true;

  httpd_handle_t server = NULL;
  esp_err_t err = httpd_start(&server, &config);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "Failed to start HTTP server: %s", esp_err_to_name(err));
    return NULL;
  }

  httpd_register_uri_handler(server, &uri_index);
  httpd_register_uri_handler(server, &uri_register);
  httpd_register_uri_handler(server, &uri_login);
  httpd_register_uri_handler(server, &uri_user);
  httpd_register_uri_handler(server, &uri_capture);
  httpd_register_uri_handler(server, &uri_stream);

  ESP_LOGI(TAG, "HTTP server started on port %d", CONFIG_WEBSERVER_PORT);
  return server;
}

void stop_webserver(httpd_handle_t server) {
  if (server) {
    httpd_stop(server);
    ESP_LOGI(TAG, "HTTP server stopped");
  }
}
