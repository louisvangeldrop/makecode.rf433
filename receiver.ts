/************************************
 * Sensor Receiver class
 ***********************************/
// import * as piGpio from "./gpio/piGpio";
// import { Gpio } from "pigpio";

export class EspruinoReceiver {
  private receiver;
  private enabled: boolean;
  private startTick: number;
  private edgeTimeStamp: Uint32Array
  private diffArray: number[]
  private diffArrrayMaxLength: number
  private levels: number[]
  private short_delay: number; //260   // T microseconds. Volgens NewRemoteSwitch zelfs 260 microseconds
  private long_delay: number // 2T (twice as long as a 'short')
  private stopPulse: number // 40T Stop pulse
  private startPulse: number  // Start pulse
  private pulseWidth: number; // 5T
  private startFound: boolean;
  private missed: number
  private diff: number;

  private decode = (data: number[]) => {
    //debugger
  };

  constructor(
    public receiverPin: number,
    public callBack: (data, levels) => void,
    public gpioRcv
  ) {

    this.edgeTimeStamp = new Uint32Array(3); //[startTick, 0, 0]
    this.diffArray = new Array();
    this.diffArrrayMaxLength = 20;
    this.levels = new Array();
    this.short_delay = 260; //260   // T microseconds. Volgens NewRemoteSwitch zelfs 260 microseconds
    this.long_delay = 3 * this.short_delay; // 2T (twice as long as a 'short')
    this.stopPulse = 40 * this.short_delay; // 40T Stop pulse
    this.startPulse = 10.44 * this.short_delay; // Start pulse
    this.pulseWidth = 5 * this.short_delay; // 5T
    this.startFound = false;
    this.missed = 0;

  }

  public init = () => {
    this.receiver = new this.gpioRcv(this.receiverPin, {
      mode: this.gpioRcv.INPUT,
      alert: true,
      edge: this.gpioRcv.EITHER_EDGE
    });
    this.receiver.on("alert", (level, tick) =>
      this.interruptHandler(level, tick)
    );
    this.startTick = process.hrtime[1];
    this.enable = true;
  };

  public get enable(): boolean {
    return this.enabled;
  }

  public set enable(value) {
    this.enabled = value;
    if (value) {
      try {
        this.receiver.enableAlert();
      } catch {
        // this.init()  // kan tot een oneindige loop leiden
      }
    } else {
      try {
        this.receiver.disableAlert();
      } catch { }
    }
  }

  // Use alerts to determine the microseconds interval.

  /**
   * get alerts from rf433 pin
   * @parm {string} [level] on/off value of pin
   * @parm {number} [tick] absolute time in microseconds
   * @return {Array} nothing
   */
  public interruptHandler = (level: number, tick: number) => {
    if (!this.enable) return;

    this.diff = (tick >> 0) - (this.startTick >> 0); // Unsigned 32 bit arithmetic
    this.startTick = tick;
    if (this.diff > this.startPulse) {
      this.startFound = true;
    }
    if (!this.startFound) return;
    if (this.diff < this.short_delay || this.diff > this.long_delay) {
      this.missed += 1;
      if (this.diffArray.length > this.diffArrrayMaxLength) {
        this.decode(this.diffArray);
        this.missed = 0;
        this.startFound = false;
        this.callBack(this.diffArray, this.levels);
        this.diffArray = new Array();
        this.levels = new Array();
      }
    } // kijken we of we data hebben
    else {
      //else if (!level)
      // console.log(diff)
      this.diffArray.push(this.diff); //0 | <any>(diff > 200))
      this.levels.push(level);
    }
  };
}

export enum switchType {
  off = 0,
  on = 1,
  dim = 2
}

export interface RemoteCode {
  period: number; // Detected duration in microseconds of 1T in the received signal
  address: number; // Address of received code. [0..2^26-1]
  groupBit: boolean; // Group bit set or not
  switchType: switchType; // off, on, dim, on_with_dim.
  unit: number; // Unit code of received code [0..15]
  dimLevelPresent: boolean; // Dim level present or not. Will be available for switchType dim, but might be available for on or off too, depending on remote.
  dimLevel: number; // Dim level [0..15]. Will be available if switchType is dim, on_with_dim or off_with_dim.
}

export class RemoteReceiver {
  //#region Private var's
  private _state: number;
  private _callBack;
  // private _receiver: piGpio.DigitalPin;
  private _inCallback
  private _enabled = false;
  private _watcher: number;
  private B00: number
  private B0000: number
  private B0001: number
  private B0100: number
  private B1: number
  private B10 = 0b10;
  private B1110: number
  private B1111 = 0b1111;
  private duration: number
  private receivedBit: number; // Contains "bit" currently receiving
  private receivedCode: RemoteCode  // Contains received code
  private previousCode: RemoteCode; // Contains previous received code
  private repeats: number// The number of times the an identical code is received in a row.
  // private edgeTimeStamp = [0, 0, 0]; // Timestamp of edges
  private min1Period: number
  private max1Period: number
  private min5Period: number
  private max5Period: number
  private startPulse: number
  private stopPulse: number
  private skip: boolean;
  //#endregion

  private state = () => this._state;

  private RESET_STATE = function () {
    this._state = -1;
  };

  constructor(
    public pin,
    public minRepeats = 2,
    public shortPeriod = 200 /* public options = {
      mode: piGpio.INPUT,
      alert: true,
      edge: piGpio.gpio.EITHER_EDGE,
      pullUpDown: piGpio.PUD_UP
    } */
  ) {
    /* this._receiver = piGpio.open(pin, options);
    // this._receiver.glitchFilter(shortPeriod); // skip alle ruis tot de shortPeriod. NoiseFilter is beter, maar nog niet beschikbaar
    this.edgeTimeStamp[0] = micros(); */
    this._inCallback = false;
    this._enabled = false;
    this.B00 = 0b0;
    this.B0000 = 0b0;
    this.B0001 = 0b0001;
    this.B0100 = 0b0100;
    this.B1 = 0b1;
    this.B10 = 0b10;
    this.B1110 = 0b1110;
    this.B1111 = 0b1111;
    this.duration = 0;
    this.receivedBit = 0; // Contains "bit" currently receiving
    this.receivedCode = <RemoteCode>{}; // Contains received code
    this.previousCode = <RemoteCode>{}; // Contains previous received code
    this.repeats = 0; // The number of times the an identical code is received in a row.

    this.min1Period = 0;
    this.max1Period = 0;
    this.min5Period = 0;
    this.max5Period = 0;
    this.startPulse = 10 * this.shortPeriod + (this.shortPeriod >> 1);
    this.stopPulse = 40 * this.shortPeriod; // 40T Stop pulse
  }

  init(callback) {
    this._callBack = callback;

    this.enable();
    /* if (this.pin >= 0) {
      this._receiver = piGpio.open(this.pin, this.options);
      this._receiver.glitchFilter(this.shortPeriod); // skip alle ruis tot de shortPeriod. NoiseFilter is beter, maar nog niet beschikbaar
      this.edgeTimeStamp[0] = micros();

      piGpio.setWatch(this._receiver, (level: number, tick: number) =>
        this.interruptHandler(level, tick)
      );
      // this._receiver.on('alert', (level, tick) => this.interruptHandler(level, tick))
    } */
  }

  get callback() {
    return this._callBack;
  }

  set callback(callback) {
    this._callBack = callback;
  }

  public enable() {
    this.RESET_STATE();
    // receiver.enableAlert()
    this._enabled = true;
  }

  public disable() {
    this._enabled = false;
  }

  /* public deinit() {
    this._enabled = false;
    if (this.pin >= 0) {
      this._receiver.disableAlert();
    }
  } */

  public interruptHandler(level: number, tick: number) {
    // This method is written as compact code to keep it fast. While breaking up this method into more
    // methods would certainly increase the readability, it would also be much slower to execute.
    // Making calls to other methods is quite expensive on AVR. As These interrupt handlers are called
    // many times a second, calling other methods should be kept to a minimum.

    if (!this._enabled) {
      return;
    }

    // edgeTimeStamp[0] = 0

    // Filter out too short pulses. This method works as a low pass filter.
    /* this.edgeTimeStamp[1] = this.edgeTimeStamp[2]; // edgeTimeStamp[1] = edgeTimeStamp[2];
    this.edgeTimeStamp[2] = tick; // - e.lastTime)  // in microseconds */

    if (this.skip) {
      this.skip = false;
      return;
    }

    if (
      this._state >= 0 &&
      tick < this.min1Period // this.edgeTimeStamp[2] >> 0) - (this.edgeTimeStamp[1] >> 0
    ) {
      // Last edge was too short.
      // Skip this edge, and the next too.
      this.skip = true;
      return;
    }

    // duration decalaratie hoort hier
    this.duration = 0 | tick;
    /*  0 | ((this.edgeTimeStamp[1] >> 0) - (this.edgeTimeStamp[0] >> 0));
    this.edgeTimeStamp[0] = this.edgeTimeStamp[1];
 */
    // Note that if state>=0,this.durtion is always >= 1 period.

    if (this._state == -1) {
      // wait for the long low part of a stop bit.
      // Stopbit: 1T high, 40T low
      // By default 1T is 260µs, but for maximum compatibility go as low as 120µs
      if (
        this.duration > this.stopPulse &&
        this.duration < 4 * this.stopPulse
      ) {
        // 10.44Y*260µs, minimal time between two edges before decoding starts.
        // Sync signal received.. Preparing for decoding
        this.repeats = 0;

        this.receivedCode.period = 0 | (this.duration / 40); // Measured signal is 40T, so 1T (period) is measured signal / 40.

        // Allow for large error-margin. ElCheapo-hardware :(
        this.min1Period = 0 | (this.receivedCode.period * (3 / 10)); // Lower limit for 1 period is 0.3 times measured period; high signals can "linger" a bit sometimes, making low signals quite short.
        this.max1Period = this.receivedCode.period * 3; // Upper limit for 1 period is 3 times measured period
        this.min5Period = this.receivedCode.period * 3; // Lower limit for 5 periods is 3 times measured period
        this.max5Period = this.receivedCode.period * 8; // Upper limit for 5 periods is 8 times measured period
      } else {
        return;
      }
    } else if (this._state == 0) {
      // Verify start bit part 1 of 2
      // Duration must be ~1T
      if (this.duration > this.max1Period) {
        this.RESET_STATE();
        return;
      }
      // Start-bit passed. Do some clean-up.
      this.receivedCode.address = this.receivedCode.unit = this.receivedCode.dimLevel = 0;
    } else if (this._state == 1) {
      // Verify start bit part 2 of 2
      // Duration must be ~10.44T
      if (
        this.duration < 7 * this.receivedCode.period ||
        this.duration > 15 * this.receivedCode.period
      ) {
        this.RESET_STATE();
        return;
      }
    } else if (this._state < 148) {
      // state 146 is first edge of stop-sequence. All bits before that adhere to default protocol, with exception of dim-bit
      this.receivedBit <<= 1;
      this.receivedBit &= 255; // Clear LSB of receivedBit
      // One bit consists out of 4 bit parts.
      // bit part durations can ONLY be 1 or 5 periods.
      if (this.duration <= this.max1Period) {
        this.receivedBit &= this.B1110; // Clear LSB of receivedBit
      } else if (
        this.duration >= this.min5Period &&
        this.duration <= this.max5Period
      ) {
        this.receivedBit |= this.B1; // Set LSB of receivedBit
      } else if (
        // Check if duration matches the second part of stopbit (duration must be ~40T), and ...
        this.duration >= 20 * this.receivedCode.period &&
        this.duration <= 100 * this.receivedCode.period &&
        // if first part op stopbit was a short signal (short signal yielded a 0 as second bit in receivedBit), and ...
        (this.receivedBit & this.B10) == this.B00 &&
        // we are in a state in which a stopbit is actually valid, only then ...
        (this._state == 147 || this._state == 131)
      ) {
        // If a dim-level was present...
        if (this._state == 147) {
          // mark received switch signal as signal-with-dim
          this.receivedCode.dimLevelPresent = true;
        }

        // a valid signal was found!
        if (
          this.receivedCode.address != this.previousCode.address ||
          this.receivedCode.unit != this.previousCode.unit ||
          this.receivedCode.dimLevelPresent !=
          this.previousCode.dimLevelPresent ||
          this.receivedCode.dimLevel != this.previousCode.dimLevel ||
          this.receivedCode.groupBit != this.previousCode.groupBit ||
          this.receivedCode.switchType != this.previousCode.switchType
        ) {
          // memcmp isn't deemed safe
          this.repeats = 0;
          this.previousCode = this.receivedCode;
        }

        this.repeats++;

        if (this.repeats >= this.minRepeats) {
          if (!this._inCallback) {
            this._inCallback = true;
            this._callBack(this.receivedCode);
            this._inCallback = false;
          }
          // Reset after callback.
          this.RESET_STATE();
          return;
        }

        // Reset for next round
        this._state = 0; // no need to wait for another sync-bit!
        return;
      } else {
        // Otherwise the entire sequence is invalid
        this.RESET_STATE();
        return;
      }

      if (this._state % 4 == 1) {
        // Last bit part? Note: this is the short version of "if ( (_state-2) % 4 == 3 )"
        // There are 3 valid options for receivedBit:
        // 0, indicated by short short short long == B0001.
        // 1, short long shot short == B0100.
        // dim, short shot short shot == B0000.
        // Everything else: inconsistent data, trash the whole sequence.

        if (this._state < 106) {
          // States 2 - 105 are address bit states

          this.receivedCode.address <<= 1;

          // Decode bit. Only 4 LSB's of receivedBit are used; trim the rest.
          switch (this.receivedBit & this.B1111) {
            case this.B0001: // Bit "0" received.
              //this.receivedCode.address |= 0; But let's not do that, as it is wasteful.
              break;
            case this.B0100: // Bit "1" received.
              this.receivedCode.address |= 1;
              break;
            default:
              // Bit was invalid. Abort.
              this.RESET_STATE();
              return;
          }
        } else if (this._state < 110) {
          // States 106 - 109 are group bit states.
          switch (this.receivedBit & this.B1111) {
            case this.B0001: // Bit "0" received.
              this.receivedCode.groupBit = false;
              break;
            case this.B0100: // Bit "1" received.
              this.receivedCode.groupBit = true;
              break;
            default:
              // Bit was invalid. Abort.
              this.RESET_STATE();
              return;
          }
        } else if (this._state < 114) {
          // States 110 - 113 are switch bit states.
          switch (this.receivedBit & this.B1111) {
            case this.B0001: // Bit "0" received.
              this.receivedCode.switchType = switchType.off;
              break;
            case this.B0100: // Bit "1" received. Note: this might turn out to be a on_with_dim signal.
              this.receivedCode.switchType = switchType.on;
              break;
            case this.B0000: // Bit "dim" received.
              this.receivedCode.switchType = switchType.dim;
              break;
            default:
              // Bit was invalid. Abort.
              this.RESET_STATE();
              return;
          }
        } else if (this._state < 130) {
          // States 114 - 129 are unit bit states.
          this.receivedCode.unit <<= 1;
          // Decode bit.
          switch (this.receivedBit & this.B1111) {
            case this.B0001: // Bit "0" received.
              //this.receivedCode.unit |= 0; But let's not do that, as it is wasteful.
              break;
            case this.B0100: // Bit "1" received.
              this.receivedCode.unit |= 1;
              break;
            default:
              // Bit was invalid. Abort.
              this.RESET_STATE();
              return;
          }
        } else if (this._state < 146) {
          // States 130 - 145 are dim bit states.
          // Depending on hardware, these bits can be present, even if switchType is NewRemoteCode::on or NewRemoteCode::off

          this.receivedCode.dimLevel <<= 1;
          this.receivedCode.dimLevel &= 255;
          // Decode bit.
          switch (this.receivedBit & this.B1111) {
            case this.B0001: // Bit "0" received.
              //this.receivedCode.dimLevel |= 0; But let's not do that, as it is wasteful.
              break;
            case this.B0100: // Bit "1" received.
              this.receivedCode.dimLevel |= 1;
              break;
            default:
              // Bit was invalid. Abort.
              this.RESET_STATE();
              return;
          }
        }
      }
    }

    this._state++;
    return;
  }

  public isReceiving(waitMillis: number): boolean {
    let startTime = process.hrtime();

    let waited; // Signed int!
    do {
      if (this._state >= 34) {
        // Abort if a significant part of a code (start pulse + 8 bits) has been received
        return true;
      }
      waited = process.hrtime(startTime)[1] / 1e6;
    } while (waited >= 0 && waited <= waitMillis); // Yes, clock wraps every 50 days. And then you'd have to wait for a looooong time.

    return false;
  }
}

export function micros() {
  let time = process.hrtime();
  return time[1] / 1000; //time[0] * 1e6 + time[1] / 1000
}
