// import * as piGpio from "./gpio/piGpio";
// import { Gpio } from "pigpio";

type byte = number;
type word = number;
export class SensorReceiver {
  /*
   * RemoteSensor library v1.0.2 (20130601) for Arduino 1.0
   *
   * This library encodes, encrypts en transmits data to
   * remote weather stations made by Hideki Electronics..
   *
   * Copyright 20112-2013 by Randy Simons http://randysimons.nl/
   *
   * Parts of this code based on Oopsje's CrestaProtocol.pdf, for which
   * I thank him very much!
   *
   * License: GPLv3. See license.txt
   */

  // _receiverPin: piGpio.DigitalPin;
  halfBit: byte;
  clockTime: word;
  isOne: boolean;
  callback;
  data: byte[];
  packageLength: byte;
  duration: word;
  enabled: boolean;

  //static variable
  halfBitCounter: byte;

  pulseLong: number

  constructor(public pin, public pulseShort = 200) {
    this.halfBit = 0;
    this.data = new Array<byte>(14);
  }

  init(callbackIn) {
    this.callback = callbackIn;
    this.enable();
  }

  interruptHandler(level: number, tick: number) {
    if (!this.enabled) {
      return;
    }

    this.duration = tick;

    if (this.halfBit == 0) {
      // Automatic clock detection. One clock-period is half the duration of the first edge.
      this.clockTime = this.duration >> 1;

      // Some sanity checking, very short (<200us) or very long (>1000us) signals are ignored.
      if (this.clockTime < this.pulseShort || this.clockTime > this.pulseLong) {
        return;
      }
      this.isOne = true;
    } else {
      // Edge is not too long, nor too short? // read as: duration < 0.5 * clockTime || duration > 3 * clockTime
      if (
        this.duration < this.clockTime >> 1 ||
        this.duration > (this.clockTime << 1) + this.clockTime
      ) {
        // Fail. Abort.
        this.reset();
        return;
      }

      // Only process every second half bit, i.e. every whole bit.
      if (this.halfBit & 1) {
        let currentByte = Math.trunc(this.halfBit / 18);
        let currentBit = (this.halfBit >> 1) % 9; // nine bits in a byte.

        if (currentBit < 8) {
          if (this.isOne) {
            // Set current bit of current byte
            this.data[currentByte] |= 1 << currentBit;
          } else {
            // Reset current bit of current byte
            this.data[currentByte] &= ~(1 << currentBit);
          }
        } else {
          // Ninth bit must be 0
          if (this.isOne) {
            // Bit is 1. Fail. Abort.
            this.reset();
            return;
          }
        }

        if (this.halfBit == 17) {
          // First byte has been received
          // First data byte must be x75.
          if (this.data[0] != 0x75) {
            this.reset();
            return;
          }
        } else if (this.halfBit == 53) {
          // Third byte has been received
          // Obtain the length of the data
          let decodedByte: byte = this.data[2] ^ (255 & (this.data[2] << 1));
          this.packageLength = (decodedByte >> 1) & 0x1f;

          // Do some checking to see if we should proceed
          if (this.packageLength < 6 || this.packageLength > 11) {
            this.reset();
            return;
          }

          this.halfBitCounter = (this.packageLength + 3) * 9 * 2 - 2 - 1; // 9 bits per byte, 2 edges per bit, minus last stop-bit (see comment above)
        }

        // Done?
        if (this.halfBit >= this.halfBitCounter) {
          if (this.halfBit == this.halfBitCounter) {
            // Yes! Decrypt and call the callback
            if (this.decryptAndCheck()) {
              this.callback(this.data);
            }
          }

          // reset
          this.halfBit = 0;
          return;
        }
      }

      // Edge is long?
      if (this.duration > this.clockTime + (this.clockTime >> 1)) {
        // read as: duration > 1.5 * clockTime
        // Long edge.
        this.isOne = !this.isOne;
        // Long edge takes 2 halfbits
        this.halfBit++;
      }
    }

    this.halfBit++;
    return;
  }

  reset() {
    this.halfBit = 1;
    this.clockTime = this.duration >> 1;
    this.isOne = true;
  }

  decryptAndCheck() {
    let cs1, cs2, i;

    cs1 = 0;
    cs2 = 0;
    for (i = 1; i < this.packageLength + 2; i++) {
      cs1 ^= this.data[i];
      cs2 = this.secondCheck(this.data[i] ^ cs2);
      this.data[i] ^= 255 & (this.data[i] << 1);
    }

    if (cs1) {
      return false;
    }

    if (cs2 != this.data[this.packageLength + 2]) {
      return false;
    }
    return true;
  }

  secondCheck(b) {
    let c;

    if (b & 0x80) b ^= 0x95;
    c = b ^ (b >> 1);
    if (b & 1) c ^= 0x5f;
    if (c & 1) b ^= 0x5f;

    return b ^ (c >> 1);
  }

  enable() {
    this.halfBit = 0;
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  decodeThermoHygro(data) {
    let channel = data[1] >> 5;

    // Internally channel 4 is used for the other sensor types (rain, uv, anemo).
    // Therefore, if channel is decoded 5 or 6, the real value set on the device itself is 4 resp 5.
    if (channel >= 5) {
      channel--;
    }

    let randomId = data[1] & 0x1f;

    let temp = 100 * (data[5] & 0x0f) + 10 * (data[4] >> 4) + (data[4] & 0x0f);
    // temp is negative?
    if (!(data[5] & 0x80)) {
      temp = -temp;
    }

    let humidity = 10 * (data[6] >> 4) + (data[6] & 0x0f);
    return {
      channel: channel,
      temperature: temp / 10,
      humidity: humidity,
      randomId: randomId
    };
  }
}

function micros() {
  let time = process.hrtime();
  return time[1] / 1000; //time[0] * 1e6 + time[1] / 1000
}
