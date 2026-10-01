#include "network.h"
#include "wifi.h"
#include "esp_log.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "freertos/event_groups.h"

#if CONFIG_USE_ETHERNET_FOR_QEMU
#include "esp_eth.h"
#endif

static const char *TAG = "network";
static EventGroupHandle_t s_net_event_group;
#define NET_CONNECTED_BIT BIT0

static void on_got_ip(void *arg, esp_event_base_t event_base,
                      int32_t event_id, void *event_data)
{
    ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
    ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&event->ip_info.ip));
    xEventGroupSetBits(s_net_event_group, NET_CONNECTED_BIT);
}

static void on_ap_start(void *arg, esp_event_base_t event_base,
                        int32_t event_id, void *event_data)
{
    ESP_LOGI(TAG, "AP ready at 192.168.4.1");
    xEventGroupSetBits(s_net_event_group, NET_CONNECTED_BIT);
}

#if CONFIG_USE_ETHERNET_FOR_QEMU

static void on_eth_event(void *arg, esp_event_base_t event_base,
                         int32_t event_id, void *event_data)
{
    switch (event_id) {
    case ETHERNET_EVENT_CONNECTED:
        ESP_LOGI(TAG, "Ethernet connected");
        break;
    case ETHERNET_EVENT_DISCONNECTED:
        ESP_LOGI(TAG, "Ethernet disconnected");
        xEventGroupClearBits(s_net_event_group, NET_CONNECTED_BIT);
        break;
    default:
        break;
    }
}

static esp_err_t ethernet_init(void)
{
    esp_netif_config_t cfg = ESP_NETIF_DEFAULT_ETH();
    esp_netif_t *eth_netif = esp_netif_new(&cfg);

    eth_mac_config_t mac_config = ETH_MAC_DEFAULT_CONFIG();
    esp_eth_mac_t *mac = esp_eth_mac_new_openeth(&mac_config);

    eth_phy_config_t phy_config = ETH_PHY_DEFAULT_CONFIG();
    esp_eth_phy_t *phy = esp_eth_phy_new_dp83848(&phy_config);

    esp_eth_config_t config = ETH_DEFAULT_CONFIG(mac, phy);
    esp_eth_handle_t eth_handle = NULL;
    ESP_ERROR_CHECK(esp_eth_driver_install(&config, &eth_handle));
    ESP_ERROR_CHECK(esp_netif_attach(eth_netif, esp_eth_new_netif_glue(eth_handle)));

    ESP_ERROR_CHECK(esp_event_handler_register(ETH_EVENT, ESP_EVENT_ANY_ID,
                                               &on_eth_event, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_ETH_GOT_IP,
                                               &on_got_ip, NULL));

    ESP_ERROR_CHECK(esp_eth_start(eth_handle));
    ESP_LOGI(TAG, "Ethernet (open_eth for QEMU) initialized");
    return ESP_OK;
}

#endif

esp_err_t network_init(void)
{
    s_net_event_group = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

#if CONFIG_USE_ETHERNET_FOR_QEMU
    return ethernet_init();
#else
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, WIFI_EVENT_AP_START,
                                               &on_ap_start, NULL));
    return wifi_init();
#endif
}

esp_err_t network_wait_connected(TickType_t timeout)
{
    EventBits_t bits = xEventGroupWaitBits(s_net_event_group,
                                           NET_CONNECTED_BIT,
                                           pdFALSE, pdTRUE, timeout);
    if (bits & NET_CONNECTED_BIT) {
        ESP_LOGI(TAG, "Network connected");
        return ESP_OK;
    }
    ESP_LOGW(TAG, "Network connection timeout");
    return ESP_ERR_TIMEOUT;
}
