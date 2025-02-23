import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";

const VideoChat = () => {
  // State variables to manage call status, room, chat messages, and media streams.
  const [status, setStatus] = useState("disconnected");
  const [room, setRoom] = useState("");
  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState("");
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // Refs for the socket, peer connection, and video elements.
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // On component mount, get access to the user's video and audio.
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      })
      .catch((err) => console.error("Error accessing media devices:", err));
  }, []);

  // Start the call: Connect to the signaling server and set up event listeners.
  const startCall = () => {
    // Connect to the Socket.io signaling server.
    socketRef.current = io("http://localhost:5000");

    socketRef.current.on("connect", () => {
      console.log("Connected to signaling server");
      // Join a common room (here we hardcode "video-room").
      socketRef.current.emit("join-room", "video-room");
    });

    // Handle when the server indicates this client should wait for a partner.
    socketRef.current.on("waiting", () => {
      setStatus("waiting");
      console.log("Waiting for a partner...");
    });

    // When paired, the server sends the room name and a flag to indicate who is the initiator.
    socketRef.current.on("paired", (data) => {
      setRoom(data.room);
      setStatus("paired");

      // Create a new Peer instance.
      // If isInitiator is true, this peer will create the offer.
      const newPeer = new Peer({
        initiator: data.isInitiator,
        trickle: false, // Sending all signaling data at once.
        stream: localStream, // Attach our local media stream.
      });

      // When the Peer generates signaling data (offer/answer), send it via the signaling server.
      newPeer.on("signal", (signal) => {
        socketRef.current.emit("webrtc-signal", {
          room: data.room,
          signal,
        });
      });

      // When receiving a remote media stream, display it in the remote video element.
      newPeer.on("stream", (stream) => {
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      });

      // Log any errors from the Peer instance.
      newPeer.on("error", (err) => console.error("Peer error:", err));

      peerRef.current = newPeer;
    });

    // When a WebRTC signal is received from the server, pass it to the Peer instance.
    socketRef.current.on("webrtc-signal", (signal) => {
      if (peerRef.current) {
        peerRef.current.signal(signal);
      }
    });

    // Handle incoming chat messages.
    socketRef.current.on("message", (msg) => {
      setChat((prev) => [...prev, { text: msg, isMe: false }]);
    });

    // Handle system notifications (for example, when the partner is connected).
    socketRef.current.on("notification", (data) => {
      setChat((prev) => [...prev, { text: data.message, system: true }]);
    });

    // Handle partner disconnection.
    socketRef.current.on("partner-disconnected", () => {
      setChat((prev) => [
        ...prev,
        { text: "Partner has disconnected.", system: true },
      ]);
      endCall();
    });
  };

  // Send a chat message.
  const sendMessage = (e) => {
    e.preventDefault();
    if (message.trim() && room) {
      socketRef.current.emit("message", { room, message });
      setChat((prev) => [...prev, { text: message, isMe: true }]);
      setMessage("");
    }
  };

  // End the call: clean up the Peer connection, media streams, and socket.
  const endCall = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    setLocalStream(null);
    setRemoteStream(null);
    setStatus("disconnected");
    setRoom("");
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>React Video Chat</h1>

      {/* Display the Start/End Call button based on connection status */}
      {status === "disconnected" ? (
        <button onClick={startCall} style={{ padding: "10px 20px" }}>
          Start Call
        </button>
      ) : (
        <button onClick={endCall} style={{ padding: "10px 20px" }}>
          End Call
        </button>
      )}

      {/* Video elements for local and remote streams */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}>
        <video
          ref={localVideoRef}
          autoPlay
          muted
          style={{
            width: "45%",
            marginRight: "10px",
            border: "1px solid #ccc",
            borderRadius: "4px",
          }}
        />
        <video
          ref={remoteVideoRef}
          autoPlay
          style={{
            width: "45%",
            border: "1px solid #ccc",
            borderRadius: "4px",
          }}
        />
      </div>

      {/* Chat Section */}
      <div style={{ marginTop: "30px" }}>
        <h2>Chat</h2>
        <div
          style={{
            border: "1px solid #ddd",
            padding: "10px",
            height: "200px",
            overflowY: "auto",
            background: "#f9f9f9",
          }}
        >
          {chat.map((c, index) => (
            <div
              key={index}
              style={{
                textAlign: c.isMe ? "right" : "left",
                color: c.system ? "gray" : "black",
                marginBottom: "5px",
              }}
            >
              {c.text}
            </div>
          ))}
        </div>
        <form onSubmit={sendMessage} style={{ marginTop: "10px" }}>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            style={{
              padding: "8px",
              width: "70%",
              marginRight: "5px",
              border: "1px solid #ccc",
              borderRadius: "4px",
            }}
          />
          <button type="submit" style={{ padding: "8px 12px" }}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default VideoChat;
