#include "auth.h"
#include "esp_log.h"
#include "esp_random.h"
#include <string.h>
#include <stdio.h>

static const char *TAG = "auth";

#define MAX_SESSIONS 8

typedef struct {
    uint8_t username[AUTH_MAX_USERNAME];
    size_t  username_len;
    size_t  password_len;
    uint8_t password[AUTH_MAX_PASSWORD];
    user_tier_t tier;
} user_record_t;

typedef struct {
    char token[AUTH_TOKEN_LEN + 1];
    auth_session_t info;
    bool active;
} session_entry_t;

static user_record_t  s_users[AUTH_MAX_USERS];
static int            s_user_count = 0;
static session_entry_t s_sessions[MAX_SESSIONS];
static int            s_session_idx = 0;

static void generate_token(char *out, size_t len)
{
    for (size_t i = 0; i < len; i += 8) {
        uint32_t r = esp_random();
        size_t remaining = len - i;
        size_t chunk = remaining < 8 ? remaining : 8;
        for (size_t j = 0; j < chunk; j++) {
            out[i + j] = "0123456789abcdef"[(r >> (j * 4)) & 0xf];
        }
    }
    out[len] = '\0';
}

static user_record_t *find_user(const uint8_t *username, size_t username_len)
{
    for (int i = 0; i < s_user_count; i++) {
        if (s_users[i].username_len == username_len &&
            memcmp(s_users[i].username, username, username_len) == 0) {
            return &s_users[i];
        }
    }
    return NULL;
}

esp_err_t auth_init(void)
{
    memset(s_sessions, 0, sizeof(s_sessions));
    s_session_idx = 0;
    s_user_count = 0;
    return ESP_OK;
}

esp_err_t auth_register(const uint8_t *username, size_t username_len,
                        const uint8_t *password, size_t password_len,
                        user_tier_t tier)
{
    if (username_len < AUTH_MIN_USERNAME || username_len > AUTH_MAX_USERNAME ||
        password_len < AUTH_MIN_PASSWORD || password_len > AUTH_MAX_PASSWORD) {
        return ESP_ERR_INVALID_ARG;
    }
    if (find_user(username, username_len) != NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    if (s_user_count >= AUTH_MAX_USERS) {
        return ESP_ERR_NO_MEM;
    }

    user_record_t *u = &s_users[s_user_count++];
    memcpy(u->username, username, username_len);
    u->username_len = username_len;
    memcpy(u->password, password, password_len);
    u->password_len = password_len;
    u->tier = tier;

    ESP_LOGI(TAG, "Registered user (len=%u, tier=%d)",
             (unsigned)username_len, (int)tier);
    return ESP_OK;
}

const char *auth_login(const uint8_t *username, size_t username_len,
                       const uint8_t *password, size_t password_len)
{
    user_record_t *u = find_user(username, username_len);
    if (u == NULL ||
        u->password_len != password_len ||
        memcmp(u->password, password, password_len) != 0) {
        return NULL;
    }

    int idx = s_session_idx % MAX_SESSIONS;
    session_entry_t *s = &s_sessions[idx];
    generate_token(s->token, AUTH_TOKEN_LEN);
    memcpy(s->info.username, u->username, u->username_len);
    s->info.username_len = u->username_len;
    s->info.tier = u->tier;
    s->active = true;
    s_session_idx++;
    return s->token;
}

static const auth_session_t *find_session(const char *token)
{
    if (!token || strlen(token) != AUTH_TOKEN_LEN) return NULL;
    for (int i = 0; i < MAX_SESSIONS; i++) {
        if (s_sessions[i].active && strcmp(s_sessions[i].token, token) == 0) {
            return &s_sessions[i].info;
        }
    }
    return NULL;
}

const auth_session_t *auth_get_session(httpd_req_t *req)
{

    char auth_hdr[128];
    if (httpd_req_get_hdr_value_str(req, "Authorization", auth_hdr, sizeof(auth_hdr)) == ESP_OK) {
        if (strncmp(auth_hdr, "Bearer ", 7) == 0) {
            const auth_session_t *s = find_session(auth_hdr + 7);
            if (s) return s;
        }
    }


    size_t query_len = httpd_req_get_url_query_len(req);
    if (query_len > 0 && query_len < 256) {
        char query[256];
        if (httpd_req_get_url_query_str(req, query, sizeof(query)) == ESP_OK) {
            char tok[AUTH_TOKEN_LEN + 1];
            if (httpd_query_key_value(query, "token", tok, sizeof(tok)) == ESP_OK) {
                return find_session(tok);
            }
        }
    }

    return NULL;
}
