export class InterruptChain {
  _sensorReceiver: any;

  constructor( ...sensorReceiver) {
    this._sensorReceiver=sensorReceiver
  }

  interruptHandler(level, tick) {
    // This method is written as compact code to keep it fast. While breaking up this method into more
    // methods would certainly increase the readability, it would also be much slower to execute.
    // Making calls to other methods is quite expensive on AVR. As These interrupt handlers are called
    // many times a second, calling other methods should be kept to a minimum.

    for (let intHandler of this._sensorReceiver) {
      (<any>intHandler).interruptHandler(level, tick);
    }
  }
}
