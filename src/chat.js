import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import "./chat.css"

const Chat = () => {
  const [status, setStatus] = useState("disconnected"); // 'disconnected', 'waiting', 'paired'
  const [room, setRoom] = useState("");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const startChat = () => {
    setStatus("waiting");
    socketRef.current = io("https://chatappbackend-yhpt.onrender.com");

    socketRef.current.on("connect", () =>{});
    socketRef.current.on("waiting", () => setStatus("waiting"));
    socketRef.current.on("paired", (data) => {
      setRoom(data.room);
      setStatus("paired");
    });
    socketRef.current.on("message", (msg) =>
      setChat((prev) => [...prev, { text: msg, isMe: false }])
    );
 // Inside your startChat function
socketRef.current.on("partner-disconnected", () => {
  setChat((prev) => [
    ...prev,
    {
      text: "Partner has disconnected. Searching for new partner...",
      isSystem: true,
      animate: true  // flag to apply animated styling
    }
  ]);
});

    socketRef.current.on("notification", (data) => {
      setChat((prevChat) => [
        ...prevChat,
        { text: data.message, isSystem: true },
      ]);
    });
  };

  const endChat = () => {
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

  const openConfirmPopup = () => {
    setShowConfirmPopup(true);
  };

  const closeConfirmPopup = () => {
    setShowConfirmPopup(false);
  };



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

  // Paired state
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

const styles = {
  fullContainer: {
    width: "100%",
    height: "100vh",
    backgroundColor: "#f5f5f5",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  centerContent: {
    textAlign: "center",
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
    position: "relative",
  },
  chatHeader: {
    position: "relative",
    display: "flex",
    justifyContent: "start",
    alignItems: "center",
    backgroundColor: "#007BFF",
    padding: "1rem",
    color: "#fff",
  },
  headerTitle: {
    margin: 0,
    fontSize: "1.2rem",
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
    fontSize: "0.9rem",
  },
  messagesContainer: {
    flex: 1,
    padding: "1rem",
    overflowY: "auto",
    backgroundColor: "#f8f9fa",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  messageBubble: {
    maxWidth: "70%",
    padding: "0.8rem 1rem",
    borderRadius: "15px",
    wordBreak: "break-word",
  },
  myMessage: {
    backgroundColor: "#d1e7dd",
    alignSelf: "flex-end",
  },
  partnerMessage: {
    backgroundColor: "#e2e3e5",
    alignSelf: "flex-start",
  },
  systemMessage: {
    backgroundColor: "#ffeeba",
    alignSelf: "center",
    fontStyle: "italic",
    color: "#856404",
  },
  inputContainer: {
    display: "flex",
    padding: "1rem",
    borderTop: "1px solid #dee2e6",
  },
  inputField: {
    flex: 1,
    padding: "0.8rem 1rem",
    fontSize: "1rem",
    border: "1px solid #ced4da",
    borderRadius: "25px",
  },
  sendButton: {
    marginLeft: "1rem",
    padding: "0rem",
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
    fontSize: "2rem",
  },
  startButton: {
    padding: "1rem 2rem",
    fontSize: "1.2rem",
    backgroundColor: "#007BFF",
    color: "#fff",
    border: "none",
    borderRadius: "30px",
    cursor: "pointer",
  },
  waitingOverlay: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1rem",
  },
  spinner: {
    width: "50px",
    height: "50px",
    border: "5px solid #f3f3f3",
    borderTop: "5px solid #007BFF",
    borderRadius: "50%",
    animation: "spin 1s linear infinite", // Define keyframes in your CSS
  },
  waitingText: {
    fontSize: "1.1rem",
    color: "#555",
  },
  cancelButton: {
    padding: "0.6rem 1.2rem",
    backgroundColor: "#dc3545",
    color: "#fff",
    border: "none",
    borderRadius: "25px",
    cursor: "pointer",
  },
  // Custom Popup styles
  popupOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  popupContainer: {
    backgroundColor: "#fff",
    padding: "2rem",
    borderRadius: "8px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
    textAlign: "center",
  },
  popupButtons: {
    marginTop: "1rem",
    display: "flex",
    justifyContent: "center",
    gap: "1rem",
  },
  confirmButton: {
    padding: "0.5rem 1.5rem",
    backgroundColor: "#28a745",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
  },
  cancelPopupButton: {
    padding: "0.5rem 1.5rem",
    backgroundColor: "#dc3545",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
  },
  animatedSystemMessage: {
    animation: "blink 1s ease-in-out infinite"
  }
};

export default Chat;
