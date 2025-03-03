# WebRTC Connection Library

This library is developed to establish peer-to-peer (1-1) connections between browsers using WebRTC technology, share video/audio streams, and enable messaging through data channels.

## Features

- 🎥 Camera sharing
- 🖥️ Screen sharing
- 📨 Messaging via data channel
- 🔄 RTC connection management
- ⚙️ Codec preference settings
- 🚀 Bandwidth optimization

## Installation

```javascript
// Include the library in your project
import WebRTC from './WebRTC.js';
```

## Usage

### Creating a Connection

```javascript
// Create a WebRTC instance
const webrtc = new WebRTC({
    configuration: {
        iceServers: [{
            urls: ['turn:sunucu_adresi:port'],
            username: 'kullanıcı_adı',
            credential: 'şifre'
        }]
    }
});
```

### Create First Connection

```javascript
await webRTC.createConnection();
const offer = await webrtc.createOffer(); // Send the offer to the other peer (HTTP, WebSocket, etc.)
```

### Join Connection an Offer Data

```javascript
await webrtc.createConnection();
const answerData = await webrtc.createAnswer(JSON.parse(offer)) // Offer Data
```

### Complete Connection

```javascript
// First Client
const answer = await webrtc.createAnswer(JSON.parse(answerData)); // Answer Data
```

### Screen Sharing

```javascript
// Start screen sharing
await webRTC.startScreenShare();

// Stop screen sharing
webRTC.stopScreenShare();
```

### Camera Sharing

```javascript
// Start camera sharing
await webRTC.startCamera();

// Stop camera sharing
webRTC.stopCamera();
```

### Messaging

```javascript
// Send a message
webRTC.sendMessage({
  cmd: 'custom-command',
  data: 'Hello world'
});

// Receive messages
webRTC.onMessage = (message) => {
  console.log('Message received:', message);
};
```

### Events

```javascript
// When audio stream starts
webrtc.onTrackAudio = (event) => {
    console.log('Audio Track: ', event)
    document.getElementById('audioElement').srcObject = event.streams[0];
    document.getElementById('audioElement').play().catch(e => console.error('Audio play error:', e));
};

// When video stream starts
webrtc.onTrackVideo = async (event, type) => {
    if (type === 'screen') {
        document.getElementById('screenVideoElement').srcObject = event.streams[0];
        document.getElementById('screenVideoElement').play().catch(e => console.error('Video play error:', e));
    } else {
        document.getElementById('videoElement').srcObject = event.streams[0];
        document.getElementById('videoElement').play().catch(e => console.error('Video play error:', e));
    }
};

// When video stream stops
webrtc.onStopVideo = (streamType, streamId) => {
    console.log('onStopVideo: ', streamType, streamId);

    if (streamType === 'screen') {
        document.getElementById('screenVideoElement').srcObject = null;
    } else {
        document.getElementById('videoElement').srcObject = null;
    }
};

// When data message received
webrtc.onDataMessage = (message) => {
    console.log('Data Message: ', message);
};

// When connection is established
webrtc.onConnect = () => console.log('onConnect');

// When connection is closed
webrtc.onDisconnect = () => console.log('onDisconnect');
```

## Browser Support

This library works in versions of modern browsers that support the WebRTC API:
- Chrome
- Firefox
- Edge
- Safari (iOS 11+)

## Screen Sharing Support

To check for screen sharing support:

```javascript
if (WebRTC.isScreenShareSupport()) {
  // Screen sharing is supported
}
```

## Code Optimization

The library provides a setting that prefers the VP8 video codec and operates at a default bit rate of 5 Mbps. These parameters can be modified if needed.

## Notes

- WebRTC works over HTTPS or on localhost.
- STUN/TURN servers may be required for firewall and NAT traversal.
- Additional permissions may be required in some browsers.