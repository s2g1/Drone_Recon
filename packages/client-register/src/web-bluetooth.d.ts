/**
 * Web Bluetooth API type declarations.
 * These types cover the subset of the Web Bluetooth API used by the ARGUS system.
 */

interface BluetoothDevice {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  device: BluetoothDevice;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
}

interface BluetoothLEScan {
  stop(): void;
}

interface BluetoothAdvertisingEvent extends Event {
  device: BluetoothDevice;
  rssi: number;
  name?: string;
}

interface RequestDeviceOptions {
  acceptAllDevices?: boolean;
  filters?: Array<{ services?: string[]; name?: string; namePrefix?: string }>;
  optionalServices?: string[];
}

interface Bluetooth extends EventTarget {
  getAvailability(): Promise<boolean>;
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
  requestLEScan?(options: { acceptAllAdvertisements: boolean }): Promise<BluetoothLEScan>;
  addEventListener(type: 'advertisementreceived', listener: (event: BluetoothAdvertisingEvent) => void): void;
  addEventListener(type: string, listener: EventListener): void;
}

interface Navigator {
  bluetooth: Bluetooth;
}
