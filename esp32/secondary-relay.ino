// SECONDARY Relay Firmware (Elevator) - ESP-NOW Version
// Communicates with PRIMARY relay (Robot) via ESP-NOW
// Uses ESP32-S3 6ch relay board
//
// No physical wires needed - wireless communication

#include <esp_now.h>
#include <WiFi.h>

// Relay identification
#define RELAY_ID "elevator-secondary-001"
#define RELAY_NAME "Main Building Elevator Relay"

// ESP-NOW peer info for primary relay
// You'll need to replace this with your primary relay's MAC address
uint8_t primaryRelayAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}; // Replace with actual MAC

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

// Elevator state
int currentFloor = 1;
bool doorIsOpen = false;
bool emergencyStopActive = false;

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
    
    Serial.print("Command: ");
    Serial.println(incomingMessage.command);
    
    // Handle different commands
    if (strcmp(incomingMessage.command, "status_request") == 0) {
        sendStatusResponse();
    } else if (strcmp(incomingMessage.command, "floor_request") == 0) {
        handleFloorRequest(incomingMessage.floor);
    } else if (strcmp(incomingMessage.command, "door_control") == 0) {
        handleDoorControl(incomingMessage.doorOpen);
    } else if (strcmp(incomingMessage.command, "emergency_stop") == 0) {
        handleEmergencyStop();
    } else if (strcmp(incomingMessage.command, "heartbeat") == 0) {
        sendHeartbeatResponse();
    }
    
    Serial.println();
}

void setup() {
    Serial.begin(115200);
    
    // Get and display relay identification
    String macAddress = WiFi.macAddress();
    Serial.println("=== SECONDARY RELAY IDENTIFICATION ===");
    Serial.print("Relay ID: ");
    Serial.println(RELAY_ID);
    Serial.print("Relay Name: ");
    Serial.println(RELAY_NAME);
    Serial.print("MAC Address: ");
    Serial.println(macAddress);
    Serial.print("Hardware ID: ");
    Serial.println(ESP.getEfuseMac(), HEX);
    Serial.println("=====================================");
    
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
    
    // Add peer (primary relay)
    esp_now_peer_info_t peerInfo;
    memcpy(peerInfo.peer_addr, primaryRelayAddress, 6);
    peerInfo.channel = 0;
    peerInfo.encrypt = false;
    
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.println("Failed to add peer");
        return;
    }
    
    Serial.println("SECONDARY relay ready. ESP-NOW communication enabled.");
    Serial.println("Waiting for commands from PRIMARY relay...");
    Serial.println();
}

void loop() {
    // Send periodic status updates
    static unsigned long lastStatus = 0;
    if (millis() - lastStatus > 10000) { // Every 10 seconds
        sendStatusUpdate();
        lastStatus = millis();
    }
    
    delay(100);
}

void sendStatusResponse() {
    strcpy(outgoingMessage.relayId, RELAY_ID);
    strcpy(outgoingMessage.command, "status_response");
    outgoingMessage.floor = currentFloor;
    outgoingMessage.doorOpen = doorIsOpen;
    outgoingMessage.emergencyStop = emergencyStopActive;
    outgoingMessage.timestamp = millis();
    
    esp_err_t result = esp_now_send(primaryRelayAddress, (uint8_t *) &outgoingMessage, sizeof(outgoingMessage));
    if (result == ESP_OK) {
        Serial.println("Sent: Status Response");
        Serial.printf("  Current Floor: %d\n", currentFloor);
        Serial.printf("  Door: %s\n", doorIsOpen ? "Open" : "Closed");
        Serial.printf("  Emergency: %s\n", emergencyStopActive ? "STOP" : "Normal");
    } else {
        Serial.println("Error sending status response");
    }
}

void sendStatusUpdate() {
    strcpy(outgoingMessage.relayId, RELAY_ID);
    strcpy(outgoingMessage.command, "status_update");
    outgoingMessage.floor = currentFloor;
    outgoingMessage.doorOpen = doorIsOpen;
    outgoingMessage.emergencyStop = emergencyStopActive;
    outgoingMessage.timestamp = millis();
    
    esp_err_t result = esp_now_send(primaryRelayAddress, (uint8_t *) &outgoingMessage, sizeof(outgoingMessage));
    if (result == ESP_OK) {
        Serial.println("Sent: Status Update");
    } else {
        Serial.println("Error sending status update");
    }
}

void handleFloorRequest(int requestedFloor) {
    Serial.printf("Handling floor request: Floor %d\n", requestedFloor);
    
    if (emergencyStopActive) {
        Serial.println("Emergency stop active - cannot move elevator");
        sendErrorResponse("Emergency stop active");
        return;
    }
    
    if (requestedFloor < 1 || requestedFloor > 10) {
        Serial.println("Invalid floor request");
        sendErrorResponse("Invalid floor");
        return;
    }
    
    // Simulate elevator movement
    Serial.printf("Moving elevator from floor %d to floor %d\n", currentFloor, requestedFloor);
    currentFloor = requestedFloor;
    
    // Send confirmation
    strcpy(outgoingMessage.relayId, RELAY_ID);
    strcpy(outgoingMessage.command, "floor_confirmation");
    outgoingMessage.floor = currentFloor;
    outgoingMessage.doorOpen = doorIsOpen;
    outgoingMessage.emergencyStop = emergencyStopActive;
    outgoingMessage.timestamp = millis();
    
    esp_err_t result = esp_now_send(primaryRelayAddress, (uint8_t *) &outgoingMessage, sizeof(outgoingMessage));
    if (result == ESP_OK) {
        Serial.printf("Sent: Floor %d confirmation\n", currentFloor);
    } else {
        Serial.println("Error sending floor confirmation");
    }
}

void handleDoorControl(bool open) {
    Serial.printf("Handling door control: %s\n", open ? "Open" : "Close");
    
    if (emergencyStopActive) {
        Serial.println("Emergency stop active - cannot control door");
        sendErrorResponse("Emergency stop active");
        return;
    }
    
    doorIsOpen = open;
    
    // Send confirmation
    strcpy(outgoingMessage.relayId, RELAY_ID);
    strcpy(outgoingMessage.command, "door_confirmation");
    outgoingMessage.floor = currentFloor;
    outgoingMessage.doorOpen = doorIsOpen;
    outgoingMessage.emergencyStop = emergencyStopActive;
    outgoingMessage.timestamp = millis();
    
    esp_err_t result = esp_now_send(primaryRelayAddress, (uint8_t *) &outgoingMessage, sizeof(outgoingMessage));
    if (result == ESP_OK) {
        Serial.printf("Sent: Door %s confirmation\n", doorIsOpen ? "Open" : "Close");
    } else {
        Serial.println("Error sending door confirmation");
    }
}

void handleEmergencyStop() {
    Serial.println("Handling emergency stop");
    emergencyStopActive = true;
    
    // Send confirmation
    strcpy(outgoingMessage.relayId, RELAY_ID);
    strcpy(outgoingMessage.command, "emergency_confirmation");
    outgoingMessage.floor = currentFloor;
    outgoingMessage.doorOpen = doorIsOpen;
    outgoingMessage.emergencyStop = emergencyStopActive;
    outgoingMessage.timestamp = millis();
    
    esp_err_t result = esp_now_send(primaryRelayAddress, (uint8_t *) &outgoingMessage, sizeof(outgoingMessage));
    if (result == ESP_OK) {
        Serial.println("Sent: Emergency stop confirmation");
    } else {
        Serial.println("Error sending emergency confirmation");
    }
}

void sendHeartbeatResponse() {
    strcpy(outgoingMessage.relayId, RELAY_ID);
    strcpy(outgoingMessage.command, "heartbeat_response");
    outgoingMessage.floor = currentFloor;
    outgoingMessage.doorOpen = doorIsOpen;
    outgoingMessage.emergencyStop = emergencyStopActive;
    outgoingMessage.timestamp = millis();
    
    esp_err_t result = esp_now_send(primaryRelayAddress, (uint8_t *) &outgoingMessage, sizeof(outgoingMessage));
    if (result == ESP_OK) {
        Serial.println("Sent: Heartbeat Response");
    } else {
        Serial.println("Error sending heartbeat response");
    }
}

void sendErrorResponse(const char* error) {
    strcpy(outgoingMessage.relayId, RELAY_ID);
    strcpy(outgoingMessage.command, "error_response");
    outgoingMessage.floor = currentFloor;
    outgoingMessage.doorOpen = doorIsOpen;
    outgoingMessage.emergencyStop = emergencyStopActive;
    outgoingMessage.timestamp = millis();
    
    esp_err_t result = esp_now_send(primaryRelayAddress, (uint8_t *) &outgoingMessage, sizeof(outgoingMessage));
    if (result == ESP_OK) {
        Serial.printf("Sent: Error Response - %s\n", error);
    } else {
        Serial.println("Error sending error response");
    }
} 