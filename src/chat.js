import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";
import "./chat.css";
import process from "process";
window.process = process;

const Chat = () => {
  const [status, setStatus] = useState("disconnected");
  const [room, setRoom] = useState("");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [file, setFile] = useState(null); // file is null by default

  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // initializeMedia: Try to use device camera & mic; if unavailable and a file is provided, use it.
  const initializeMedia = useCallback(async () => {
    try {
      let stream;
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          // Attempt to get media from the device's camera and microphone.
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          console.log("Using device camera and microphone");
        } catch (err) {
          console.warn("getUserMedia failed. Falling back to file stream if available.", err);
          // Fallback: If a file is provided, use it.
          if (file) {
            stream = await getStreamFromFile(file);
          } else {
            throw new Error("No camera/microphone available and no file provided");
          }
        }
      } else {
        // Fallback if getUserMedia is not supported.
        if (file) {
          stream = await getStreamFromFile(file);
        } else {
          throw new Error("No media available on this device");
        }
      }
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      console.error("Error initializing media:", error);
      throw error;
    }
  }, [file]);

  // Helper function: Get a stream from a selected video file.
  const getStreamFromFile = async (file) => {
    return new Promise((resolve, reject) => {
      const videoURL = URL.createObjectURL(file);
      const videoElement = document.createElement("video");
      videoElement.src = videoURL;
      videoElement.muted = true; // required for autoplay
      videoElement.onloadedmetadata = async () => {
        try {
          await videoElement.play();
          const stream = videoElement.captureStream();
          resolve(stream);
        } catch (err) {
          reject(err);
        }
      };
      videoElement.onerror = (err) => reject(err);
      videoElement.load();
    });
  };

  // If a file is selected, we attempt to initialize media from it (if device media wasn’t already used).
  useEffect(() => {
    if (file) {
      initializeMedia().catch((err) =>
        console.error("Error initializing media with file fallback:", err)
      );
    }
  }, [file, initializeMedia]);

  const startChat = async () => {
    try {
      const stream = await initializeMedia();
      setStatus("waiting");
      socketRef.current = io("https://chatappbackend-yhpt.onrender.com");

      socketRef.current.on("connect", () => {
        console.log("Socket connected");
      });

      socketRef.current.on("waiting", () => setStatus("waiting"));

      socketRef.current.on("paired", (data) => {
        setRoom(data.room);
        setStatus("paired");

        const peer = new Peer({
          initiator: data.isInitiator,
          stream: stream, // use the stream from initializeMedia
          config: {
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
          },
        });

        peer.on("signal", (signal) => {
          console.log("Sending signal:", signal);
          socketRef.current.emit("webrtc-signal", {
            room: data.room,
            signal,
          });
        });

        peer.on("stream", (remoteStreamReceived) => {
          setRemoteStream(remoteStreamReceived);
          console.log("Remote stream received:", remoteStreamReceived);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStreamReceived;
          }
        });

        peer.on("error", (error) => {
          console.error("WebRTC error:", error);
        });

        peerRef.current = peer;
      });

      socketRef.current.on("webrtc-signal", (signal) => {
        console.log("Received signal:", signal);
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
            animate: true,
          },
        ]);
        handleDisconnect();
      });

      socketRef.current.on("notification", (data) => {
        setChat((prevChat) => [
          ...prevChat,
          { text: data.message, isSystem: true },
        ]);
      });
    } catch (error) {
      console.error("Error starting chat:", error);
    }
  };

  const handleDisconnect = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
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
          {remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={styles.remoteVideo}
            />
          ) : (
            <p>No remote stream</p>
          )}

          <input
            type="file"
            accept="video/*"
            onChange={(e) => {
              const selectedFile = e.target.files[0];
              console.log("File selected:", selectedFile);
              setFile(selectedFile);
            }}
          />

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
              <button style={styles.cancelPopupButton} onClick={closeConfirmPopup}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  fullContainer: {
    // Your container styles
  },
  chatContainer: {
    // Your chat container styles
  },
  chatHeader: {
    // Your header styles
  },
  videoContainer: {
    position: "relative",
    width: "100%",
    height: "300px",
    backgroundColor: "#000",
    borderBottom: "2px solid #ddd",
  },
  remoteVideo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  localVideo: {
    position: "absolute",
    bottom: "20px",
    right: "20px",
    width: "120px",
    height: "90px",
    borderRadius: "8px",
    border: "2px solid white",
    objectFit: "cover",
    zIndex: 1,
  },
  messagesContainer: {
    // Your messages container styles
  },
  messageBubble: {
    // Your message bubble styles
  },
  systemMessage: {
    // Your system message styles
  },
  animatedSystemMessage: {
    // Your animated system message styles
  },
  myMessage: {
    // Your "my message" styles
  },
  partnerMessage: {
    // Your partner message styles
  },
  inputContainer: {
    // Your input container styles
  },
  inputField: {
    // Your input field styles
  },
  sendButton: {
    // Your send button styles
  },
  popupOverlay: {
    // Your popup overlay styles
  },
  popupContainer: {
    // Your popup container styles
  },
  popupButtons: {
    // Your popup buttons styles
  },
  confirmButton: {
    // Your confirm button styles
  },
  cancelPopupButton: {
    // Your cancel popup button styles
  },
};

export default Chat;
