/** Holds the Socket.IO server instance so services can emit without importing the server. */
let io = null;

export function setIo(instance) {
  io = instance;
}

export function getIo() {
  return io;
}
