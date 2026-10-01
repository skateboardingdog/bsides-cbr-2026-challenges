#include "wifi.h"
#include "esp_wifi.h"
#include "esp_log.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_random.h"
#include <string.h>

static const char *TAG = "wifi";

#define AP_PASSWORD_LEN 8

static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_AP_STACONNECTED) {
        ESP_LOGI(TAG, "Station joined");
    }
}

static void generate_ap_password(char *out)
{
    static const char charset[] = "0123456789abcdef";
    uint32_t r = esp_random();
    for (int i = 0; i < AP_PASSWORD_LEN; i++) {
        if (i == 4) r = esp_random();
        out[i] = charset[(r >> ((i % 4) * 4)) & 0xf];
    }
    out[AP_PASSWORD_LEN] = '\0';
}

esp_err_t wifi_init(void)
{
    esp_netif_create_default_wifi_ap();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                               &wifi_event_handler, NULL));

    char password[AP_PASSWORD_LEN + 1];
    generate_ap_password(password);

    wifi_config_t wifi_config = {
        .ap = {
            .ssid = CONFIG_WIFI_SSID,
            .ssid_len = strlen(CONFIG_WIFI_SSID),
            .max_connection = 4,
            .authmode = WIFI_AUTH_WPA2_PSK,
            .channel = 1,
        },
    };
    memcpy(wifi_config.ap.password, password, sizeof(password));

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "WiFi AP started. SSID: %s  Password: %s",
             CONFIG_WIFI_SSID, password);
    return ESP_OK;
}
