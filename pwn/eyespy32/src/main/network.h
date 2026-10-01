#pragma once

#include "esp_err.h"
#include "freertos/FreeRTOS.h"

esp_err_t network_init(void);
esp_err_t network_wait_connected(TickType_t timeout);
