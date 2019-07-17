// import * as gpio from "gpio";
/// <reference path="C:\\Temp\\makecode\\pxt-maker\\libs\\core---samd\\shims.d.ts"/>
/// <reference path="C:\\Temp\\makecode\\pxt-maker\\libs\\core---samd\\enums.d.ts"/>
/// <reference path="C:\\Temp\\makecode\\pxt-maker\\libs\\core---samd\\dal.d.ts"/>
/// <reference path="C:\\Temp\\makecode\\pxt-maker\\libs\\base\\shims.d.ts"/>
/// <reference path="C:\\Temp\\makecode\\pxt-maker\\libs\\arduino-zero\\device.d.ts"/>
namespace gpio {
  // export var gpio = gpio.Gpio;
  // import * as sleep from "sleep";
  // replace the following functions with wiring-pi equivalents
  export let HIGH = 1;
  export let LOW = 0;
  export let OUTPUT = 1;
  export let INPUT = 0;
  export let EITHER_EDGE = 2;
  export let PUD_DOWN = PinPullMode.PullDown;
  export let PUD_UP = PinPullMode.PullUp;
  export let PUD_OFF = PinPullMode.PullNone;
  export let lastPulse = control.millis() * 1000;
  export let init = (data: { gpiomem: boolean; mapping: string }) => { };
  export type DigitalPin = DigitalInOutPin;
  export let open = function (
    pin: number,
    options = {
      mode: INPUT,
      alert: true,
      edge: EITHER_EDGE,
      pullUpDown: PUD_OFF
    }
  ) {
    switch (pin) {
      case 0:
        return pins.D0;
      case 1:
        return pins.D1;
      case 2:
        return pins.D2;
      case 3:
        return pins.D3;
      case 4:
        return pins.D4;
      case 5:
        return pins.D5;
      case 6:
        return pins.D6;
      case 7:
        return pins.D7;
      case 8:
        return pins.D8;
      case 9:
        return pins.D9;
      case 10:
        return pins.D10;
      case 11:
        return pins.D11;
      case 12:
        return pins.D12;
      case 13:
        return pins.D13;
      default:
        return pins.D11;
    }
  };

  export let usleep = (microSeconds: number) => {
    control.waitMicros(microSeconds);
    return;
    /* let diff = process.hrtime()
          let delta = [0, 0]
          while ((delta[0] * 1e9 + delta[1]) < microSeconds * 1000) {
              delta = process.hrtime(diff)
          } */
  };

  export function setWatch(
    pin: DigitalPin,
    interruptHandler: (duration: number) => void
    // , options = {
    //     mode: this.INPUT,
    //     alert: true,
    //     edge: this.EITHER_EDGE
    // }
  ) {
    lastPulse = control.millis() * 1000;
    pin.onEvent(PinEvent.Fall, () => {
      let pd = pins.pulseDuration();
      interruptHandler(pd); //- lastPulse
      lastPulse = pd;
    });
    pin.onEvent(PinEvent.Rise, () => {
      let pd = pins.pulseDuration();
      interruptHandler(pd); //- lastPulse
      lastPulse = pd;
    });
  }

  export function clearWatch(pin: DigitalPin) {
    pin.onEvent(PinEvent.Fall, () => { });
  }

  export let write = function (pin: DigitalPin, value: number) {
    pin.digitalWrite(value == 1 ? true : false);
  };

  export function digitalPulse(
    pin: DigitalPin,
    value: number,
    width: number[]
  ) {
    for (let time of width) {
      write(pin, value);
      usleep(time); //usleep(time)
      value = value == LOW ? HIGH : LOW;
    }
  }
}
