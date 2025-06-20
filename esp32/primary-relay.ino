// PRIMARY Relay Firmware (Robot) - ESP-NOW Version
// Communicates with SECONDARY relay (Elevator) via ESP-NOW
// Uses ESP32-S3 6ch relay board
//
// No physical wires needed - wireless communication

#include <esp_now.h>
#include <WiFi.h>

// Relay identification
#define RELAY_ID "robot-primary-001"
#define RELAY_NAME "Robot Alpha Primary Relay"

// ESP-NOW peer info for secondary relay
// You'll need to replace this with your secondary relay's MAC address
uint8_t secondaryRelayAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}; // Replace with actual MAC

// Message structure for ESP-NOW
typedef struct {
    char relayId[32];
    char command[32];
    int floor;
    bool doorOpen;
    bool emergencyStop;
    unsigned long timestamp;
} RelayMessage;

RelayMessage outgoingMessage;
RelayMessage incomingMessage;

// Callback when data is sent
void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    Serial.print("Last Packet Send Status: ");
    if (status == ESP_NOW_SEND_SUCCESS) {
        Serial.println("Delivery Success");
    } else {
        Serial.println("Delivery Fail");
    }
}

// Callback when data is received
void OnDataRecv(const uint8_t *mac_addr, const uint8_t *data, int data_len) {
    memcpy(&incomingMessage, data, sizeof(incomingMessage));
    Serial.print("Received from: ");
    Serial.print(mac_addr[0], HEX);
    Serial.print(":");
    Serial.print(mac_addr[1], HEX);
    Serial.print(":");
    Serial.print(mac_addr[2], HEX);
    Serial.print(":");
    Serial.print(mac_addr[3], HEX);
    Serial.print(":");
    Serial.print(mac_addr[4], HEX);
    Serial.print(":");
    Serial.println(mac_addr[5], HEX);
    
    Serial.print("Message: ");
    Serial.println(incomingMessage.command);
    Serial.print("Floor: ");
    Serial.println(incomingMessage.floor);
    Serial.print("Door: ");
    Serial.println(incomingMessage.doorOpen ? "Open" : "Closed");
    Serial.print("Emergency: ");
    Serial.println(incomingMessage.emergencyStop ? "STOP" : "Normal");
    Serial.println();
}

void setup() {
    Serial.begin(115200);
    
    // Get and display relay identification
    String macAddress = WiFi.macAddress();
    Serial.println("=== PRIMARY RELAY IDENTIFICATION ===");
    Serial.print("Relay ID: ");
    Serial.println(RELAY_ID);
    Serial.print("Relay Name: ");
    Serial.println(RELAY_NAME);
    Serial.print("MAC Address: ");
    Serial.println(macAddress);
    Serial.print("Hardware ID: ");
    Serial.println(ESP.getEfuseMac(), HEX);
    Serial.println("===================================");
    
    // Set device as a Wi-Fi Station
    WiFi.mode(WIFI_STA);
    
    // Init ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.println("Error initializing ESP-NOW");
        return;
    }
    
    // Set up ESP-NOW callbacks
    esp_now_register_send_cb(OnDataSent);
    esp_now_register_recv_cb(OnDataRecv);
    
    // Add peer (secondary relay)
    esp_now_peer_info_t peerInfo;
    memcpy(peerInfo.peer_addr, secondaryRelayAddress, 6);
    peerInfo.channel = 0;
    peerInfo.encrypt = false;
    
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.println("Failed to add peer");
        return;
    }
    
    Serial.println("PRIMARY relay ready. ESP-NOW communication enabled.");
    Serial.println("Waiting to communicate with SECONDARY relay...");
    Serial.println();
}

void loop() {
    // Send different types of commands to test communication
    static unsigned long lastSend = 0;
    static int commandIndex = 0;
    
    if (millis() - lastSend > 3000) { // Send every 3 seconds
        switch (commandIndex) {
            case 0:
                sendStatusRequest();
                break;
            case 1:
                sendFloorRequest(2);
                break;
            case 2:
                sendDoorControl(true); // Open door
                break;
            case 3:
                sendDoorControl(false); // Close door
                break;
            case 4:
                sendEmergencyStop();
                break;
            case 5:
                sendHeartbeat();
                break;
        }
        
        commandIndex = (commandIndex + 1) % 6;
        lastSend = millis();
    }
    
    delay(100);
}

void sendStatusRequest() {
    strcpy(outgoingMessage.relayId, RELAY_ID);
    strcpy(outgoingMessage.command, "status_request");
    outgoingMessage.floor = 0;
    outgoingMessage.doorOpen = false;
    outgoingMessage.emergencyStop = false;
    outgoingMessage.timestamp = millis();
    
    esp_err_t result = esp_now_send(secondaryRelayAddress, (uint8_t *) &outgoingMessage, sizeof(outgoingMessage));
    if (result == ESP_OK) {
        Serial.println("Sent: Status Request");
    } else {
        Serial.println("Error sending status request");
    }
}

void sendFloorRequest(int floor) {
    strcpy(outgoingMessage.relayId, RELAY_ID);
    strcpy(outgoingMessage.command, "floor_request");
    outgoingMessage.floor = floor;
    outgoingMessage.doorOpen = false;
    outgoingMessage.emergencyStop = false;
    outgoingMessage.timestamp = millis();
    
    esp_err_t result = esp_now_send(secondaryRelayAddress, (uint8_t *) &outgoingMessage, sizeof(outgoingMessage));
    if (result == ESP_OK) {
        Serial.printf("Sent: Floor %d Request\n", floor);
    } else {
        Serial.println("Error sending floor request");
    }
}

void sendDoorControl(bool open) {
    strcpy(outgoingMessage.relayId, RELAY_ID);
    strcpy(outgoingMessage.command, "door_control");
    outgoingMessage.floor = 0;
    outgoingMessage.doorOpen = open;
    outgoingMessage.emergencyStop = false;
    outgoingMessage.timestamp = millis();
    
    esp_err_t result = esp_now_send(secondaryRelayAddress, (uint8_t *) &outgoingMessage, sizeof(outgoingMessage));
    if (result == ESP_OK) {
        Serial.printf("Sent: Door %s\n", open ? "Open" : "Close");
    } else {
        Serial.println("Error sending door control");
    }
}

void sendEmergencyStop() {
    strcpy(outgoingMessage.relayId, RELAY_ID);
    strcpy(outgoingMessage.command, "emergency_stop");
    outgoingMessage.floor = 0;
    outgoingMessage.doorOpen = false;
    outgoingMessage.emergencyStop = true;
    outgoingMessage.timestamp = millis();
    
    esp_err_t result = esp_now_send(secondaryRelayAddress, (uint8_t *) &outgoingMessage, sizeof(outgoingMessage));
    if (result == ESP_OK) {
        Serial.println("Sent: Emergency Stop");
    } else {
        Serial.println("Error sending emergency stop");
    }
}

void sendHeartbeat() {
    strcpy(outgoingMessage.relayId, RELAY_ID);
    strcpy(outgoingMessage.command, "heartbeat");
    outgoingMessage.floor = 0;
    outgoingMessage.doorOpen = false;
    outgoingMessage.emergencyStop = false;
    outgoingMessage.timestamp = millis();
    
    esp_err_t result = esp_now_send(secondaryRelayAddress, (uint8_t *) &outgoingMessage, sizeof(outgoingMessage));
    if (result == ESP_OK) {
        Serial.println("Sent: Heartbeat");
    } else {
        Serial.println("Error sending heartbeat");
    }
} 