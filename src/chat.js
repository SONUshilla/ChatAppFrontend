import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import "./chat.css";

const Chat = () => {
  // Chat-related state
  const [status, setStatus] = useState("disconnected"); // "disconnected", "waiting", "paired"
  const [room, setRoom] = useState("");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);

  // Video call related state
  const [callActive, setCallActive] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // Refs for socket, peer connection, video elements, auto-scrolling
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Scroll to bottom when chat changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // Start chat (text pairing and Socket.IO connection)
  const startChat = () => {
    setStatus("waiting");
    socketRef.current = io("https://chatappbackend-yhpt.onrender.com");

    socketRef.current.on("connect", () => {
      // Connection established
    });

    socketRef.current.on("waiting", () => setStatus("waiting"));

    socketRef.current.on("paired", (data) => {
      setRoom(data.room);
      setStatus("paired");
    });

    socketRef.current.on("message", (msg) =>
      setChat((prev) => [...prev, { text: msg, isMe: false }])
    );

    // Instead of alerting, show a system message that partner disconnected.
    socketRef.current.on("partner-disconnected", () => {
      setChat((prev) => [
        ...prev,
        {
          text: "Partner has disconnected. Searching for new partner...",
          isSystem: true,
          animate: true
        }
      ]);
    });

    socketRef.current.on("notification", (data) => {
      setChat((prev) => [...prev, { text: data.message, isSystem: true }]);
    });

    // Video call signaling: video-offer
    socketRef.current.on("video-offer", async (data) => {
      // If not already in a call, start the video call as non-initiator.
      if (!pcRef.current) {
        await startVideoCall(false);
      }
      try {
        await pcRef.current.setRemoteDescription(data.sdp);
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socketRef.current.emit("video-answer", {
          room,
          sdp: pcRef.current.localDescription
        });
      } catch (err) {
        console.error("Error handling video-offer", err);
      }
    });

    socketRef.current.on("video-answer", async (data) => {
      try {
        await pcRef.current.setRemoteDescription(data.sdp);
      } catch (err) {
        console.error("Error handling video-answer", err);
      }
    });

    socketRef.current.on("new-ice-candidate", async (data) => {
      try {
        await pcRef.current.addIceCandidate(data.candidate);
      } catch (err) {
        console.error("Error adding ICE candidate", err);
      }
    });
  };

  // Video call setup: startVideoCall initializes media and RTCPeerConnection.
  // The 'initiator' flag indicates if this client should create an offer.
  const startVideoCall = async (initiator = true) => {
    setCallActive(true);
    try {
      // Get user media (video and audio)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      // Create RTCPeerConnection with a STUN server
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      pcRef.current = pc;

      // Add local stream tracks to the connection
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // When remote track is received, display it
      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      // ICE candidate handling: send candidate via Socket.IO
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit("new-ice-candidate", {
            room,
            candidate: event.candidate
          });
        }
      };

      // If this client initiates the call, create an offer.
      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current.emit("video-offer", {
          room,
          sdp: pc.localDescription
        });
      }
    } catch (err) {
      console.error("Error starting video call", err);
    }
  };

  // End chat: disconnect from Socket.IO and clean up media and connection
  const endChat = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    setStatus("disconnected");
    setRoom("");
    setChat([]);
    setMessage("");
    setCallActive(false);
    setShowConfirmPopup(false);
  };

  // Handle sending text messages
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (message.trim() && room) {
      socketRef.current.emit("message", { room, message });
      setChat((prev) => [...prev, { text: message, isMe: true }]);
      setMessage("");
    }
  };

  // Popup controls
  const openConfirmPopup = () => {
    setShowConfirmPopup(true);
  };

  const closeConfirmPopup = () => {
    setShowConfirmPopup(false);
  };

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
          <h3 style={styles.headerTitle}>Omegle</h3>
        </header>
        <div style={styles.messagesContainer}>
          {chat.map((msg, index) => (
            <div
              key={index}
              style={{
                ...styles.messageBubble,
                ...(msg.isSystem
                  ? {
                      ...styles.systemMessage,
                      ...(msg.animate ? styles.animatedSystemMessage : {})
                    }
                  : msg.isMe
                  ? styles.myMessage
                  : styles.partnerMessage)
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
        {/* Video call UI */}
        {callActive && (
          <div style={styles.videoContainer}>
            <video ref={localVideoRef} autoPlay muted style={styles.localVideo} />
            <video ref={remoteVideoRef} autoPlay style={styles.remoteVideo} />
          </div>
        )}
        <div style={styles.callControls}>
          {/* Show start video call button when chat is paired and no call is active */}
          {!callActive && status === "paired" && (
            <button style={styles.callButton} onClick={() => startVideoCall(true)}>
              Start Video Call
            </button>
          )}
          {callActive && (
            <button
              style={styles.callButton}
              onClick={() => {
                // End video call but keep text chat active
                if (pcRef.current) {
                  pcRef.current.close();
                  pcRef.current = null;
                }
                if (localStream) {
                  localStream.getTracks().forEach((track) => track.stop());
                }
                setCallActive(false);
                setLocalStream(null);
                setRemoteStream(null);
              }}
            >
              End Video Call
            </button>
          )}
        </div>
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
    width: "100%",
    height: "100vh",
    backgroundColor: "#f5f5f5",
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  },
  chatContainer: {
    width: "100%",
    maxWidth: "100vw",
    height: "100%",
    backgroundColor: "#fff",
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative"
  },
  chatHeader: {
    display: "flex",
    justifyContent: "start",
    alignItems: "center",
    backgroundColor: "#007BFF",
    padding: "1rem",
    color: "#fff"
  },
  headerTitle: {
    margin: 0,
    fontSize: "1.2rem"
  },
  endChatButton: {
    position: "absolute",
    right: "1rem",
    padding: "0.5rem 1rem",
    backgroundColor: "#fff",
    color: "#007BFF",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontSize: "0.9rem"
  },
  messagesContainer: {
    flex: 1,
    padding: "1rem",
    overflowY: "auto",
    backgroundColor: "#f8f9fa",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem"
  },
  messageBubble: {
    maxWidth: "70%",
    padding: "0.8rem 1rem",
    borderRadius: "15px",
    wordBreak: "break-word"
  },
  myMessage: {
    backgroundColor: "#d1e7dd",
    alignSelf: "flex-end"
  },
  partnerMessage: {
    backgroundColor: "#e2e3e5",
    alignSelf: "flex-start"
  },
  systemMessage: {
    backgroundColor: "#ffeeba",
    alignSelf: "center",
    fontStyle: "italic",
    color: "#856404"
  },
  animatedSystemMessage: {
    animation: "blink 1s ease-in-out infinite"
  },
  inputContainer: {
    display: "flex",
    padding: "1rem",
    borderTop: "1px solid #dee2e6"
  },
  inputField: {
    flex: 1,
    padding: "0.8rem 1rem",
    fontSize: "1rem",
    border: "1px solid #ced4da",
    borderRadius: "25px"
  },
  sendButton: {
    marginLeft: "1rem",
    padding: "0",
    backgroundColor: "#fff",
    color: "#007BFF",
    border: "none",
    borderRadius: "50%",
    width: "40px",
    height: "40px",
    cursor: "pointer",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "2rem"
  },
  startButton: {
    padding: "1rem 2rem",
    fontSize: "1.2rem",
    backgroundColor: "#007BFF",
    color: "#fff",
    border: "none",
    borderRadius: "30px",
    cursor: "pointer"
  },
  waitingOverlay: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1rem"
  },
  spinner: {
    width: "50px",
    height: "50px",
    border: "5px solid #f3f3f3",
    borderTop: "5px solid #007BFF",
    borderRadius: "50%",
    animation: "spin 1s linear infinite" // Define keyframes in your CSS
  },
  waitingText: {
    fontSize: "1.1rem",
    color: "#555"
  },
  cancelButton: {
    padding: "0.6rem 1.2rem",
    backgroundColor: "#dc3545",
    color: "#fff",
    border: "none",
    borderRadius: "25px",
    cursor: "pointer"
  },
  videoContainer: {
    display: "flex",
    justifyContent: "space-around",
    padding: "1rem",
    backgroundColor: "#000"
  },
  localVideo: {
    width: "45%",
    borderRadius: "8px"
  },
  remoteVideo: {
    width: "45%",
    borderRadius: "8px"
  },
  callControls: {
    display: "flex",
    justifyContent: "center",
    padding: "0.5rem",
    gap: "1rem",
    backgroundColor: "#f0f0f0"
  },
  callButton: {
    padding: "0.5rem 1rem",
    backgroundColor: "#007BFF",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer"
  },
  popupOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  },
  popupContainer: {
    backgroundColor: "#fff",
    padding: "2rem",
    borderRadius: "8px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
    textAlign: "center"
  },
  popupButtons: {
    marginTop: "1rem",
    display: "flex",
    justifyContent: "center",
    gap: "1rem"
  },
  confirmButton: {
    padding: "0.5rem 1.5rem",
    backgroundColor: "#28a745",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer"
  },
  cancelPopupButton: {
    padding: "0.5rem 1.5rem",
    backgroundColor: "#dc3545",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer"
  }
};

export default Chat;
