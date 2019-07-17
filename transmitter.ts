export class Switch {
  constructor(
    public pulseHandler: (value: number, pulses: number[]) => void,
    public periodusec = 260,
    public repeats = 2,
    public pulsewidth = 5
  ) {}

  on(address: number, unit: number) {
    this.transmit(address, unit, 1);
  }

  off(address: number, unit: number) {
    this.transmit(address, unit, 0);
  }

  dim(address: number, unit: number, level: number) {
    // level tussen 0 en 15
    this.transmit(address, unit, 2, level);
  }

  groupOn(address: number) {
    this.group(address, 1);
  }

  groupOff(address: number) {
    this.group(address, 0);
  }

  group(address: number, on: number) {
    this.transmit(address, 0, on, 1);
  }

  /**
   *
   * @param address
   * @param unit
   * @param value
   * @param group
   */
  transmit(address: number, unit: number, value: number, group: number = 0) {
    let dimming = value == 2;

    // Build data packet.
    let packet = "";
    let pulses: number[] = [];
    // 26-bit address
    packet += encode(address, 26);

    // Handle dimming command.
    if (dimming) {
      packet += "02";
    } else {
      packet += "" + (group == 0 ? 0 : 1); //Number( !!group)
      packet += "" + (value == 0 ? 0 : 1); //String(Number(!!value));
    }

    // 4-bit unit number.
    packet += encode(unit, 4);

    // Add dim-level if we're dimming.
    if (dimming) {
      packet += encode(group, 4);
    }

    // debug('sending packet of length %s: %s', packet.length, packet);

    let periodusec = this.periodusec;
    let pulsewidth = this.pulsewidth;
    for (let i = 0; i < (1 << this.repeats) - 1; i++) {
      // this.sendStartPulse();
      pulses.push(this.periodusec);
      pulses.push(this.periodusec * 10 + (this.periodusec >> 1));

      for (let bit of packet) {
        switch (bit) {
          case "0":
            pulses.push(periodusec);
            pulses.push(periodusec);
            pulses.push(periodusec);
            pulses.push(periodusec * pulsewidth);
            break;
          case "1":
            pulses.push(periodusec);
            pulses.push(periodusec * pulsewidth);
            pulses.push(periodusec);
            pulses.push(periodusec);
            break;
          case "2":
            pulses.push(periodusec);
            pulses.push(periodusec);
            pulses.push(periodusec);
            pulses.push(periodusec);
            break;
        }
      }
      // this.sendStopPulse();
      pulses.push(this.periodusec);
      pulses.push(this.periodusec * 40);
    }
    this.pulseHandler(1, pulses);
    this.pulseHandler(1, [this.periodusec]); //?????? Misschien aan pulses toevoegenpulses.pusht[this.periodusec]
  }
}

export class SensorTransmitter {
  private pulses: number[];
  private previous: number;

  constructor(
    public pulseHandler: (value: number, pulses: number[]) => void,
    public randomId: number = 0
  ) {
    this.pulses = [];
    this.previous = 0;
  }

  /* Encrypt data byte to send to station */
  private encryptByte(b: number) {
    let a = 0;
    for (a = 0; b; b = (b << 1) % 256) {
      a ^= b;
    }
    return a;
  }

  /* The second checksum. gpio.INPUT is OldChecksum^NewByte */
  private secondCheck(b: number) {
    let c: number;
    if (b & 0x80) {
      b ^= 0x95;
    }
    c = b ^ (b >> 1);
    if (b & 1) {
      c ^= 0x5f;
    }
    if (c & 1) {
      b ^= 0x5f;
    }
    return b ^ (c >> 1);
  }

  /* Example to encrypt a package for sending, 
 gpio.INPUT: Buffer holds the unencrypted data. 
 Returns the number of bytes to send, 
 Buffer now holds data ready for sending. 
 */
  private encryptAndAddCheck(buffer: number[]) {
    let cs1: number, cs2: number, count: number, i: number;
    count = (buffer[2] >> 1) & 0x1f;
    cs1 = 0;
    cs2 = 0;
    for (i = 1; i < count + 1; i++) {
      buffer[i] = this.encryptByte(buffer[i]);
      cs1 ^= buffer[i];
      cs2 = this.secondCheck(buffer[i] ^ cs2);
    }
    buffer[count + 1] = cs1;
    buffer[count + 2] = this.secondCheck(cs1 ^ cs2);
    return count + 3;
  }

  /* Send one byte and keep the transmitter ready to send the next */
  private sendManchesterByte(b: number) {
    // pin: gpio.DigitalPin,
    let i: number;
    let pwm = 500;

    // Send start-bit 0.
    if (this.previous == 0) {
      if (this.pulses.length == 0) {
        this.pulses.push(pwm);
      } else {
        this.pulses[this.pulses.length - 1] += pwm;
      }
    } else {
      this.pulses.push(pwm);
    }

    this.previous = 1;
    this.pulses.push(pwm);

    /* gpio.write(this.pinVCC, 1); // power VCC
    gpio.write(this.pinTransmitter, gpio.LOW);
    gpio.usleep(pwm);
    gpio.write(this.pinTransmitter, gpio.HIGH);
    gpio.usleep(pwm);
    gpio.write(this.pinVCC, 0); // power VCC off */

    for (i = 0; i < 16; i++) {
      if (b & 1) {
        //gpio.write(this.pinTransmitter,gpio.HIGH)
        if (this.previous == 1) {
          this.pulses[this.pulses.length - 1] += pwm;
        } else {
          this.pulses.push(pwm);
          this.previous = 1;
        }
      } else {
        //gpio.write(this.pinTransmitter,gpio.LOW)
        if (this.previous == 0) {
          this.pulses[this.pulses.length - 1] += pwm;
        } else {
          this.pulses.push(pwm);
          this.previous = 0;
        }
      }
      b = ~b;
      if (i & 1) {
        b >>= 1;
      }
    }
  }

  /* Send bytes (prepared by “encryptAndAddCheck”) and pause at the end. */
  private sendManchesterPackage(data: number[], cnt: number) {
    let i: number;
    this.pulses = [];
    this.previous = 0;
    for (i = 0; i < cnt; i++) {
      this.sendManchesterByte(data[i]);
    }
    this.pulseHandler(0, this.pulses);
  }

  /**
   * Encrypts, adds checksums and transmits the data. The value of byte 3 in the data is ignored.
   */
  public sendPackage(data: number[]) {
    let buffer: number[] = []; // new Array<number>(14);
    let count: number;
    for (let temp = 0x5e; temp % 256 > 0x40; temp += 0x40) {
      /* Sends 3 packages */
      for (let i = 0; i < ((data[2] >> 1) & 0x1f) + 1; i++) {
        buffer[i] = data[i];
      }
      // memcpy(buffer, data, ((data[2] >> 1) & 0x1f) + 1)  // copy bytes

      buffer[3] = temp;

      count = this.encryptAndAddCheck(buffer); /* Encrypt, add checksum bytes */
      this.sendManchesterPackage(buffer, count); /* Send the package */
    }
  }
}

/************************************
 * Thermo / Hygro sensor transmitter
 ***********************************/
export class ThermoHygroTransmitter {
  // extends SensorTransmitter
  private sensorTM: SensorTransmitter;
  constructor(
    public pulseHandler: (value: number, pulses: number[]) => void,
    public randomId: number,
    public channel: number
  ) {
    this.sensorTM = new SensorTransmitter(pulseHandler, randomId);
    /*  gpio.init({ gpiomem: false, mapping: 'gpio' });   // Use full /dev/mem and the GPIOxx numbering
         gpio.open(transmitterPin, gpio.OUTPUT) */
  }

  sendTempHumi(temperature: number, humidity: number) {
    let buffer: number[] = []; //new Array<number>(10); // 10 bytes

    // Note: temperature is 10x the actual temperature! So, 23.5 degrees is passed as 235.

    buffer[0] = 0x75; /* Header byte */
    buffer[1] =
      (this.channel << 5) |
      this
        .randomId; /* Thermo-hygro at channel 1 (see table1)*/ /* Thermo-hygro at channel 1 (see table1)*/
    buffer[2] = 0xce; /* Package size byte for th-sensor */

    if (temperature < 0) {
      buffer[5] = 0x4 << 4; // gpio.HIGH nibble is 0x4 for sub zero temperatures...
      temperature = -temperature; // Make temperature positive
    } else {
      buffer[5] = 0xc << 4; // ...0xc for positive
    }

    // Note: temperature is now always positive!
    buffer[4] =
      (((temperature % 100) / 10) << 4) | // the "3" from 23.5
      temperature % 10; // the "5" from 23.5
    buffer[5] |= temperature / 100; // the "2" from 23.5

    buffer[6] = ((humidity / 10) << 4) | humidity % 10; // BCD encoded

    buffer[7] = 0xff; /* Comfort flag */

    this.sensorTM.sendPackage(buffer);
  }
}

function encode(value: number, len: number) {
  let n = value.toString(2);
  return new Array(len + 1).join("0").substr(n.length) + n;

  /* function encode(value: number, len: number) {
    let n = (value % 2).toString()
    while ((value = value >> 1) > 0) {
        n = (value % 2).toString() + n
    }
    let result = ""
    for (let i = 0; i < len; i++) { result += "0" }
    result = result.substr(n.length) + n;
    return result
} */
}
