// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// This file is shared between the extension and the WebView (views/src).
// Be careful on adding imports.

// Special URL indicating that the message passing mechanism should be used
// for the communication with the VNC server.
export const MESSAGE_PASSING_URL = 'message-passing';

interface EventClientMessageBase {
  type: 'event';
}

// Notifies that VNC client code has been loaded.
export interface EventReadyClientMessage extends EventClientMessageBase {
  subtype: 'ready';
}

// Notifies that VNC client has connected to the server.
export interface EventConnectClientMessage extends EventClientMessageBase {
  subtype: 'connect';
}

// Notifies that VNC client has disconnected from the server.
export interface EventDisconnectClientMessage extends EventClientMessageBase {
  subtype: 'disconnect';
}

interface SocketClientMessageBase {
  type: 'socket';
  socketId: number;
}

// Requests to open a socket to the VNC server.
export interface SocketOpenClientMessage extends SocketClientMessageBase {
  subtype: 'open';
}

// Requests to send data to the VNC server.
export interface SocketDataClientMessage extends SocketClientMessageBase {
  subtype: 'data';
  data: string; // BASE64-encoded binary data
}

// Requests to close the connection to the VNC server.
export interface SocketCloseClientMessage extends SocketClientMessageBase {
  subtype: 'close';
}

// All messages that can be sent from client (WebView) to server (extension).
export type ClientMessage =
  | EventReadyClientMessage
  | EventConnectClientMessage
  | EventDisconnectClientMessage
  | SocketOpenClientMessage
  | SocketDataClientMessage
  | SocketCloseClientMessage;

interface EventServerMessageBase {
  type: 'event';
}

// Notifies that the VNC server has started and is ready for connections.
export interface EventReadyServerMessage extends EventServerMessageBase {
  subtype: 'ready';
}

interface SocketServerMessageBase {
  type: 'socket';
  socketId: number;
}

// Notifies that a connection to the VNC server has been opened.
export interface SocketOpenServerMessage extends SocketServerMessageBase {
  subtype: 'open';
}

// Notifies that data has been received from the VNC server.
export interface SocketDataServerMessage extends SocketServerMessageBase {
  subtype: 'data';
  data: string; // BASE64-encoded binary data
}

// Notifies that an error occurred on the connection to the VNC server.
export interface SocketErrorServerMessage extends SocketServerMessageBase {
  subtype: 'error';
  reason: string;
}

// Notifies that the connection to the VNC server has been closed.
export interface SocketCloseServerMessage extends SocketServerMessageBase {
  subtype: 'close';
}

// All messages that can be sent from server (extension) to client (WebView).
export type ServerMessage =
  | EventReadyServerMessage
  | SocketOpenServerMessage
  | SocketDataServerMessage
  | SocketErrorServerMessage
  | SocketCloseServerMessage;
