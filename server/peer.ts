// Which local user is at the other end of a loopback connection, so the server can refuse other accounts on this
// machine whatever headers they send, and control.ts can check that the server on the port is this user's: the core's
// (@organon/core/server/peer), read from /proc/net/tcp{,6}.

export { listenerOwner, socketOwner } from '@organon/core/server/peer';
