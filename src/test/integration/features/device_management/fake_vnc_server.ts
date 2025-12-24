// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as net from 'net';

// The supported RFB protocol version.
const PROTOCOL_VERSION = Buffer.from('RFB 003.003\n');

// Represents the only supported pixel format (RR GG BB 00).
const PIXEL_FORMAT = Buffer.from([
  32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 0, 8, 16, 0, 0, 0,
]);

// Represents a red pixel.
const RED_PIXEL = Buffer.from([255, 0, 0, 0]);

enum ProtocolPhase {
  WAIT_PROTOCOL_VERSION_HANDSHAKE,
  WAIT_CLIENT_INIT,
  READY,
}

/**
 * Fake VNC server that shows a fixed red image.
 * See RFC6143 for protocol details.
 */
export class FakeVncServer {
  private readonly server: net.Server;

  constructor() {
    this.server = net.createServer((socket: net.Socket) => {
      // Close the socket when the client disconnects.
      socket.on('close', () => {
        socket.destroy();
      });

      // Ignore errors on the socket.
      socket.on('error', () => {});

      // ProtocolVersion Handshake (7.1.1, A.1)
      socket.write(PROTOCOL_VERSION);

      let buf = Buffer.alloc(0);
      let phase = ProtocolPhase.WAIT_PROTOCOL_VERSION_HANDSHAKE;

      socket.on('data', (data: Buffer) => {
        buf = Buffer.concat([buf, data]);

        if (phase === ProtocolPhase.WAIT_PROTOCOL_VERSION_HANDSHAKE) {
          // Read ProtocolVersion (7.1.1)
          const eol = buf.indexOf(0x0a);
          if (eol < 0) {
            return;
          }
          const version = buf.slice(0, eol + 1);
          if (!version.equals(PROTOCOL_VERSION)) {
            console.error(
              `FakeVncServer: unsupported protocol version ${version.toString()}`
            );
            socket.destroy();
            return;
          }
          buf = buf.slice(eol + 1);

          // Security Handshake (7.1.2)
          socket.write(Buffer.from([0, 0, 0, 1])); // no encryption

          phase = ProtocolPhase.WAIT_CLIENT_INIT;
        }
        if (phase === ProtocolPhase.WAIT_CLIENT_INIT) {
          // Read ClientInit (7.3.1)
          if (buf.length < 1) {
            return;
          }
          buf = buf.slice(1);

          // ServerInit (7.3.2)
          socket.write(Buffer.from([0, 100, 0, 100])); // 100x100
          socket.write(PIXEL_FORMAT); // pixel format
          socket.write(Buffer.from([0, 0, 0, 4]));
          socket.write('fake'); // name

          phase = ProtocolPhase.READY;
        }

        while (buf.length > 0) {
          switch (buf.readUInt8(0)) {
            case 0: {
              // SetPixelFormat (7.5.1)
              const packetSize = 20;
              if (buf.length < packetSize) {
                return;
              }
              const format = buf.slice(4, 20);
              if (!format.equals(PIXEL_FORMAT)) {
                console.error(
                  `FakeVncServer: unsupported pixel format: ${format.toString(
                    'hex'
                  )}`
                );
                socket.destroy();
                return;
              }
              buf = buf.slice(packetSize);
              break;
            }
            case 2: {
              // SetEncodings (7.5.2)
              if (buf.length < 4) {
                return;
              }
              const n = buf.readUInt16BE(2);
              const packetSize = 4 + 4 * n;
              if (buf.length < packetSize) {
                return;
              }
              buf = buf.slice(packetSize);
              break;
            }
            case 3: {
              // FramebufferUpdateRequest (7.5.3)
              const packetSize = 10;
              if (buf.length < packetSize) {
                return;
              }
              const width = buf.readUInt16BE(6);
              const height = buf.readUInt16BE(8);
              // FramebufferUpdate (7.6.1)
              socket.write(Buffer.from([0, 0, 0, 1]));
              socket.write(
                Buffer.concat([buf.slice(2, 10), Buffer.from([0, 0, 0, 0])])
              );
              for (let i = 0; i < width * height; i++) {
                socket.write(RED_PIXEL);
              }
              buf = buf.slice(packetSize);
              break;
            }
            case 4: {
              // KeyEvent (7.5.4)
              const packetSize = 8;
              if (buf.length < packetSize) {
                return;
              }
              buf = buf.slice(packetSize);
              break;
            }
            case 5: {
              // PointerEvent (7.5.5)
              const packetSize = 6;
              if (buf.length < packetSize) {
                return;
              }
              buf = buf.slice(packetSize);
              break;
            }
            case 6: {
              // ClientCutText (7.5.6)
              if (buf.length < 6) {
                return;
              }
              const len = buf.readUInt32BE(4);
              const packetSize = 4 + len;
              if (buf.length < packetSize) {
                return;
              }
              buf = buf.slice(packetSize);
              break;
            }
            default:
              console.error(
                `FakeVncServer: unsupported command ${buf.readUInt8(0)}`
              );
              socket.destroy();
              return;
          }
        }
      });
    });
  }

  dispose(): void {
    this.server.close();
  }

  async listen(listenPort?: number): Promise<void> {
    return new Promise<void>(resolve => {
      this.server.listen(listenPort ?? 0, resolve);
    });
  }

  get listenPort(): number {
    return (this.server.address() as net.AddressInfo).port;
  }
}
