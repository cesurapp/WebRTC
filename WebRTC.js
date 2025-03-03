class WebRTC {
    static CMD = {
        SCREEN_SHARE_STOP: 'stopScreenShare',
        CAMERA_SHARE_STOP: 'stopCameraShare',
        OFFER: 'offer',
        ANSWER: 'answer'
    };

    static STREAM_TYPE = {
        SCREEN: 'screen',
        CAMERA: 'camera'
    }

    static STREAM_CONSTRAINTS = {
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 32000,
            channelCount: 1,
        },
        video: {
            width: {max: 1440},
            height: {max: 900},
            frameRate: {max: 16},
        },
        screen: {
            width: {max: 1920},
            height: {max: 1080},
            frameRate: {max: 16},
        }
    }

    constructor(options = {}) {
        this.peerConnection = null;
        this.localStream = null;
        this.screenStream = null;
        this.cameraStream = null;
        this.dataChannel = null;
        this.iceData = [];
        this.streamList = {};

        // Events
        this.onConnect = null;
        this.onDisconnect = null;
        this.onDataMessage = null;
        this.onTrackAudio = null;
        this.onTrackVideo = null;
        this.onStopVideo = null;

        this.configuration = {...{
            iceServers: [{
                urls: [],
                username: "",
                credential: ""
            }],
            bundlePolicy: "max-bundle",
            iceTransportPolicy: "relay",
        }, ...options.configuration || {}};

        if (options.hasOwnProperty('streamConstraints')) {
            WebRTC.STREAM_CONSTRAINTS = {
                audio: {...WebRTC.STREAM_CONSTRAINTS.audio, ...options.streamConstraints.audio || {}},
                video: {...WebRTC.STREAM_CONSTRAINTS.video, ...options.streamConstraints.video || {}},
                screen: {...WebRTC.STREAM_CONSTRAINTS.screen, ...options.streamConstraints.screen || {}}
            };
        }
    }

    async createConnection() {
        if (this.peerConnection) this.peerConnection.close();

        // Init Events
        this.peerConnection = new RTCPeerConnection(this.configuration);
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) this.iceData.push({type: 'candidate', candidate: event.candidate});
        };
        this.peerConnection.onconnectionstatechange = () => {
            if (this.peerConnection.connectionState === 'connected') this.onConnect && this.onConnect();
            if (['closed', 'disconnected'].indexOf(this.peerConnection.connectionState) !== -1) this.onDisconnect && this.onDisconnect();
        };
        this.peerConnection.ontrack = (event) => {
            const streamType = this.streamList[event.streams[0].id] ?? null;
            if (event.track.kind === 'audio') this.onTrackAudio && this.onTrackAudio(event, streamType);
            if (event.track.kind === 'video') this.onTrackVideo && this.onTrackVideo(event, streamType);
        };

        // Create Data Channel
        this.dataChannel = this.peerConnection.createDataChannel("data");
        this.peerConnection.ondatachannel = async (e) => {
            e.channel.onmessage = async (event) => {
                const data = JSON.parse(event.data);

                if (data.cmd === WebRTC.CMD.OFFER) {
                    // Add Media Track
                    if (data.streamId) this.streamList[data.streamId] = data.streamType;
                    await webrtc.createAnswer(data.data).then((answer) => webrtc.sendMessage({cmd: WebRTC.CMD.ANSWER, data: answer}))
                }
                if (data.cmd === WebRTC.CMD.ANSWER) {
                    await webrtc.processData(data.data);
                }
                if (data.cmd === WebRTC.CMD.SCREEN_SHARE_STOP) {
                    this.stopScreenShare(false);
                    this.onStopVideo && this.onStopVideo(WebRTC.STREAM_TYPE.SCREEN, data.streamId)
                    delete this.streamList[data.streamId];
                }
                if (data.cmd === WebRTC.CMD.CAMERA_SHARE_STOP) {
                    this.onStopVideo && this.onStopVideo(WebRTC.STREAM_TYPE.CAMERA, data.streamId)
                    delete this.streamList[data.streamId];
                }

                this.onDataMessage && this.onDataMessage(data)
            };
        };

        // Create Audio Stream
        this.localStream = await navigator.mediaDevices.getUserMedia({audio: this.supportedConstraints(WebRTC.STREAM_CONSTRAINTS.audio)});
        this.localStream.getTracks().forEach(track => this.peerConnection.addTrack(track, this.localStream));

        return this.peerConnection;
    }

    async startScreenShare() {
        try {
            if (this.screenStream) return;

            // Create Media
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({video: this.supportedConstraints(WebRTC.STREAM_CONSTRAINTS.screen)}).catch(error => {
                throw error;
            });
            this.screenStream.getTracks().forEach(track => {
                this.applyBitrateConstraint(this.peerConnection.addTrack(track, this.screenStream), 5000000); // 5mbps
            });

            // Stop Other Connections
            this.sendMessage({cmd: WebRTC.CMD.SCREEN_SHARE_STOP})
            const currentScreenStreamId = Object.keys(this.streamList).find(key => this.streamList[key] === WebRTC.STREAM_TYPE.SCREEN);
            if (currentScreenStreamId) {
                this.onStopVideo && this.onStopVideo(WebRTC.STREAM_TYPE.SCREEN, currentScreenStreamId)
                delete this.streamList[currentScreenStreamId];
            }

            // Create and Send Offer
            this.sendMessage({cmd: 'offer', streamType: 'screen', streamId: this.screenStream.id, data: await this.createOffer()});
        } catch (error) {
            console.error('Error starting screen share:', error);
        }
    }

    stopScreenShare(fireEvent = true) {
        if (!this.screenStream || !this.peerConnection) return false;
        const streamId = this.screenStream.id;

        this.screenStream.getTracks().forEach(track => {
            track.stop();
            const sender = this.peerConnection.getSenders().find(s => s.track === track);
            if (sender) this.peerConnection.removeTrack(sender);
        });

        this.screenStream = null;
        if (fireEvent) this.sendMessage({cmd: WebRTC.CMD.SCREEN_SHARE_STOP, streamId: streamId});
    }

    async startCamera() {
        if (this.cameraStream) return;

        this.cameraStream = await navigator.mediaDevices.getUserMedia({video: this.supportedConstraints(WebRTC.STREAM_CONSTRAINTS.video)});
        this.cameraStream.getTracks().forEach(track => {
            this.applyBitrateConstraint(this.peerConnection.addTrack(track, this.cameraStream), 5000000); // 5mbps
        });

        this.sendMessage({cmd: WebRTC.CMD.OFFER, streamType: 'camera', streamId: this.cameraStream.id, data: await this.createOffer()});
    }

    async stopCamera() {
        if (!this.cameraStream) return;
        const streamId = this.cameraStream.id;

        this.cameraStream.getTracks().forEach(track => {
            track.stop();
            const sender = this.peerConnection.getSenders().find(s => s.track === track);
            if (sender) this.peerConnection.removeTrack(sender);
        });

        this.cameraStream = null;
        this.sendMessage({cmd: WebRTC.CMD.CAMERA_SHARE_STOP, streamId: streamId});
    }

    async createOffer() {
        if (!this.peerConnection) return null;
        this.iceData = [];

        // Create Offer
        await this.peerConnection
            .createOffer({offerToReceiveAudio: true, offerToReceiveVideo: true})
            .then(async (offer) => {
                // Video codec tercihlerini ayarla
                const modifiedSDP = this.preferCodec(offer.sdp, 'video', 'VP8');
                const modifiedOffer = new RTCSessionDescription({type: offer.type, sdp: modifiedSDP});

                await this.peerConnection.setLocalDescription(modifiedOffer);
                await this.waitIceData();
            });

        const result = [{type: 'offer', sdp: this.peerConnection.localDescription}, ...this.iceData];
        this.iceData = [];
        return result;
    }

    async createAnswer(remoteData) {
        this.iceData = [];
        const answer = await this.processData(remoteData);
        await this.waitIceData();

        const result = [answer, ...this.iceData];
        this.iceData = [];
        return result;
    }

    async processData(remoteData) {
        if (!this.peerConnection) return;
        if (!Array.isArray(remoteData)) remoteData = [remoteData];
        let result = {};

        for (const data of remoteData) {
            // Offer
            if (data.type === 'offer') {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
                await this.peerConnection.createAnswer().then(async (answer) => {
                    await this.peerConnection.setLocalDescription(answer)
                });
                result = {type: 'answer', sdp: this.peerConnection.localDescription};
            }
            // Answer
            if (data.type === 'answer') {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            }
            // Candidate
            if (data.type === 'candidate' && data.candidate) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        }

        return result;
    }

    sendMessage(message) {
        try {
            if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
                console.error('Data channel is not ready');
            }
            this.dataChannel.send(JSON.stringify(message));
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }

    async waitIceData() {
        let retry = 0;
        while (true) {
            retry++;
            if (retry > 20) break;
            await new Promise(resolve => setTimeout(resolve, 250));
            if (this.peerConnection.iceGatheringState === 'complete') break;
        }
    }

    applyBitrateConstraint(sender, bitrate) {
        const parameters = sender.getParameters();
        if (!parameters.encodings) {
            parameters.encodings = [{}];
        }

        // Tek bir encoding varsa
        if (parameters.encodings.length > 0) {
            parameters.encodings.forEach(encoding => encoding.maxBitrate = bitrate);
        }

        // Parametreleri uygula
        return sender.setParameters(parameters);
    }

    preferCodec(sdp, type, codec) {
        const sections = sdp.split('\r\nm=');
        const mLineIndex = sections.findIndex(line => line.trim().startsWith(`${type} `));

        if (mLineIndex === -1) {
            return sdp;
        }

        const section = sections[mLineIndex];
        const lines = section.split('\r\n');
        const codecRegExp = new RegExp(`a=rtpmap:(\\d+) ${codec}\\/\\d+`);

        const codecLine = lines.find(line => codecRegExp.test(line));
        if (!codecLine) {
            return sdp;
        }

        const codecId = codecRegExp.exec(codecLine)[1];
        const mLine = lines[0].split(' ');
        const payloadTypes = mLine.slice(3);

        // Tercih edilen codec'i öne al
        payloadTypes.splice(payloadTypes.indexOf(codecId), 1);
        payloadTypes.unshift(codecId);
        mLine.splice(3, payloadTypes.length, ...payloadTypes);
        lines[0] = mLine.join(' ');

        sections[mLineIndex] = lines.join('\r\n');
        return sections.join('\r\nm=');
    }

    static isScreenShareSupport() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
    }

    supportedConstraints(constraints) {
        const supported = navigator.mediaDevices.getSupportedConstraints();
        return Object.keys(constraints).reduce((acc, key) => {
            if (supported[key]) acc[key] = constraints[key];
            return acc;
        }, {});
    };
}

export default WebRTC;
