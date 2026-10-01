#pragma once

#include "esp_err.h"
#include "esp_http_server.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define AUTH_TOKEN_LEN     32
#define AUTH_MAX_USERNAME  128
#define AUTH_MAX_PASSWORD  128
#define AUTH_MIN_USERNAME  3
#define AUTH_MIN_PASSWORD  4
#define AUTH_MAX_USERS     16

typedef enum {
    USER_TIER_REGULAR = 0,
    USER_TIER_PREMIUM = 1,
} user_tier_t;

typedef struct {
    uint8_t username[AUTH_MAX_USERNAME];
    size_t  username_len;
    user_tier_t tier;
} auth_session_t;

esp_err_t auth_init(void);
esp_err_t auth_register(const uint8_t *username, size_t username_len,
                        const uint8_t *password, size_t password_len,
                        user_tier_t tier);
const char *auth_login(const uint8_t *username, size_t username_len,
                       const uint8_t *password, size_t password_len);
const auth_session_t *auth_get_session(httpd_req_t *req);
