#include "network.h"
#include "camera.h"
#include "auth.h"
#include "http_server.h"
#include "esp_log.h"
#include "nvs_flash.h"

static const char *TAG = "main";

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES ||
        ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    ESP_ERROR_CHECK(network_init());

    ESP_LOGI(TAG, "Waiting for network connection...");
    ESP_ERROR_CHECK(network_wait_connected(pdMS_TO_TICKS(30000)));

    ESP_ERROR_CHECK(camera_init());
    ESP_ERROR_CHECK(auth_init());

    httpd_handle_t server = start_webserver();
    if (server == NULL) {
        ESP_LOGE(TAG, "Failed to start web server");
        return;
    }

    ESP_LOGI(TAG, "Camera web server ready. Camera type: %s", camera_get_type());
}
