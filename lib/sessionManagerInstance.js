import SessionManager from "./sessionManager.js";
import { createSocket } from "./createSocket.js";

const sessionManager = new SessionManager({
  createSocket
});

export default sessionManager;
