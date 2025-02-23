import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";
import "./chat.css";

const Chat = () => {
  const [status, setStatus] = useState("disconnected");
  const [room, setRoom] = useState("");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Error accessing media devices:", error);
    }
  };

  const startChat = () => {
    initializeMedia();
    setStatus("waiting");
    socketRef.current = io("https://chatappbackend-yhpt.onrender.com");

    socketRef.current.on("connect", () => {});
    
    socketRef.current.on("waiting", () => setStatus("waiting"));
    
    socketRef.current.on("paired", (data) => {
      setRoom(data.room);
      setStatus("paired");

      const peer = new Peer({
        initiator: data.isInitiator,
        stream: localStream,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:global.stun.twilio.com:3478?transport=udp" }
          ]
        }
      });




      peer.on("signal", (signal) => {
        alert("sending signal")
        socketRef.current.emit("webrtc-signal", {
          room: data.room,
          signal
        });
      });

      peer.on("stream", (stream) => {
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      });

      peer.on("error", (error) => {
        console.error("WebRTC error:", error);
      });

      peerRef.current = peer;
    });

    socketRef.current.on("webrtc-signal", (signal) => {
      console.log(signal)
      if (peerRef.current) {
        peerRef.current.signal(signal);
      }
    });

    socketRef.current.on("message", (msg) =>
      setChat((prev) => [...prev, { text: msg, isMe: false }])
    );

    socketRef.current.on("partner-disconnected", () => {
      setChat((prev) => [
        ...prev,
        {
          text: "Partner has disconnected. Searching for new partner...",
          isSystem: true,
          animate: true
        }
      ]);
      handleDisconnect();
    });

    socketRef.current.on("notification", (data) => {
      setChat((prevChat) => [
        ...prevChat,
        { text: data.message, isSystem: true },
      ]);
    });
  };

  const handleDisconnect = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    setRemoteStream(null);
  };

  const endChat = () => {
    handleDisconnect();
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setStatus("disconnected");
    setRoom("");
    setChat([]);
    setMessage("");
    setShowConfirmPopup(false);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (message.trim() && room) {
      socketRef.current.emit("message", { room, message });
      setChat((prev) => [...prev, { text: message, isMe: true }]);
      setMessage("");
    }
  };

  const openConfirmPopup = () => setShowConfirmPopup(true);
  const closeConfirmPopup = () => setShowConfirmPopup(false);

  if (status === "waiting") {
    return (
      <div style={styles.fullContainer}>
        <div style={styles.centerContent}>
          <div style={styles.waitingOverlay}>
            <div style={styles.spinner}></div>
            <p style={styles.waitingText}>Searching for a partner...</p>
            <button style={styles.cancelButton} onClick={endChat}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.fullContainer}>
      <div style={styles.chatContainer}>
        <header style={styles.chatHeader}>
          {status === "disconnected" ? (
            <button style={styles.endChatButton} onClick={startChat}>
              Start New Chat
            </button>
          ) : (
            <button style={styles.endChatButton} onClick={openConfirmPopup}>
              End Chat
            </button>
          )}
          <h3 style={styles.headerTitle}>Video Chat</h3>
        </header>

        <div style={styles.videoContainer}>
          {remoteStream && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={styles.remoteVideo}
            />
          )}
          {localStream && (
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={styles.localVideo}
            />
          )}
        </div>

        <div style={styles.messagesContainer}>
          {chat.map((msg, index) => (
            <div
              key={index}
              style={{
                ...styles.messageBubble,
                ...(msg.isSystem
                  ? {
                      ...styles.systemMessage,
                      ...(msg.animate ? styles.animatedSystemMessage : {}),
                    }
                  : msg.isMe
                  ? styles.myMessage
                  : styles.partnerMessage),
              }}
            >
              {msg.text}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form style={styles.inputContainer} onSubmit={handleSendMessage}>
          <input
            type="text"
            placeholder="Type your message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={styles.inputField}
            autoFocus
          />
          <button type="submit" style={styles.sendButton}>
            ➤
          </button>
        </form>
      </div>

      {showConfirmPopup && (
        <div style={styles.popupOverlay}>
          <div style={styles.popupContainer}>
            <p>Are you sure you want to end the chat?</p>
            <div style={styles.popupButtons}>
              <button style={styles.confirmButton} onClick={endChat}>
                Yes
              </button>
              <button
                style={styles.cancelPopupButton}
                onClick={closeConfirmPopup}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Keep your existing styles object and add these video styles:
const styles = {
  // ... (keep all your existing styles)
  
  videoContainer: {
    position: 'relative',
    width: '100%',
    height: '300px',
    backgroundColor: '#000',
    borderBottom: '2px solid #ddd'
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  localVideo: {
    position: 'absolute',
    bottom: '20px',
    right: '20px',
    width: '120px',
    height: '90px',
    borderRadius: '8px',
    border: '2px solid white',
    objectFit: 'cover',
    zIndex: 1
  },
};

export default Chat;